import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { can, type Viewer } from "@amax/auth";
import { ForbiddenError } from "@amax/core/server";
import { seesWeek } from "./server/chain";
import { weekProjects } from "./server/weeks";
import { shiftWeek, weekKey, type IsoWeek } from "./week";

export { approvedWeekHours, type ApprovedWeekHours } from "./server/totals";
export { hoursVisibleTo } from "./server/hours-scope";

/**
 * 072 review rounds 2 and 3: the current status of timesheet weeks by id, for a consumer whose copy has no status for a
 * week (submitted before it listened, or an event it missed). Read as the viewer, with Time's week scope like every
 * contract read: a week the viewer may not see, or one Time no longer holds, is absent.
 */
export async function weekStatuses(tx: Tx, viewer: Viewer, weekIds: string[]): Promise<Map<string, WeekStatus>> {
  const ids = [...new Set(weekIds)];
  if (!ids.length) return new Map();
  const rows = await tx.execute(sql`select w.id, w.status, w.user_id, ${weekProjects} as projects, ${ownerEntity} as owner_entity from time.week w
    where w.id::text in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`);
  return new Map(rows.filter((r) => visible(viewer, r)).map((r) => [r.id as string, r.status as WeekStatus]));
}
export { isoWeekOf, parseWeekKey, shiftWeek, weekKey, weekStart, workDays, type IsoWeek } from "./week";

export const WEEK_STATUSES = ["draft", "submitted", "approved", "rejected"] as const;
export type WeekStatus = (typeof WEEK_STATUSES)[number];
export type EntrySource = "person" | "agent";
export type ApprovalChain = "manager" | "project" | "admin";

export type EntryLogged = { entryId: string; weekId: string; userId: string; projectId: string; day: string; hours: number; billable: boolean; source: EntrySource; lockedChange: boolean; revision: number };
/** 070: an entry's new state; `revision` grows with every change. AC-14: `byOther` when someone else fixed it, with the `reason` they are told. */
type FixedBy = { by?: string; byOther?: boolean; reason?: string | null; projectName?: string; week?: string; dayLabel?: string; requestId?: string };
export type EntryCorrected = { entryId: string; weekId: string; userId: string; projectId: string; day: string; hours: number; billable: boolean; revision: number; before: { hours: number; billable: boolean; projectId: string }; lockedChange: boolean } & FixedBy;
export type EntryDeleted = { entryId: string; weekId: string; userId: string; projectId: string; day: string; hours: number; revision: number; lockedChange: boolean } & FixedBy;
/** 072 AC-3: `projectIds` and `legalEntityId` route the notice to the week's project approvers in the owner's entity. */
export type ApproverRoute = { projectIds?: string[]; legalEntityId?: string | null };
export type WeekSubmitted = { weekId: string; userId: string; week: string; hours: number } & ApproverRoute;
export type WeekDecided = { weekId: string; userId: string; week: string; by: string; chain: ApprovalChain; comment: string | null };
export type WeekReopened = { weekId: string; userId: string; week: string; by: string; reason: string };
// 070 amendment 3: change requests on locked weeks. `answered` marks the owner's reply to a question.
// 073: `entryId` is null for a request to add hours (there is no entry yet).
type RequestRef = { requestId: string; weekId: string; userId: string; week: string; entryId: string | null; projectName: string; dayLabel: string };
export type ChangeRequested = RequestRef & { change: string; reason: string; answered: boolean; answer: string | null } & ApproverRoute;
export type ChangeDecided = RequestRef & { decision: "apply" | "reopen" | "ask" | "decline" | "cancel"; by: string; note: string | null; kind?: "correct" | "delete" | "add" };
export type ChangeCompleted = { requestId: string; weekId: string; userId: string; week: string };
/** 073: `weekId` is null for someone reminded before they have a timesheet that week (Not started). */
export type WeekReminded = { weekId: string | null; userId: string; week: string; by: string; message?: string | null };
/** 073 AC-3: "log your hours for this day", to someone with nothing logged that day. */
export type DayReminded = { userId: string; day: string; dayLabel: string; week: string; by: string; message: string };

export const EVENTS = {
  entryLogged: "time.entry.logged",
  entryCorrected: "time.entry.corrected",
  entryDeleted: "time.entry.deleted",
  weekSubmitted: "time.week.submitted",
  weekApproved: "time.week.approved",
  weekRejected: "time.week.rejected",
  weekReopened: "time.week.reopened",
  weekReminded: "time.week.reminded",
  dayReminded: "time.day.reminded",
  changeRequested: "time.change.requested",
  changeDecided: "time.change.decided",
  changeCompleted: "time.change.completed",
} as const;

export type PersonWeek = { weekId: string; userId: string; personName: string; status: WeekStatus; hours: number; agentHours: number; billableHours: number };
export type ProjectHours = { projectId: string; hours: number; agentHours: number; billableHours: number };

const n = (v: unknown) => Number(v ?? 0);

// Contract reads apply the caller's data scope (docs/architecture.md), with one week-level rule for
// both reads: a person sees their own weeks, plus every week they could see on Team time (time:team,
// their reports, or a week with time on a project they approve). A visible week counts in full.
const visible = (v: Viewer, r: Record<string, unknown>) =>
  r.user_id === v.userId || seesWeek(v, r.user_id as string, (r.projects as string[]) ?? [], (r.owner_entity as string | null) ?? null);
const mustRead = (v: Viewer) => {
  if (!can(v, "time:read")) throw new ForbiddenError("time:read", "time");
};
const ownerEntity = sql`(select u.legal_entity_id from auth.user u where u.id = w.user_id)`;

/** Per-person totals for an ISO week, limited to the weeks the viewer may see. */
export async function weekTotals(tx: Tx, viewer: Viewer, w: IsoWeek): Promise<PersonWeek[]> {
  mustRead(viewer);
  const rows = await tx.execute(sql`select w.id, w.user_id, w.person_name, w.status, coalesce(sum(e.hours), 0) as hours,
      coalesce(sum(e.hours) filter (where e.source = 'agent'), 0) as agent, coalesce(sum(e.hours) filter (where e.billable), 0) as billable,
      ${weekProjects} as projects, ${ownerEntity} as owner_entity
    from time.week w left join time.entry e on e.week_id = w.id and e.deleted_at is null
    where w.iso_year = ${w.year} and w.iso_week = ${w.week} group by w.id order by w.person_name`);
  return rows.filter((r) => visible(viewer, r))
    .map((r) => ({ weekId: r.id as string, userId: r.user_id as string, personName: r.person_name as string, status: r.status as WeekStatus,
      hours: n(r.hours), agentHours: n(r.agent), billableHours: n(r.billable) }));
}

/** Hours per project in a date range, counting the entries of weeks the viewer may see. Aggregates only: no per-person rows. */
export async function projectHours(tx: Tx, viewer: Viewer, range: { from: string; to: string; approvedOnly?: boolean }): Promise<ProjectHours[]> {
  mustRead(viewer);
  const approved = range.approvedOnly ? sql`and w.status = 'approved'` : sql``;
  const rows = await tx.execute(sql`select w.user_id, ${weekProjects} as projects, ${ownerEntity} as owner_entity, e.project_id, sum(e.hours) as hours, coalesce(sum(e.hours) filter (where e.source = 'agent'), 0) as agent,
      coalesce(sum(e.hours) filter (where e.billable), 0) as billable
    from time.entry e join time.week w on w.id = e.week_id
    where e.day between ${range.from} and ${range.to} and e.deleted_at is null ${approved} group by w.id, e.project_id`);
  const by = new Map<string, ProjectHours>();
  for (const r of rows) {
    const projectId = r.project_id as string;
    if (!visible(viewer, r)) continue;
    const p = by.get(projectId) ?? { projectId, hours: 0, agentHours: 0, billableHours: 0 };
    p.hours += n(r.hours); p.agentHours += n(r.agent); p.billableHours += n(r.billable);
    by.set(projectId, p);
  }
  const tidy = (x: number) => Math.round(x * 100) / 100;
  return [...by.values()].map((p) => ({ ...p, hours: tidy(p.hours), agentHours: tidy(p.agentHours), billableHours: tidy(p.billableHours) }))
    .sort((a, b) => b.hours - a.hours);
}

export type WeekHours = { week: string; agentHours: number; personHours: number };

/** 068 AC-2: hours per ISO week, agents vs people, the `weeks` up to `last`, oldest first. Same week-level scope as projectHours. */
export async function weeklyHours(tx: Tx, viewer: Viewer, q: { last: IsoWeek; weeks: number; projectId?: string }): Promise<WeekHours[]> {
  mustRead(viewer);
  const keys = Array.from({ length: q.weeks }, (_, i) => shiftWeek(q.last, i - q.weeks + 1));
  const first = keys[0];
  const only = q.projectId ? sql`and e.project_id = ${q.projectId}` : sql``;
  const rows = await tx.execute(sql`select w.user_id, w.iso_year, w.iso_week, ${weekProjects} as projects, ${ownerEntity} as owner_entity,
      coalesce(sum(e.hours) filter (where e.source = 'agent'), 0) as agent, coalesce(sum(e.hours) filter (where e.source <> 'agent'), 0) as person
    from time.week w join time.entry e on e.week_id = w.id and e.deleted_at is null
    where (w.iso_year, w.iso_week) between (${first.year}, ${first.week}) and (${q.last.year}, ${q.last.week}) ${only} group by w.id`);
  const by = new Map(keys.map((k) => [weekKey(k), { week: weekKey(k), agentHours: 0, personHours: 0 }]));
  for (const r of rows) {
    if (!visible(viewer, r)) continue;
    const w = by.get(weekKey({ year: Number(r.iso_year), week: Number(r.iso_week) }));
    if (w) { w.agentHours += n(r.agent); w.personHours += n(r.person); }
  }
  const tidy = (x: number) => Math.round(x * 10) / 10;
  return [...by.values()].map((w) => ({ ...w, agentHours: tidy(w.agentHours), personHours: tidy(w.personHours) }));
}
