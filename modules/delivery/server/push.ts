import { sql } from "drizzle-orm";
import { z } from "zod";
import { setTenant, textArray, type Tx } from "@amax/db";
import { assertCan, can, viewerOf, type Viewer } from "@amax/auth";
import { appendAudit, defineService, ForbiddenError, getRuntime, type Emitted, type ServiceContext, type Source } from "@amax/core/server";
import { PHASES, type Phase } from "../contracts";
import { desired, fingerprint, storedSpecRows, type Task, repoDatesStale } from "../sync/import";
import { normaliseRepo, RepoUrl } from "../sync/repo-url";
import { forUserOf } from "./activity";
import { ctxFor } from "./context";
import { KeyTakenError, markSyncedRows, upsertSpecProposal } from "./services";
import { TaskInput } from "./tasks";
import { notFound } from "./refusal";
import { repoOwnerStale } from "./owner";
import { isWithdrawn } from "./readiness";
import { duplicateNumbers, skipReason } from "../sync/duplicates";
import { ownerEmailOf } from "../sync/authors";
import { SHA_RE } from "../sync/sha";
import { planWithdrawals } from "../sync/withdraw";
import { commitTime, repoPhaseTimes, repoTime, storedPhasesFor } from "./repo-time";

// 062: sync_specclaw, a repo's specclaw state pushed from a developer's machine. amax decides what it
// accepts: the project's linked repo only, a person on the project (delivery:proposal:push, not the
// unguarded delivery:proposal:sync), and only the default branch stored with the link updates every
// change; another branch updates only its own (specclaw/<NNN-slug>), since it may be cut from an older main.
// Per proposal: nothing Released, no step back a phase, nothing older than the commit it was last
// pushed from. One push is one transaction under the project's row lock, so concurrent pushes and a
// relink serialise with it, and a failure leaves nothing half applied.

const text = (n: number) => z.string().max(n);
const SpecRecordInput = z.object({
  number: z.string().regex(/^\d{3,6}$/), dir: z.string().regex(/^\d{3,6}-[a-z0-9][a-z0-9-]{0,99}$/), title: text(200).min(1), lane: text(80), module: text(200),
  phase: z.enum(PHASES), approved: z.boolean(), claim: text(80).nullable(), hard: z.array(text(8)).max(50), optional: z.array(text(8)).max(50),
  tasksDone: z.number().int().min(0).max(500), tasksTotal: z.number().int().min(0).max(500), tasks: z.array(TaskInput).max(500), acs: z.number().int().min(0).max(500),
  pr: z.string().url().max(300).nullable(), verdict: text(20).nullable(), done: z.boolean(), status: z.enum(["done", "claimed", "not approved", "blocked", "ready"]),
  waiting: z.array(text(8)).max(50), updatedAt: text(40).nullable(), releasedAt: text(40).nullable(), source: text(300), unreadable: z.boolean(),
  duplicate: z.boolean().default(false),
  owner: z.string().max(320).nullable().default(null), author: z.string().max(320).nullable().optional(),
  // 094 AC-1, AC-3: the repo's dates. Absent from an older plugin (or in the future), so amax keeps the ones it has.
  createdAt: repoTime, phaseTimes: repoPhaseTimes,
});

export const MAX_PUSH = 200;
// A commit time from a skewed clock or a hand-written payload must not make every later push "stale" (SKEW_MS, repo-time.ts).
export const PushInput = z.object({
  projectKey: z.string(), repoUrl: RepoUrl, ref: z.string().min(1).max(200), sha: z.string().regex(SHA_RE, "sha must be a commit sha (7 to 40 hex characters)"),
  committedAt: commitTime,
  dryRun: z.boolean().default(true), records: z.array(SpecRecordInput).max(MAX_PUSH),
  // 089 AC-6: the push carries every change on the default branch (not one batch of several), so a folder it doesn't
  // name is gone. Off by default: the plugin batches, and a batch can't tell a gone folder from the next batch.
  withdrawMissing: z.boolean().default(false),
  // 089 review round 2: a person confirms a held mass withdrawal by sending the count the hold named.
  confirmWithdraw: z.number().int().min(1).max(10_000).optional(),
});

/** Why a record wasn't written. `released` always, and `back` and `stale` on a branch, are standing: they
 * come back every push until main or a Prod deployment catches up. Anything else needs a person. */
type Code = "released" | "back" | "stale" | "unreadable" | "held" | "nomatch" | "duplicate";
type Counts = { created: number; updated: number; unchanged: number; withdrawn: number; ignored: number; skipped: string[]; needsReview: boolean };
export type PushResult = Counts & { outcome: "preview" | "applied" | "unchanged" | "refused"; projectKey: string; reason: string | null };

const Plan = PushInput.omit({ dryRun: true }).extend({ projectId: z.string().uuid() });
type Plan = z.infer<typeof Plan>;
type Stored = Record<string, unknown>;

class RepoRefused extends Error {}

/** What a push may not do to one proposal; null when it may go ahead. */
function refusal(d: { phase: Phase }, cur: Stored | undefined, committedAt: string, onDefault: boolean): [Code, string] | null {
  // 091 AC-4: the default branch brings a finished change amax has never stored in as Released history. Moving a
  // proposal amax has to Released stays a Prod deployment's, and a branch never releases anything.
  const history = !cur && onDefault;
  if (d.phase === "released" && cur?.phase !== "released" && !history) return ["released", "released comes from Prod deployments"];
  if (!cur) return null;
  const mark = cur.synced_commit_at ? new Date(cur.synced_commit_at as string) : null;
  if (mark && mark > new Date(committedAt)) return ["stale", `stale: last synced from a newer commit (${mark.toISOString()})`];
  if (cur.phase !== "released" && PHASES.indexOf(d.phase) < PHASES.indexOf(cur.phase as Phase)) return ["back", `would move back from ${String(cur.phase)} to ${d.phase}`];
  return null;
}

const unchanged = (cur: Stored, d: Parameters<typeof fingerprint>[0] & { phase: Phase }) =>
  fingerprint({ title: cur.title as string, phase: cur.phase === "released" ? d.phase : (cur.phase as string), tasksDone: Number(cur.tasks_done), tasksTotal: Number(cur.tasks_total), tasks: cur.tasks as Task[], meta: cur.meta as Stored }) === fingerprint(d);

/** The push's writes in `tx`; the caller commits them (apply) or rolls them back (preview). */
async function applyPush(tx: Tx, p: Plan, ctx: ServiceContext) {
  const [project] = await tx.execute(sql`select * from delivery.project where id = ${p.projectId} for update`);
  // Checked on the locked row, so a relink can't slip between this check and the writes.
  if (!project.repo_url) throw new RepoRefused(`${p.projectKey} has no linked repo: ask its PM to link ${p.repoUrl}`);
  if (project.repo_url !== p.repoUrl) throw new RepoRefused(`repo not linked to ${p.projectKey} (${p.repoUrl})`);
  const onDefault = p.ref === project.repo_default_ref;
  const own = p.ref.split("/").at(-1);
  const mine = p.records.filter((x) => onDefault || x.dir === own);
  const byKey = new Map((await storedSpecRows(tx, p.projectKey)).map((e) => [e.key as string, e as Stored]));
  const counts: Counts = { created: 0, updated: 0, unchanged: 0, withdrawn: 0, ignored: p.records.length - mine.length, skipped: [], needsReview: false };
  const dupes = duplicateNumbers(p.records);
  const skip = (key: string, [code, text]: [Code, string]) => {
    counts.skipped.push(`${key}: ${text}`);
    if (!(code === "released" || (!onDefault && (code === "back" || code === "stale")))) counts.needsReview = true;
  };
  // A branch that names none of the changes (detached HEAD, another default branch) syncs nothing: say so.
  if (!onDefault && !mine.length) skip(p.ref, ["nomatch", `not the default branch (${String(project.repo_default_ref)}) and no change is named ${own}`]);
  const events: Emitted[] = [];
  const same: string[] = [];
  for (const r of mine) {
    const key = `${p.projectKey}-${r.number}`;
    const cur = byKey.get(key);
    // 091 AC-2: a branch holds one folder, so it can't see that the key belongs to another; the default branch may
    // rename a change (its push carries only the new folder).
    // A withdrawn proposal's folder is gone from the default branch, so its number is free again (final pass).
    // 094 AC-6: checked first, as 091 did, so a branch's key conflict is reported even when its state.json is unreadable.
    if (!onDefault && cur?.source_ref && cur.source_ref !== r.dir && !isWithdrawn(cur)) { skip(key, ["duplicate", `two changes numbered ${r.number}: ${String(cur.source_ref)}, ${r.dir}`]); continue; }
    // 092 AC-6: what the sync skips is decided by its own rule (skipReason, shared with the self-sync); the push keeps
    // its codes, and its short wording for an unreadable state.json.
    const skipWhy = skipReason(r, dupes);
    if (skipWhy) {
      const [code, text]: [Code, string] = [skipWhy.code, skipWhy.code === "unreadable" ? "state.json unreadable" : skipWhy.text];
      if (!counts.skipped.includes(`${key}: ${text}`)) skip(key, [code, text]);
      continue;
    }
    const prior = (cur?.meta ?? {}) as Stored;
    const base = desired(p.projectKey, { ...r, source: `${p.ref}@${p.sha}` }, p.sha, (cur?.tasks as Task[] | undefined) ?? [], { repoPhases: storedPhasesFor(cur) });
    // A change's branch may not have its PR link or verdict yet; main's word on them stands.
    const d = onDefault ? base : { ...base, meta: { ...base.meta, pr: base.meta.pr ?? prior.pr ?? null, verdict: base.meta.verdict ?? prior.verdict ?? null } };
    const why = refusal(d, cur, p.committedAt, onDefault);
    if (why) { skip(key, why); continue; }
    // 091 AC-7: unchanged files, but the owner the repo names may resolve differently now (a git identity linked since).
    const ownerEmail = ownerEmailOf(r);
    if (cur && unchanged(cur, d) && !repoDatesStale(cur, d) && !(await repoOwnerStale(tx, ctx.tenantId, cur, ownerEmail))) { counts.unchanged++; same.push(key); continue; }
    try {
      const out = await upsertSpecProposal(tx, { projectKey: p.projectKey, project: { name: project.name as string, client: project.client as string }, source: "specclaw", sourceRef: r.dir, committedAt: p.committedAt, ...d, ownerEmail }, ctx, project);
      await appendAudit(tx, ctx, { action: "delivery.proposal.sync", resource: "delivery.proposal", resourceId: out.resourceId, before: out.before, after: out.after });
      events.push(...out.events);
    } catch (e) {
      if (!(e instanceof KeyTakenError)) throw e;
      skip(key, ["held", e.message]);
      continue;
    }
    if (cur) counts.updated++;
    else counts.created++;
  }
  // 089 AC-6: only a push from the default branch that carries every change may withdraw, by the shared rule.
  const plan = onDefault && p.withdrawMissing
    ? planWithdrawals(byKey, { named: new Set(p.records.map((r) => `${p.projectKey}-${r.number}`)), refs: new Set([String(project.repo_default_ref)]), committedAt: p.committedAt, read: p.records.length, confirm: p.confirmWithdraw })
    : { keys: [], held: null };
  if (plan.held) skip(p.projectKey, ["held", plan.held]);
  for (const key of plan.keys) {
    const cur = byKey.get(key)!;
    const out = await upsertSpecProposal(tx, { projectKey: p.projectKey, project: { name: project.name as string, client: project.client as string }, key, title: cur.title as string,
      phase: cur.phase as Phase, tasksDone: Number(cur.tasks_done), tasksTotal: Number(cur.tasks_total), source: "specclaw", sourceRef: String(cur.source_ref ?? key), releasedAt: null,
      meta: { ...(cur.meta as Stored), withdrawn: true, sha: p.sha, source: `${p.ref}@${p.sha}` }, committedAt: p.committedAt }, ctx, project);
    await appendAudit(tx, ctx, { action: "delivery.proposal.sync", resource: "delivery.proposal", resourceId: out.resourceId, before: out.before, after: out.after });
    events.push(...out.events);
    counts.withdrawn++;
  }
  // Read at this commit too, so the mark moves for proposals that didn't change (written ones moved in the upsert).
  if (same.length) await markSyncedRows(tx, sql`project_id = ${p.projectId} and key = any(${textArray(same)})`, p.committedAt);
  return { counts, events };
}

const scope = (ctx: ServiceContext, projectId: string) => {
  const v = viewerOf(ctx);
  if (v) assertCan(v, "delivery:proposal:push", { projectId });
};

const pushRow = (tx: Tx, ctx: ServiceContext, p: Omit<Plan, "records">, c: Omit<Counts, "ignored">, outcome: "applied" | "refused", reason: string | null) =>
  tx.execute(sql`insert into delivery.sync_push (tenant_id, project_id, actor_id, actor_kind, for_user_id, repo_url, ref, sha, committed_at, outcome, created, updated, unchanged, withdrawn, needs_review, skipped, reason)
    values (${ctx.tenantId}, ${p.projectId}, ${ctx.actor.id}, ${ctx.actor.kind}, ${forUserOf(ctx)}, ${p.repoUrl}, ${p.ref}, ${p.sha}, ${p.committedAt}, ${outcome},
            ${c.created}, ${c.updated}, ${c.unchanged}, ${c.withdrawn}, ${c.needsReview}, ${JSON.stringify(c.skipped)}::jsonb, ${reason}) returning id`);

const applied = defineService({
  scoped: true,
  name: "delivery.sync.push",
  action: "delivery:proposal:push",
  resource: "delivery.sync_push",
  input: Plan,
  async run(tx, p, ctx) {
    scope(ctx, p.projectId);
    const { counts, events } = await applyPush(tx, p, ctx);
    // The Repo sync card lists pushes that changed something or need a person; a no-op is only audited.
    const listed = Boolean(counts.created || counts.updated || counts.withdrawn || counts.needsReview);
    const [row] = listed ? await pushRow(tx, ctx, p, counts, "applied", null) : [null];
    return { result: { ...counts, listed }, resourceId: (row?.id as string | undefined) ?? null,
      after: { projectId: p.projectId, ref: p.ref, sha: p.sha, created: counts.created, updated: counts.updated, unchanged: counts.unchanged, withdrawn: counts.withdrawn, skipped: counts.skipped }, events };
  },
});

// A refused push is its own audited write, so the refusal is on record although nothing synced.
const refused = defineService({
  scoped: true,
  name: "delivery.sync.refuse",
  action: "delivery:proposal:push",
  resource: "delivery.sync_push",
  input: Plan.omit({ records: true }).extend({ reason: z.string() }),
  async run(tx, p, ctx) {
    scope(ctx, p.projectId);
    const [row] = await pushRow(tx, ctx, p, { created: 0, updated: 0, unchanged: 0, withdrawn: 0, skipped: [], needsReview: false }, "refused", p.reason);
    return { result: null, resourceId: row.id as string, after: { ref: p.ref, sha: p.sha, reason: p.reason } };
  },
});

class Preview extends Error {
  constructor(readonly counts: Counts) { super("preview"); }
}

// The same writes as an apply, always rolled back: the preview can't disagree with what an apply would do.
const preview = (ctx: ServiceContext, p: Plan) =>
  getRuntime().db.transaction(async (tx) => {
    await setTenant(tx, ctx.tenantId);
    throw new Preview((await applyPush(tx, p, ctx)).counts);
  }).then(() => { throw new Error("unreachable"); }, (e: unknown) => { if (e instanceof Preview) return e.counts; throw e; });

/** sync_specclaw: preview (dryRun, the default) or apply a push, after amax's checks. */
export async function pushSpecclaw(viewer: Viewer, raw: z.input<typeof PushInput>, source: Source = "mcp"): Promise<PushResult> {
  const input = PushInput.parse(raw);
  const [p] = await getRuntime().db.transaction(async (tx) => { await setTenant(tx, viewer.tenantId); return tx.execute(sql`select id from delivery.project where key = ${input.projectKey}`); });
  if (!p) throw notFound(`no project ${input.projectKey}: a PM creates it and links its repo first`);
  if (!can(viewer, "delivery:proposal:push", { projectId: p.id as string })) throw new ForbiddenError("delivery:proposal:push", `project ${input.projectKey}`);
  const ctx = ctxFor(viewer, source);
  const { dryRun, ...rest } = input;
  const plan: Plan = { ...rest, projectId: p.id as string, repoUrl: normaliseRepo(input.repoUrl) };
  const result = (outcome: PushResult["outcome"], c: Counts, reason: string | null = null): PushResult => ({ outcome, projectKey: input.projectKey, reason, ...c });
  try {
    if (dryRun) return result("preview", await preview(ctx, plan));
    // Applied even with nothing new: the stale marks still move, as one audited write (062 review round 4).
    const { listed, ...counts } = await applied(ctx, plan);
    // "applied" whenever the push is on the Repo sync card, so the answer matches the row.
    return result(listed ? "applied" : "unchanged", counts);
  } catch (e) {
    if (!(e instanceof RepoRefused)) throw e;
    const { records: _, ...where } = plan;
    if (!dryRun) await refused(ctx, { ...where, reason: e.message });
    return result("refused", { created: 0, updated: 0, unchanged: 0, withdrawn: 0, ignored: 0, skipped: [], needsReview: false }, e.message);
  }
}
