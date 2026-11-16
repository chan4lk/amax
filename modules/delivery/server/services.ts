import { sql } from "drizzle-orm";
import { z } from "zod";
import { textArray, uuidArray, type Tx } from "@amax/db";
import { assertCan, viewerOf } from "@amax/auth";
import { appendAudit, defineService, type Emitted, type ServiceContext } from "@amax/core/server";
import { EVENTS, PHASES, releaseHref, type Phase, type ProposalPhaseChanged, type ProposalRekeyed, type ReleaseDeployed } from "../contracts";
import { ensureEnvironments } from "./project-create";
import { TaskInput, writeTasks } from "./tasks";
import { notOnProject, ownerChanged, ownerFor, ownerFromRepo, ownerFrozen } from "./owner";
import { agentFirstRefusal, agentFirstRepo } from "./agent-first";
import { invalid, notFound } from "./refusal";
import { isWithdrawn, withdrawnIn } from "./readiness";
import { liveProdDeployments } from "./in-prod";
import { commitTime, knownTime, repoInstant, repoPhasesInMeta, repoTime, resolveRepoPhases, storedPhasesFor } from "./repo-time";

const by = (ctx: ServiceContext) => ctx.onBehalfOf ? `${ctx.actor.id} for ${ctx.onBehalfOf}` : ctx.actor.id;

// Data scope: once the project is known, the viewer must be allowed to act on that project.
function scoped(ctx: ServiceContext, action: string, projectId: string) {
  const v = viewerOf(ctx);
  if (v) assertCan(v, action, { projectId });
}

async function projectByKey(tx: Tx, key: string) {
  const [p] = await tx.execute(sql`select * from delivery.project where key = ${key}`);
  if (!p) throw notFound(`no project ${key}`);
  return p;
}

// One rule for putting proposals in a release (createRelease and setReleaseProposals): every key
// must exist in the project, a proposal already shipped in another release can't be moved, and a
// release that is already live in Prod takes no new proposals, since they'd never become Released
// (final review): ship them in a new release.
// Every writer that changes proposal rows of a release locks them first, in one statement ordered by
// id: a Prod deployment, a void and an assignment then serialise on the rows they share (round 18:
// moving a proposal out of a release while it goes live), and never take them in crossing orders,
// which would deadlock (round 19).
const lockProposals = (tx: Tx, where: ReturnType<typeof sql>) => tx.execute(sql`select id from delivery.proposal where ${where} order by id for update`);

async function assignProposals(tx: Tx, projectId: unknown, releaseId: unknown, keys: string[]) {
  const [{ live }] = await tx.execute(sql`select count(*)::int as live from (${liveProdDeployments(sql`${releaseId}`)}) x`);
  await lockProposals(tx, sql`project_id = ${projectId} and key = any(${textArray(keys)})`);
  for (const key of keys) {
    // Locked above, so the phase read here is the committed one.
    const [p] = await tx.execute(sql`select id, phase, release_id, withdrawn_at, meta from delivery.proposal where key = ${key} and project_id = ${projectId}`);
    if (!p) throw notFound(`no proposal ${key} in this project`);
    if (isWithdrawn(p)) throw invalid(`${key} was withdrawn; it can't go in a release`);
    if (p.phase === "released" && p.release_id !== releaseId) throw invalid(`${key} already shipped in another release`);
    if (Number(live) > 0 && p.release_id !== releaseId) throw invalid(`this release is already live in Prod; put ${key} in a new release`);
    await tx.execute(sql`update delivery.proposal set release_id = ${releaseId} where id = ${p.id}`);
  }
}

// Every write that reads a release locks its row, so a Prod deployment and a change to its proposals
// can't interleave: proposals added to a release are either released with it or refused (final review).
async function releaseOf(tx: Tx, projectId: unknown, version: string) {
  const [r] = await tx.execute(sql`select * from delivery.release where project_id = ${projectId} and version = ${version} for update`);
  if (!r) throw notFound(`no release ${version}`);
  return r;
}

const phaseEvent = (p: Record<string, unknown>, to: Phase, ctx: ServiceContext): Emitted => ({
  name: EVENTS.proposalPhaseChanged,
  payload: { proposalId: p.id as string, key: p.key as string, projectId: p.project_id as string, from: p.phase as Phase, to, by: by(ctx), ownerUserId: (p.owner_user_id as string | null) ?? null } satisfies ProposalPhaseChanged,
});

export { createProjectService as createProject } from "./project-create";

/**
 * The next key for a proposal made by hand. In a project synced from specclaw the numeric keys belong
 * to spec changes (AMX-042 is change 042, at any number), so hand-made ones get their own series,
 * AMX-H001, and the two can never collide (review rounds 4 and 5). Call with the project row locked.
 */
async function nextHandKey(tx: Tx, projectId: string, projectKey: string, syncing = false) {
  const [{ synced, num, hand }] = await tx.execute(sql`select bool_or(source = 'specclaw') as synced,
      coalesce(max(substring(key from '-(\\d+)$')::int), 0) as num, coalesce(max(substring(key from '-H(\\d+)$')::int), 0) as hand
    from delivery.proposal where project_id = ${projectId}`);
  return synced || syncing ? `${projectKey}-H${String(Number(hand) + 1).padStart(3, "0")}` : `${projectKey}-${String(Number(num) + 1).padStart(3, "0")}`;
}

export const ProposalCreateInput = z.object({ projectKey: z.string(), title: z.string().trim().min(1).max(200), description: z.string().trim().max(4000).optional(),
  estimateHours: z.number().nonnegative().max(10_000).optional(), ownerUserId: z.string().uuid().optional() });

export const createProposal = defineService({
  scoped: true,
  name: "delivery.proposal.create",
  action: "delivery:proposal:create",
  resource: "delivery.proposal",
  input: ProposalCreateInput,
  async run(tx, input, ctx) {
    const project = await projectByKey(tx, input.projectKey);
    scoped(ctx, "delivery:proposal:create", project.id as string);
    if (project.status !== "active") throw invalid(`${input.projectKey} is closed; reopen it before adding proposals`);
    // 081 AC-5: the owner is the one named, else the person acting (an agent's or credential's person).
    const owner = await ownerFor(tx, ctx, input.ownerUserId);
    const why = owner && input.ownerUserId ? await notOnProject(tx, ctx.tenantId, owner.id, project.id as string) : null;
    if (why) throw invalid(why);
    // Next key in the project: CON-018 after CON-017. The project row lock serialises concurrent
    // creates, so two of them can't compute the same key (review round 1, B7).
    await tx.execute(sql`select 1 from delivery.project where id = ${project.id} for update`);
    // 093 AC-3: an agent-first project's proposals come from its repo, for the API and agents too. Checked under the
    // project lock a sync also takes, so a first sync landing meanwhile is seen.
    const repo = await agentFirstRepo(tx, project.id as string);
    if (repo) throw invalid(agentFirstRefusal(input.projectKey, repo));
    const key = await nextHandKey(tx, project.id as string, project.key as string);
    const [p] = await tx.execute(sql`insert into delivery.proposal (tenant_id, project_id, key, title, description, estimate_hours, owner_user_id, owner_name)
      values (${ctx.tenantId}, ${project.id}, ${key}, ${input.title}, ${input.description ?? null}, ${input.estimateHours ?? null}, ${owner?.id ?? null}, ${owner?.name ?? null}) returning id`);
    const events = ownerChanged({ id: p.id, key, title: input.title, project_id: project.id, owner_user_id: null }, owner, by(ctx));
    return { result: { id: p.id as string, key, owner: owner?.name ?? null }, resourceId: p.id as string, after: { key, ...input, ownerUserId: owner?.id ?? null }, events };
  },
});

// The board's explicit Move action. Released is reached only through a Prod deployment. A proposal
// synced from a repo takes its phase from the repo, its one owner before Released (044 AC-2).
const MoveInput = z.object({ key: z.string(), to: z.enum(PHASES.filter((p) => p !== "released") as [Phase, ...Phase[]]) });

/**
 * The board move in the caller's transaction, on the locked row: moveProposal, and an accepted delivery suggestion
 * (081 amendment 2), whose `guard` re-checks under the lock that the suggestion still fits.
 */
export async function moveIn(tx: Tx, ctx: ServiceContext, input: z.infer<typeof MoveInput>, guard: (p: Record<string, unknown>) => void = () => {}) {
  const [p] = await tx.execute(sql`select * from delivery.proposal where key = ${input.key} for update`);
  if (!p) throw notFound(`no proposal ${input.key}`);
  scoped(ctx, "delivery:proposal:move", p.project_id as string);
  if (p.phase === "released") throw invalid(`${input.key} is in Prod; it can't move back on the board`);
  if (isWithdrawn(p)) throw invalid(`${input.key} was withdrawn; it stays where it was`);
  if (p.source !== null) throw invalid(`${input.key} comes from ${p.source}; its phase follows the repo, so move it there`);
  guard(p);
  if (p.phase === input.to) return { result: { key: input.key, phase: input.to }, resourceId: p.id as string };
  await tx.execute(sql`update delivery.proposal set phase = ${input.to}, updated_at = now() where id = ${p.id}`);
  return {
    result: { key: input.key, phase: input.to },
    resourceId: p.id as string,
    before: { phase: p.phase },
    after: { phase: input.to },
    events: [phaseEvent(p, input.to, ctx)],
  };
}

export const moveProposal = defineService({
  scoped: true,
  name: "delivery.proposal.move",
  action: "delivery:proposal:move",
  resource: "delivery.proposal",
  input: MoveInput,
  run: (tx, input, ctx) => moveIn(tx, ctx, input),
});

export const createRelease = defineService({
  scoped: true,
  name: "delivery.release.create",
  action: "delivery:release:create",
  resource: "delivery.release",
  input: z.object({ projectKey: z.string(), version: z.string().min(1), proposalKeys: z.array(z.string()).default([]) }),
  async run(tx, input, ctx) {
    const project = await projectByKey(tx, input.projectKey);
    scoped(ctx, "delivery:release:create", project.id as string);
    // A version that exists (or is being created right now) is refused clearly, not as a raw unique violation.
    const [r] = await tx.execute(sql`insert into delivery.release (tenant_id, project_id, version) values (${ctx.tenantId}, ${project.id}, ${input.version})
      on conflict (project_id, version) do nothing returning id`);
    if (!r) throw invalid(`${input.projectKey} already has a release ${input.version}`);
    await assignProposals(tx, project.id, r.id, input.proposalKeys);
    return { result: { id: r.id as string }, resourceId: r.id as string, after: input };
  },
});

// A pipeline, an agent or a person records a deployment. Reaching Prod releases its proposals.
export const recordDeployment = defineService({
  scoped: true,
  name: "delivery.deployment.record",
  action: "delivery:deployment:record",
  resource: "delivery.deployment",
  input: z.object({
    projectKey: z.string(),
    version: z.string(),
    environment: z.string(),
    status: z.enum(["deployed", "testing", "rolled-back"]).default("deployed"),
    note: z.string().optional(),
    pipelineRun: z.string().optional(),
  }),
  async run(tx, input, ctx) {
    const project = await projectByKey(tx, input.projectKey);
    scoped(ctx, "delivery:deployment:record", project.id as string);
    const release = await releaseOf(tx, project.id, input.version);
    // 042: any environment of this project, not only the next one; matched by name, as pipelines report it.
    const env = await envByName(tx, project.id, input.environment);
    if (!env) throw invalid(`${input.projectKey} has no environment ${input.environment}`);
    const released = Boolean(env.is_prod) && input.status === "deployed";
    const [d] = await tx.execute(sql`insert into delivery.deployment (tenant_id, release_id, environment_id, status, note, pipeline_run, recorded_by, released)
      values (${ctx.tenantId}, ${release.id}, ${env.id}, ${input.status}, ${input.note ?? null}, ${input.pipelineRun ?? null}, ${by(ctx)}, ${released}) returning id`);
    const events: Emitted[] = [{
      name: EVENTS.releaseDeployed,
      payload: { releaseId: release.id as string, projectId: project.id as string, version: input.version, environment: env.name as string, status: input.status, released } satisfies ReleaseDeployed,
    }];
    if (released) {
      // Lock, then read, then update: the rows (and, through releaseOf, the release) are held, so the
      // set read here is exactly the set released, and each event matches a row that changed (round 20).
      await lockProposals(tx, sql`release_id = ${release.id}`);
      // 081 AC-18: a withdrawn proposal still listed in the release (a spec folder removed after it was assigned) isn't released.
      const moved = await tx.execute(sql`select * from delivery.proposal where release_id = ${release.id} and phase <> 'released' and not ${withdrawnIn("delivery.proposal")}`);
      const done = await tx.execute(sql`update delivery.proposal set phase = 'released', released_at = now(), updated_at = now()
        where id = any(${uuidArray(moved.map((p) => p.id as string))}) returning id`);
      if (done.length !== moved.length) throw new Error("proposals changed while being released");
      const prior = Object.fromEntries(moved.map((p) => [p.id as string, p.phase as Phase]));
      await tx.execute(sql`update delivery.deployment set prior_phases = ${JSON.stringify(prior)}::jsonb where id = ${d.id}`);
      events.push(...moved.map((p) => phaseEvent(p, "released", ctx)));
    }
    return { result: { id: d.id as string, released }, resourceId: d.id as string, after: input, events };
  },
});

// 039 self-sync (and later 008 ingestion): upsert one proposal from an external source. Called only
// when something changed, so an unchanged re-sync writes and audits nothing.
/** The key is held by a proposal the sync may not move; the spec change is reported, not synced. */
export class KeyTakenError extends Error {
  readonly retryable = false;
  constructor(key: string, why: string) {
    super(`${key} belongs to another proposal and can't be moved: ${why}`);
    this.name = "KeyTakenError";
  }
}

export const SyncInput = z.object({
    projectKey: z.string(),
    project: z.object({ name: z.string(), client: z.string() }),
    key: z.string(),
    title: z.string(),
    phase: z.enum(PHASES),
    tasksDone: z.number().int().nonnegative(),
    tasksTotal: z.number().int().nonnegative(),
    source: z.string(),
    sourceRef: z.string(),
    // 096 AC-4: as the reader found it, the same schema as the push's record; normalised (repoInstant) and bounded
    // (knownTime) where it's written, so every path stores the same thing.
    releasedAt: z.string().max(40).nullable(),
    // 094 review round 3: repo phase times, if any, by phase (a time, or a stored entry with its read). One in the future
    // isn't refused: the write treats it as unknown, as every sync path does (resolveRepoPhases).
    meta: z.record(z.string(), z.unknown()).refine((m) => m.repoPhases === undefined || repoPhasesInMeta.safeParse(m.repoPhases).success, "meta.repoPhases: phase times by phase"),
    // 008: the spec's tasks by id; when given, they are the source of tasksDone and tasksTotal.
    tasks: z.array(TaskInput).optional(),
    // 062: the commit time the spec was read at. Every specclaw write moves the stale mark with it.
    committedAt: commitTime,
    // 091 AC-7: the email the repo names the owner by, used for this write only and never stored. null: the repo
    // names nobody; absent: it couldn't be read (a shallow clone, a git failure, a withdrawal), so the owner stays.
    ownerEmail: z.string().max(320).nullable().optional(),
    // 094 AC-1: when the repo says the change was written; null or absent keeps amax's own created date.
    createdAt: repoTime,
  });
export type SyncInput = z.infer<typeof SyncInput>;

export const syncProposal = defineService({
  scoped: true,
  name: "delivery.proposal.sync",
  action: "delivery:proposal:sync",
  resource: "delivery.proposal",
  input: SyncInput,
  async run(tx, input, ctx) {
    let [project] = await tx.execute(sql`select * from delivery.project where key = ${input.projectKey}`);
    // 062: a person syncs only into a project they're on, and makes one only if they may create projects.
    const v = viewerOf(ctx);
    if (!project && v) assertCan(v, "delivery:project:create");
    if (!project) {
      [project] = await tx.execute(sql`insert into delivery.project (tenant_id, key, name, client, billing, color, sprint)
        values (${ctx.tenantId}, ${input.projectKey}, ${input.project.name}, ${input.project.client}, 'internal', 'mint', 'specclaw waves') returning *`);
      await ensureEnvironments(tx, ctx.tenantId, project.id as string);
    }
    scoped(ctx, "delivery:proposal:sync", project.id as string);
    return upsertSpecProposal(tx, input, ctx, project);
  },
});

/** 062: moves the stale mark forward (never back) on the matched proposals: the commit their spec was last read at. */
export const markSyncedRows = (tx: Tx, where: ReturnType<typeof sql>, committedAt: string) =>
  tx.execute(sql`update delivery.proposal set synced_commit_at = greatest(coalesce(synced_commit_at, ${committedAt}::timestamptz), ${committedAt}::timestamptz) where ${where}`);

// 062: a self-sync that found a proposal unchanged still read it at this commit, so its mark moves too,
// as one audited write per sync run.
export const markSynced = defineService({
  scoped: true,
  name: "delivery.proposal.mark",
  action: "delivery:proposal:sync",
  resource: "delivery.project",
  input: z.object({ projectKey: z.string(), keys: z.array(z.string()), committedAt: commitTime }),
  async run(tx, input, ctx) {
    const project = await projectByKey(tx, input.projectKey);
    scoped(ctx, "delivery:proposal:sync", project.id as string);
    await markSyncedRows(tx, sql`project_id = ${project.id} and key = any(${textArray(input.keys)})`, input.committedAt);
    return { result: { marked: input.keys.length }, resourceId: project.id as string, after: { keys: input.keys.length, committedAt: input.committedAt } };
  },
});

const isoOf = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
/** Each closed task's done date by its id (T3), for a sync's audit. */
const taskDates = async (tx: Tx, proposalId: string) => Object.fromEntries((await tx.execute(sql`select ref, done_at from delivery.task where proposal_id = ${proposalId} and done_at is not null order by ref`))
  .map((t) => [t.ref as string, isoOf(t.done_at)]));

/** One spec change's proposal row and tasks, in the caller's transaction (syncProposal, and 062's push). */
export async function upsertSpecProposal(tx: Tx, input: SyncInput, ctx: ServiceContext, project: Record<string, unknown>) {
    // The project row lock serialises this with createProposal's key computation (review round 2).
    await tx.execute(sql`select 1 from delivery.project where id = ${project.id} for update`);
    // 093 review: read locked, so the audit's before and the write below see the same row (an owner a person sets
    // meanwhile waits for this sync, or this sync waits for it).
    const [found] = await tx.execute(sql`select * from delivery.proposal where key = ${input.key} for update`);
    // A proposal made by hand (no source) before the project was synced can sit on a spec change's
    // key. While it's unreleased it moves to the hand-made series, as its own audited write with its
    // own event, so the spec change can sync; releases and history follow it by id. A released one
    // keeps its key (shipped history isn't renamed), and so does one from another source: the spec
    // change is then refused and reported (review rounds 5 and 6).
    let rekeyed: { from: string; to: string } | null = null;
    const events: Emitted[] = [];
    if (found && found.source !== input.source) {
      if (found.source !== null || found.phase === "released") throw new KeyTakenError(input.key, found.source === null ? "it was released by hand" : `it comes from ${found.source}`);
      const to = await nextHandKey(tx, project.id as string, project.key as string, true);
      await tx.execute(sql`update delivery.proposal set key = ${to}, updated_at = now() where id = ${found.id}`);
      await appendAudit(tx, ctx, { action: "delivery.proposal.rekey", resource: "delivery.proposal", resourceId: found.id as string, before: { key: input.key }, after: { key: to, reason: `spec change ${input.key} owns the key` } });
      events.push({ name: EVENTS.proposalRekeyed, payload: { proposalId: found.id as string, projectId: project.id as string, from: input.key, to } satisfies ProposalRekeyed });
      rekeyed = { from: input.key, to };
    }
    const before = rekeyed ? undefined : found;
    // 094 review round 3: the repo's phase times by the one rule, against the row as locked, whoever writes.
    // 095 AC-1: a future created date is unknown here, the one write every sync path reaches.
    const createdAt = knownTime(input.createdAt);
    const phases = resolveRepoPhases(input.meta.repoPhases, input.meta.source, storedPhasesFor(before));
    const { repoPhases: _sent, ...rest } = input.meta;
    const meta = JSON.stringify(phases ? { ...rest, repoPhases: phases } : rest);
    // 091 AC-7: a spec proposal's owner comes from its repo (the Owner line, else the change's author), never from who
    // pushed: a CI credential acts for the PM, which made the PM own everything. The sync keeps it in step with the
    // repo until a person sets the owner in amax (update_proposal or a Suggested owner: owner_set_by_person, 0021);
    // from then on it stands. No owner event: a sync's change notifies nobody, but the audit below records it. When the
    // repo's answer is unknown (ownerEmail absent), the stored owner stays as it is.
    const owner = await ownerFromRepo(tx, ctx.tenantId, input.ownerEmail, project.id as string);
    // 092 AC-1: decided on the row as locked (`found` above is read `for update`), so an owner a person sets while this
    // sync runs stands, and the audit's before matches it. 094 AC-6: the one rule, ownerFrozen (owner.ts), on that row.
    const personSet = sql`${ownerFrozen(before, input.ownerEmail)}`;
    const [row] = await tx.execute(sql`insert into delivery.proposal (tenant_id, project_id, key, title, phase, tasks_done, tasks_total, agent, source, source_ref, released_at, meta, owner_user_id, owner_name, created_at, updated_at)
      values (${ctx.tenantId}, ${project.id}, ${input.key}, ${input.title}, ${input.phase}, ${input.tasksDone}, ${input.tasksTotal}, 'specclaw', ${input.source}, ${input.sourceRef},
              ${knownTime(repoInstant(input.releasedAt))}, ${meta}::jsonb, ${owner?.id ?? null}, ${owner?.name ?? null}, coalesce(${createdAt}::timestamptz, now()), now())
      on conflict (tenant_id, key) do update set title = excluded.title,
        -- 094 AC-1: a spec proposal is always made by a sync, so the repo's created date replaces the sync's.
        created_at = coalesce(${createdAt}::timestamptz, delivery.proposal.created_at),
        owner_name = case when ${personSet} then delivery.proposal.owner_name else excluded.owner_name end,
        owner_user_id = case when ${personSet} then delivery.proposal.owner_user_id else excluded.owner_user_id end,
        phase = case when delivery.proposal.phase = 'released' then 'released' else excluded.phase end, tasks_done = excluded.tasks_done, tasks_total = excluded.tasks_total,
        source_ref = excluded.source_ref, released_at = coalesce(delivery.proposal.released_at, excluded.released_at), meta = excluded.meta, updated_at = now()
        where delivery.proposal.source = excluded.source
      returning *`);
    if (!row) throw new Error(`${input.key} could not be synced`);
    // 094 review round 1: the dates a sync may correct are on record too: created, and each task's done date.
    const datesBefore = before ? await taskDates(tx, before.id as string) : {};
    if (input.tasks) await writeTasks(tx, ctx.tenantId, row.id as string, input.tasks);
    const datesAfter = await taskDates(tx, row.id as string);
    await markSyncedRows(tx, sql`id = ${row.id}`, input.committedAt);
    // Released belongs to Prod deployments: a sync never takes a proposal back out of it (044 AC-2).
    if (before && before.phase !== row.phase) events.push(phaseEvent(before, row.phase as Phase, ctx));
    return {
      result: { key: input.key, created: !before, phaseChanged: events.some((e) => e.name === EVENTS.proposalPhaseChanged) },
      resourceId: row.id as string,
      // 091 review round 1: the owner too, so a sync that changes or clears it is on record (rule 4).
      before: before ? { phase: before.phase, tasksDone: before.tasks_done, title: before.title, owner: (before.owner_name as string | null) ?? null, ownerUserId: (before.owner_user_id as string | null) ?? null, createdAt: isoOf(before.created_at), taskDates: datesBefore } : null,
      after: { phase: row.phase, tasksDone: input.tasksDone, title: input.title, sha: input.meta.sha, owner: (row.owner_name as string | null) ?? null, ownerUserId: (row.owner_user_id as string | null) ?? null, createdAt: isoOf(row.created_at), taskDates: datesAfter, ...(rekeyed ? { rekeyed } : {}) },
      events,
    };
}

// ---- 042 release management -------------------------------------------------------------------

// Environment names match without regard to case everywhere ("Prod" is "prod"), backed by a unique
// index on lower(name) (migration 0008; final review).
const envByName = async (tx: Tx, projectId: unknown, name: string) =>
  (await tx.execute(sql`select * from delivery.environment where project_id = ${projectId} and lower(name) = lower(${name})`))[0];

// Add, rename, reorder or mark Prod. Marking one Prod unmarks the others; isProd false leaves none.
export const upsertEnvironment = defineService({
  scoped: true,
  name: "delivery.environment.upsert",
  action: "delivery:release:create",
  resource: "delivery.environment",
  input: z.object({ projectKey: z.string(), name: z.string().min(1).max(40), rename: z.string().min(1).max(40).optional(), position: z.number().int().min(1).optional(), isProd: z.boolean().optional() }),
  async run(tx, input, ctx) {
    const project = await projectByKey(tx, input.projectKey);
    scoped(ctx, "delivery:release:create", project.id as string);
    const before = await envByName(tx, project.id, input.name);
    const target = input.rename ? await envByName(tx, project.id, input.rename) : undefined;
    if (target && target.id !== before?.id) throw invalid(`${input.projectKey} already has an environment called ${target.name}`);
    if (input.isProd) await tx.execute(sql`update delivery.environment set is_prod = false where project_id = ${project.id}`);
    let row;
    if (before) {
      [row] = await tx.execute(sql`update delivery.environment set name = ${input.rename ?? before.name}, is_prod = ${input.isProd ?? before.is_prod} where id = ${before.id} returning *`);
    } else {
      const [{ n }] = await tx.execute(sql`select coalesce(max(position), 0) + 1 as n from delivery.environment where project_id = ${project.id}`);
      [row] = await tx.execute(sql`insert into delivery.environment (tenant_id, project_id, name, position, is_prod) values (${ctx.tenantId}, ${project.id}, ${input.rename ?? input.name}, ${n}, ${input.isProd ?? false}) returning *`);
    }
    if (input.position) {
      // Move to the requested slot and close the gaps, keeping the others in order.
      const envs = (await tx.execute(sql`select id from delivery.environment where project_id = ${project.id} and id <> ${row.id} order by position`)).map((e) => e.id as string);
      envs.splice(Math.min(input.position - 1, envs.length), 0, row.id as string);
      for (const [i, id] of envs.entries()) await tx.execute(sql`update delivery.environment set position = ${-(i + 1)} where id = ${id}`);
      await tx.execute(sql`update delivery.environment set position = -position where project_id = ${project.id}`);
    }
    // Pins name the environment by its id (059), so a rename needs nothing more.
    return { result: { name: row.name as string }, resourceId: row.id as string, before: before ? { name: before.name, isProd: before.is_prod } : null, after: input };
  },
});

export const removeEnvironment = defineService({
  scoped: true,
  name: "delivery.environment.remove",
  action: "delivery:release:create",
  resource: "delivery.environment",
  input: z.object({ projectKey: z.string(), name: z.string() }),
  async run(tx, input, ctx) {
    const project = await projectByKey(tx, input.projectKey);
    scoped(ctx, "delivery:release:create", project.id as string);
    const env = await envByName(tx, project.id, input.name);
    if (!env) throw notFound(`no environment ${input.name}`);
    const [{ n }] = await tx.execute(sql`select count(*)::int as n from delivery.deployment where environment_id = ${env.id}`);
    // Voided records stay as history, so they count too.
    if (Number(n) > 0) throw invalid(`${env.name} has ${n} deployment record${Number(n) === 1 ? "" : "s"} (voided ones included, kept as history), so it stays`);
    await tx.execute(sql`delete from delivery.environment where id = ${env.id}`);
    return { result: { removed: env.name as string }, resourceId: env.id as string, before: { name: env.name } };
  },
});

export const tagRelease = defineService({
  scoped: true,
  name: "delivery.release.tag",
  action: "delivery:release:create",
  resource: "delivery.release",
  input: z.object({ projectKey: z.string(), version: z.string(), newVersion: z.string().min(1).max(40) }),
  async run(tx, input, ctx) {
    const project = await projectByKey(tx, input.projectKey);
    scoped(ctx, "delivery:release:create", project.id as string);
    const r = await releaseOf(tx, project.id, input.version);
    await tx.execute(sql`update delivery.release set version = ${input.newVersion} where id = ${r.id}`);
    // The release's page is named by its version: say where it moved, so chat can follow it (057).
    const moved = { from: releaseHref(input), to: releaseHref({ projectKey: input.projectKey, version: input.newVersion }) };
    // Pins name it by its id (059), so they need nothing.
    return { result: { version: input.newVersion, moved }, resourceId: r.id as string, before: { version: input.version }, after: { version: input.newVersion } };
  },
});

export const setReleaseProposals = defineService({
  scoped: true,
  name: "delivery.release.proposals",
  action: "delivery:release:create",
  resource: "delivery.release",
  input: z.object({ projectKey: z.string(), version: z.string(), proposalKeys: z.array(z.string()) }),
  async run(tx, input, ctx) {
    const project = await projectByKey(tx, input.projectKey);
    scoped(ctx, "delivery:release:create", project.id as string);
    const r = await releaseOf(tx, project.id, input.version);
    const before = (await tx.execute(sql`select key from delivery.proposal where release_id = ${r.id} order by key`)).map((p) => p.key as string);
    await lockProposals(tx, sql`release_id = ${r.id} or (project_id = ${project.id} and key = any(${textArray(input.proposalKeys)}))`);
    await tx.execute(sql`update delivery.proposal set release_id = null where release_id = ${r.id} and phase <> 'released'`);
    await assignProposals(tx, project.id, r.id, input.proposalKeys);
    return { result: { version: input.version, proposals: input.proposalKeys }, resourceId: r.id as string, before: { proposals: before }, after: { proposals: input.proposalKeys } };
  },
});

// A wrong record is voided with a reason, never deleted. Voiding the only Prod deployment takes
// its proposals out of Released again.
export const voidDeployment = defineService({
  scoped: true,
  name: "delivery.deployment.void",
  action: "delivery:deployment:record",
  resource: "delivery.deployment",
  // A history row voids exactly itself (deploymentId); without one, the latest live record for the
  // environment (MCP and chat, which name the environment) (final review).
  input: z.object({ projectKey: z.string(), version: z.string(), environment: z.string(), deploymentId: z.string().uuid().optional(), reason: z.string().min(3).max(500) }),
  async run(tx, input, ctx) {
    const project = await projectByKey(tx, input.projectKey);
    scoped(ctx, "delivery:deployment:record", project.id as string);
    const release = await releaseOf(tx, project.id, input.version);
    const target = input.deploymentId
      ? sql`select d.id from delivery.deployment d join delivery.environment e on e.id = d.environment_id
            where d.id = ${input.deploymentId} and d.release_id = ${release.id} and lower(e.name) = lower(${input.environment}) and d.voided_at is null`
      : sql`select d.id from delivery.deployment d join delivery.environment e on e.id = d.environment_id
            where d.release_id = ${release.id} and lower(e.name) = lower(${input.environment}) and d.voided_at is null order by d.at desc limit 1`;
    const [d] = await tx.execute(sql`update delivery.deployment set voided_at = now(), void_reason = ${input.reason}, voided_by = ${by(ctx)} where id = (${target}) returning *`);
    if (!d) throw invalid(input.deploymentId ? `that deployment isn't a live ${input.environment} record of ${input.version}` : `no deployment of ${input.version} to ${input.environment} to void`);
    const events: Emitted[] = [];
    // Only the record that released the proposals can un-release them, and only if no other live
    // record released them too. Voiding a Dev deploy, or one on an environment that has since
    // stopped being Prod, leaves Released alone.
    const [{ live }] = await tx.execute(sql`select count(*)::int as live from (${liveProdDeployments(sql`${release.id}`)}) x`);
    if (d.released && Number(live) === 0) {
      // Each proposal goes back to the phase it had when a record of this release released it (044
      // AC-1); one released before that phase was recorded goes back to Verified.
      await lockProposals(tx, sql`release_id = ${release.id}`);
      const records = await tx.execute(sql`select prior_phases from delivery.deployment where release_id = ${release.id} and released order by at`);
      const prior: Record<string, Phase> = Object.assign({}, ...records.map((r) => r.prior_phases as Record<string, Phase>));
      const shipped = await tx.execute(sql`select id from delivery.proposal where release_id = ${release.id} and phase = 'released'`);
      for (const p of shipped) {
        const to = prior[p.id as string] ?? "verified";
        const [back] = await tx.execute(sql`update delivery.proposal set phase = ${to}, released_at = null, updated_at = now() where id = ${p.id} returning *`);
        events.push(phaseEvent({ ...back, phase: "released" }, to, ctx));
      }
    }
    return { result: { voided: d.id as string, unreleased: events.length }, resourceId: d.id as string, after: input, events };
  },
});
