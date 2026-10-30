import { sql } from "drizzle-orm";
import { withTenant, type Db, type Tx } from "@amax/db";
import { canonical, type ServiceContext } from "@amax/core/server";
import { KeyTakenError, markSynced, syncProposal } from "../server/services";
import type { SpecRecord } from "./specclaw";

export type SyncResult = { created: number; updated: number; unchanged: number; withdrawn: number; skipped: string[] };

export type Task = SpecRecord["tasks"][number];

// 008: a task a commit closed stays closed, so the repo's open task is merged with the stored one;
// otherwise every sync would see a "change" it can't make.
export const desired = (projectKey: string, r: SpecRecord, sha: string, stored: Task[] = []) => {
  const tasks = r.tasks.map((t) => ({ ...t, done: t.done || stored.some((s) => s.ref === t.ref && s.done) }));
  return {
  key: `${projectKey}-${r.number}`,
  title: r.title,
  phase: r.phase,
  tasksDone: tasks.length ? tasks.filter((t) => t.done).length : r.tasksDone,
  tasksTotal: tasks.length || r.tasksTotal,
  tasks,
  releasedAt: r.releasedAt,
  meta: { lane: r.lane, module: r.module, status: r.status, waiting: r.waiting, claim: r.claim, hard: r.hard, optional: r.optional, acs: r.acs, pr: r.pr, verdict: r.verdict, sha, source: r.source },
  };
};

// The meta fields that matter for "changed?". The commit sha alone doesn't count as a change, neither
// as `sha` nor inside `source` ("main@<sha>"): only the ref name is compared (review round 2).
// Task order isn't a change either: change.md may list T26 before T25, and storage returns its own order (079).
const refOf = (s: unknown) => (typeof s === "string" ? s.replace(/@[0-9a-f]{7,40}$/i, "") : s);
const byRef = (a: Task, b: Task) => a.ref.length - b.ref.length || (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0);
export const fingerprint = (d: { title: string; phase: string; tasksDone: number; tasksTotal: number; tasks: Task[]; meta: Record<string, unknown> }) =>
  canonical([d.title, d.phase, d.tasksDone, d.tasksTotal, [...d.tasks].sort(byRef), { ...d.meta, sha: null, source: refOf(d.meta.source) }]);

/** A project's specclaw proposals as stored, with their tasks, for the "changed?" comparison. */
export const storedSpecRows = (tx: Tx, projectKey: string) =>
  tx.execute(sql`select p.key, p.title, p.phase, p.tasks_done, p.tasks_total, p.meta, p.source_ref, p.synced_commit_at,
                   (select coalesce(json_agg(json_build_object('ref', t.ref, 'title', t.title, 'done', t.done) order by length(t.ref), t.ref), '[]') from delivery.task t where t.proposal_id = p.id) as tasks
                 from delivery.proposal p join delivery.project pr on pr.id = p.project_id
                 where pr.key = ${projectKey} and p.source = 'specclaw'`);

/**
 * One-way import of a repo's specclaw changes into a delivery project, as a caller of sync_proposal's
 * service (008 AC-7): audited as `ctx`, the sync's service principal, and only for changed rows.
 */
export async function syncSpecclaw(db: Db, ctx: ServiceContext, opts: { projectKey: string; projectName: string; client: string; records: SpecRecord[]; sha: string; committedAt: string }): Promise<SyncResult> {
  const existing = await withTenant(db, ctx.tenantId, (tx) => storedSpecRows(tx, opts.projectKey));
  const byKey = new Map(existing.map((e) => [e.key as string, e]));
  const result: SyncResult = { created: 0, updated: 0, unchanged: 0, withdrawn: 0, skipped: [] };
  const project = { name: opts.projectName, client: opts.client };
  const same: string[] = [];

  for (const r of opts.records) {
    const cur = byKey.get(`${opts.projectKey}-${r.number}`);
    const d = desired(opts.projectKey, r, opts.sha, (cur?.tasks as Task[] | undefined) ?? []);
    byKey.delete(d.key);
    if (r.unreadable) { result.skipped.push(`${d.key}: state.json unreadable at ${r.source}`); continue; }
    // A Released proposal stays Released whatever the repo says (044 AC-2), so that isn't a change.
    if (cur && fingerprint({ title: cur.title as string, phase: cur.phase === "released" ? d.phase : (cur.phase as string), tasksDone: Number(cur.tasks_done), tasksTotal: Number(cur.tasks_total), tasks: cur.tasks as Task[], meta: cur.meta as Record<string, unknown> }) === fingerprint(d)) {
      result.unchanged++;
      same.push(d.key);
      continue;
    }
    try {
      await syncProposal(ctx, { projectKey: opts.projectKey, project, source: "specclaw", sourceRef: r.dir, committedAt: opts.committedAt, ...d });
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
  // Folders that disappeared are marked withdrawn, never deleted.
  for (const [key, cur] of byKey) {
    const meta = cur.meta as Record<string, unknown>;
    if (meta.withdrawn) continue;
    await syncProposal(ctx, {
      projectKey: opts.projectKey, project, key, title: cur.title as string, phase: cur.phase as never, tasksDone: Number(cur.tasks_done), tasksTotal: Number(cur.tasks_total),
      source: "specclaw", sourceRef: String(cur.source_ref ?? key), releasedAt: null, meta: { ...meta, withdrawn: true, sha: opts.sha }, committedAt: opts.committedAt,
    });
    result.withdrawn++;
  }
  return result;
}
