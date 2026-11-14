import { sql } from "drizzle-orm";
import type { EventHandlerDef } from "@amax/core";
import { contextFor } from "@amax/core/server";
import type { Tx } from "@amax/db";
import { PROPOSAL_HOURS_JOB, setProposalHours } from "@amax/delivery/contracts";
import { EVENTS, type EntryCorrected } from "../contracts";

export { PROPOSAL_HOURS_JOB };

/**
 * 081 AC-4: approved hours per proposal, handed to Delivery for its proposal views. Delivery can't read Time (Time
 * depends on Delivery, and the module graph has no cycles), so Time recomputes whole projects and Delivery's own service
 * stores the totals it is given. Totals only: approved weeks, never a deleted entry; a proposal with none reads 0.
 * 104 AC-10: the same pass hands over the hours waiting for approval: live entries in weeks not yet approved.
 *
 * Two handlers for the same project must not cross: each takes a per-project lock (in sorted order, so two can't
 * deadlock) in its own transaction and holds it while it reads and while Delivery's write commits. The next one reads
 * only after that, so an older total can never land last.
 */
export const lockProjectHours = (tx: Tx, projectId: string) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`time.proposal-hours:${projectId}`}, 0))`);

export async function refreshProposalHours(tx: Tx, tenantId: string, projectIds: string[]) {
  const projects = [...new Set(projectIds.filter(Boolean))].sort();
  if (!projects.length) return;
  for (const id of projects) await lockProjectHours(tx, id);
  const rows = await tx.execute(sql`select e.proposal_id, w.status = 'approved' as approved, sum(e.hours) as hours from time.entry e join time.week w on w.id = e.week_id
    where e.deleted_at is null and e.proposal_id is not null
      and e.project_id::text in (${sql.join(projects.map((id) => sql`${id}`), sql`, `)})
    group by e.proposal_id, w.status = 'approved'`);
  const totals: Record<string, number> = {}, waiting: Record<string, number> = {};
  for (const r of rows) {
    const into = r.approved ? totals : waiting;
    into[r.proposal_id as string] = (into[r.proposal_id as string] ?? 0) + Number(r.hours);
  }
  await setProposalHours(contextFor.job(tenantId, PROPOSAL_HOURS_JOB), { projectIds: projects, totals, waiting });
}

const weekProjectIds = async (tx: Tx, weekId: string) =>
  (await tx.execute(sql`select distinct project_id from time.entry where week_id = ${weekId}`)).map((r) => r.project_id as string);

type Payload = Record<string, unknown>;

const refreshWeek = (id: string, event: string, extra: (p: Payload) => string[] = () => []): EventHandlerDef => ({
  id, event,
  async handle({ tx, tenantId, event: e }) {
    const p = e.payload as Payload;
    await refreshProposalHours(tx, tenantId, [...(await weekProjectIds(tx, p.weekId as string)), ...extra(p)]);
  },
});

/**
 * Totals move with the week (submitted, approved, rejected, reopened) and with every entry logged, corrected or deleted:
 * approved hours only change under a locked week, but the waiting ones change with any entry (104 AC-10).
 */
export const proposalHoursHandlers: EventHandlerDef[] = [
  refreshWeek("time.proposal-hours.submitted", EVENTS.weekSubmitted),
  refreshWeek("time.proposal-hours.approved", EVENTS.weekApproved),
  refreshWeek("time.proposal-hours.rejected", EVENTS.weekRejected),
  refreshWeek("time.proposal-hours.reopened", EVENTS.weekReopened),
  refreshWeek("time.proposal-hours.logged", EVENTS.entryLogged),
  refreshWeek("time.proposal-hours.corrected", EVENTS.entryCorrected, (p) => [(p as unknown as EntryCorrected).before.projectId]),
  refreshWeek("time.proposal-hours.deleted", EVENTS.entryDeleted),
];
