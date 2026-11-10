import { sql } from "drizzle-orm";
import { withTenant, type Db, type Tx } from "@amax/db";
import { canonical, type ServiceContext } from "@amax/core/server";
import { KeyTakenError, markSynced, syncProposal } from "../server/services";
import type { SpecRecord } from "./specclaw";
import { duplicateNumbers, skipReason } from "./duplicates";
import { planWithdrawals, refOf } from "./withdraw";
import { repoOwnerStale } from "../server/owner";
import { ownerEmailOf } from "./authors";
import { knownTime, phaseTimesOnly, repoInstant, resolveRepoPhases, storedPhasesFor } from "../server/repo-time";

export type SyncResult = { created: number; updated: number; unchanged: number; withdrawn: number; skipped: string[] };

export type Task = SpecRecord["tasks"][number];

const known = knownTime;

// 094 AC-3: the phase times to store, by the one rule (resolveRepoPhases); none stored and none read: no key.
const repoPhasesOf = (read: Record<string, string> | undefined, source: string, prior: Record<string, unknown> | undefined) => {
  // Plain times: the write resolves them again on the locked row with its own source (upsertSpecProposal).
  const phases = phaseTimesOnly(resolveRepoPhases(read, source, prior?.repoPhases));
  return phases ? { repoPhases: phases } : {};
};

// 008: a task a commit closed stays closed, so the repo's open task is merged with the stored one;
// otherwise every sync would see a "change" it can't make.
// 094 review round 2: the repo's dates are bounded here, the one place every sync path (push, self-sync) builds its
// write from: a date in the future (a skewed clock) is unknown, so the stored one stands and nothing reads as changed.
// `prior` is the stored meta, for the phase times the sender didn't read or dated in the future.
export const desired = (projectKey: string, r: SpecRecord, sha: string, stored: Task[] = [], prior?: Record<string, unknown>) => {
  const tasks = r.tasks.map((t) => ({ ...t, done: t.done || stored.some((s) => s.ref === t.ref && s.done), ...("doneAt" in t ? { doneAt: known(t.doneAt) } : {}) }));
  return {
  key: `${projectKey}-${r.number}`,
  title: r.title,
  phase: r.phase,
  tasksDone: tasks.length ? tasks.filter((t) => t.done).length : r.tasksDone,
  tasksTotal: tasks.length || r.tasksTotal,
  tasks,
  // 096 review round 1: normalised where the write is built, the same rule the write applies.
  releasedAt: repoInstant(r.releasedAt),
  // 094 AC-1: the repo's created date; null when neither the header, state.json nor git can tell (amax keeps its own).
  createdAt: known(r.createdAt),
  // 091 review round 1: no email in meta. The owner's email is read from the repo on every sync and only resolved
  // to a person then (ownerEmailOf, upsertSpecProposal), so amax never stores a committer's address.
  meta: { lane: r.lane, module: r.module, status: r.status, waiting: r.waiting, claim: r.claim, hard: r.hard, optional: r.optional, acs: r.acs, pr: r.pr, verdict: r.verdict, sha, source: r.source,
    // 094 AC-3: when each phase was reached in the repo, for the proposal's history.
    ...repoPhasesOf(r.phaseTimes, r.source, prior) },
  };
};

// The meta fields that matter for "changed?". The commit sha alone doesn't count as a change, neither
// as `sha` nor inside `source` ("main@<sha>"): only the ref name is compared (review round 2).
// Task order isn't a change either: change.md may list T26 before T25, and storage returns its own order (079).
const byRef = (a: Task, b: Task) => a.ref.length - b.ref.length || (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0);
export const fingerprint = (d: { title: string; phase: string; tasksDone: number; tasksTotal: number; tasks: Task[]; meta: Record<string, unknown> }) =>
  canonical([d.title, d.phase, d.tasksDone, d.tasksTotal, [...d.tasks].map((t) => ({ ref: t.ref, title: t.title, done: t.done })).sort(byRef), { ...d.meta, sha: null, source: refOf(d.meta.source), repoPhases: timesOf(d.meta.repoPhases) }]);
// 094: a phase's time is what changes; the read it names is carried with it (resolveRepoPhases), never a change by itself.
const timesOf = (v: unknown) => (v === undefined ? undefined : phaseTimesOnly(resolveRepoPhases(undefined, null, v)));


type Dated = Task & { doneBy?: string | null };
const differs = (a: unknown, b: string) => !a || Date.parse(String(a)) !== Date.parse(b);
/**
 * 094 AC-1, AC-2: whether the repo's dates differ from the stored ones, so a sync must write though nothing else changed:
 * its created date, or a task the sync closed (no done_by) whose tick the repo dates differently. Unknown dates don't count.
 */
export function repoDatesStale(cur: Record<string, unknown>, d: { createdAt: string | null; tasks: Task[] }) {
  if (d.createdAt && differs(cur.created_at, d.createdAt)) return true;
  const stored = new Map(((cur.tasks ?? []) as Dated[]).map((t) => [t.ref, t]));
  return d.tasks.some((t) => {
    const s = stored.get(t.ref);
    return Boolean(t.done && t.doneAt && s?.done && !s.doneBy && differs(s.doneAt, t.doneAt));
  });
}

/** A project's specclaw proposals as stored, with their tasks, for the "changed?" comparison. */
export const storedSpecRows = (tx: Tx, projectKey: string) =>
  tx.execute(sql`select p.key, p.title, p.phase, p.tasks_done, p.tasks_total, p.meta, p.source_ref, p.synced_commit_at, p.project_id, p.owner_user_id, p.owner_set_by_person, p.created_at, p.withdrawn_at,
                   (select coalesce(json_agg(json_build_object('ref', t.ref, 'title', t.title, 'done', t.done, 'doneAt', t.done_at, 'doneBy', t.done_by) order by length(t.ref), t.ref), '[]') from delivery.task t where t.proposal_id = p.id) as tasks
                 from delivery.proposal p join delivery.project pr on pr.id = p.project_id
                 where pr.key = ${projectKey} and p.source = 'specclaw'`);

/**
 * One-way import of a repo's specclaw changes into a delivery project, as a caller of sync_proposal's
 * service (008 AC-7): audited as `ctx`, the sync's service principal, and only for changed rows.
 */
export async function syncSpecclaw(db: Db, ctx: ServiceContext, opts: { projectKey: string; projectName: string; client: string; records: SpecRecord[]; sha: string; committedAt: string; confirmWithdraw?: number }): Promise<SyncResult> {
  // 091 AC-7: which stored proposals' owners no longer match what their repo names, read in the same transaction.
  const { existing, ownerStale } = await withTenant(db, ctx.tenantId, async (tx) => {
    const rows = await storedSpecRows(tx, opts.projectKey);
    const byNumber = new Map(rows.map((e) => [e.key as string, e as Record<string, unknown>]));
    const stale = new Set<string>();
    for (const r of opts.records) {
      const cur = byNumber.get(`${opts.projectKey}-${r.number}`);
      if (cur && await repoOwnerStale(tx, ctx.tenantId, cur, ownerEmailOf(r))) stale.add(`${opts.projectKey}-${r.number}`);
    }
    return { existing: rows, ownerStale: stale };
  });
  const stored = new Map(existing.map((e) => [e.key as string, e as Record<string, unknown>]));
  const byKey = new Map(stored);
  const result: SyncResult = { created: 0, updated: 0, unchanged: 0, withdrawn: 0, skipped: [] };
  const project = { name: opts.projectName, client: opts.client };
  const same: string[] = [];

  const dupes = duplicateNumbers(opts.records);
  for (const r of opts.records) {
    const cur = byKey.get(`${opts.projectKey}-${r.number}`);
    const d = desired(opts.projectKey, r, opts.sha, (cur?.tasks as Task[] | undefined) ?? [], { repoPhases: storedPhasesFor(cur) });
    byKey.delete(d.key);
    const why = skipReason(r, dupes);
    if (why) { if (!result.skipped.includes(`${d.key}: ${why.text}`)) result.skipped.push(`${d.key}: ${why.text}`); continue; }
    // A Released proposal stays Released whatever the repo says (044 AC-2), so that isn't a change.
    if (cur && fingerprint({ title: cur.title as string, phase: cur.phase === "released" ? d.phase : (cur.phase as string), tasksDone: Number(cur.tasks_done), tasksTotal: Number(cur.tasks_total), tasks: cur.tasks as Task[], meta: cur.meta as Record<string, unknown> }) === fingerprint(d) && !ownerStale.has(d.key) && !repoDatesStale(cur, d)) {
      result.unchanged++;
      same.push(d.key);
      continue;
    }
    try {
      await syncProposal(ctx, { projectKey: opts.projectKey, project, source: "specclaw", sourceRef: r.dir, committedAt: opts.committedAt, ...d, ownerEmail: ownerEmailOf(r) });
    } catch (e) {
      // A released hand-made proposal or another source holds the key: left alone and reported.
      if (!(e instanceof KeyTakenError)) throw e;
      result.skipped.push(`${d.key}: ${e.message}`);
      continue;
    }
    if (cur) result.updated++;
    else result.created++;
  }
  if (same.length) await markSynced(ctx, { projectKey: opts.projectKey, keys: same, committedAt: opts.committedAt });
  // Folders that disappeared are marked withdrawn, never deleted, by the same rule as a push (089 review). Only the refs
  // the records came from count: readSpecclaw never reads a change that exists only on a branch, so a proposal a
  // branch push made for one stays put until its change reaches main.
  const refs = new Set(opts.records.map((r) => refOf(r.source) as string));
  const plan = planWithdrawals(stored, { named: new Set(opts.records.map((r) => `${opts.projectKey}-${r.number}`)), refs, committedAt: opts.committedAt, read: opts.records.length, confirm: opts.confirmWithdraw });
  if (plan.held) result.skipped.push(`${opts.projectKey}: ${plan.held}`);
  for (const key of plan.keys) {
    const cur = byKey.get(key)!;
    // 096 final pass: the stored phases aren't sent back (they're entries, not a reader's times); the write keeps them.
    const { repoPhases: _kept, ...meta } = cur.meta as Record<string, unknown>;
    await syncProposal(ctx, {
      projectKey: opts.projectKey, project, key, title: cur.title as string, phase: cur.phase as never, tasksDone: Number(cur.tasks_done), tasksTotal: Number(cur.tasks_total),
      source: "specclaw", sourceRef: String(cur.source_ref ?? key), releasedAt: null, meta: { ...meta, withdrawn: true, sha: opts.sha }, committedAt: opts.committedAt,
    });
    result.withdrawn++;
  }
  return result;
}
