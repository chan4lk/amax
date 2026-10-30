import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { Viewer } from "@amax/auth";
import { listEmploymentPeriods, listPeople, type EmploymentPeriod } from "@amax/hr/contracts";
import { approvedLeave, type ApprovedLeave } from "@amax/leave/contracts";
import { asDay, type Range } from "./days";
import { hasModule } from "@amax/core/server";
import { installed } from "./read";
import { hoursVisibleTo, weekStatuses } from "@amax/time/contracts";
import { seesLeave } from "./reach";

export type Person = { userId: string; personId: string; name: string; initials: string; legalEntityId: string; leaveSeen: boolean };
export type Logged = { day: string; hours: number; billable: boolean };
export type Inputs = {
  people: Person[]; hours: Map<string, Logged[]>; periods: Map<string, EmploymentPeriod[]>;
  holidays: Map<string, Set<string>>; leave: Map<string, ApprovedLeave[]>; leaveOn: boolean;
  /** People with hours whose week status couldn't be read (072 review round 3): their figure is incomplete. */
  hoursUnknown: Set<string>;
};

const groupBy = <T>(rows: T[], key: (r: T) => string) => {
  const out = new Map<string, T[]>();
  for (const r of rows) out.set(key(r), [...(out.get(key(r)) ?? []), r]);
  return out;
};

async function hoursIn(tx: Tx, v: Viewer, range: Range) {
  // 072 AC-6 (D1): hours of submitted and approved weeks; rows without a week (seeded, or copied before 072) count as before.
  // A week this copy has no status for (submitted before 072 listened, or an event it missed) is unknown, not a draft:
  // its status is read from Time's contract (review rounds 1 and 2), so its hours are neither dropped nor guessed.
  const all = await tx.execute(sql`select h.user_id, h.day, h.hours, h.billable, h.week_id, s.status from reports.logged_hours h left join reports.week_status s on s.week_id = h.week_id
    where h.day between ${range.from} and ${range.to} and h.deleted_at is null order by h.day`);
  const unknown = [...new Set(all.filter((r) => r.week_id && !r.status).map((r) => r.week_id as string))];
  const fromTime = unknown.length && hasModule("time", await installed(tx, "time.week")) ? await weekStatuses(tx, v, unknown) : new Map<string, string>();
  const statusOf = (r: Record<string, unknown>) => (r.status as string | null) ?? fromTime.get(r.week_id as string) ?? null;
  // 071 AC-13: Time decides, person by person and week by week, whose hours the viewer may see (its seesWeek rule).
  const sees = await hoursVisibleTo(tx, v, { userIds: all.map((r) => r.user_id as string), ...range });
  const seen = all.filter((r) => sees(r.user_id as string, asDay(r.day)));
  const rows = seen.filter((r) => !r.week_id || ["submitted", "approved"].includes(statusOf(r) ?? ""));
  // Review round 3: hours whose week status neither this copy nor Time could give are unknown. They are never dropped
  // as if draft: the person's figure is marked incomplete and left out of the team figure.
  const unknownFor = new Set(seen.filter((r) => r.week_id && statusOf(r) === null).map((r) => r.user_id as string));
  return { hours: groupBy(rows.map((r) => ({ userId: r.user_id as string, day: asDay(r.day), hours: Number(r.hours), billable: Boolean(r.billable) })), (r) => r.userId), unknownFor };
}

async function holidaysIn(tx: Tx, range: Range) {
  const rows = await tx.execute(sql`select legal_entity_id, on_date from reports.holiday where on_date between ${range.from} and ${range.to}`);
  const out = new Map<string, Set<string>>();
  for (const r of rows) out.set(r.legal_entity_id as string, (out.get(r.legal_entity_id as string) ?? new Set()).add(asDay(r.on_date)));
  return out;
}

/**
 * Everything a report needs for a range, read as the viewer: hours of the people whose whole
 * timesheet they could see in time, limited to the people hr lets them reach; employment (FTE) from
 * hr; holidays; and approved leave from leave's contract, which applies leave's own visibility.
 */
export async function loadInputs(tx: Tx, v: Viewer, range: Range): Promise<Inputs> {
  const { hours, unknownFor } = await hoursIn(tx, v, range);
  const reached = (await listPeople(tx, v)).filter((p) => p.userId && (hours.has(p.userId) || unknownFor.has(p.userId)));
  // Optional modules: installed in this deployment (hasModule), and their tables there (072 review round 3).
  const leaveOn = hasModule("leave", await installed(tx, "leave.request"));
  const people = reached.map((p) => ({ userId: p.userId!, personId: p.id, name: p.name, initials: p.initials, legalEntityId: p.legalEntityId, leaveSeen: seesLeave(v, p) }));
  const ids = people.map((p) => p.personId);
  const leave = leaveOn ? await approvedLeave(tx, v, { ...range, personIds: ids }) : [];
  return {
    people: people.sort((a, b) => a.name.localeCompare(b.name)), hours, hoursUnknown: unknownFor, leaveOn,
    periods: groupBy(await listEmploymentPeriods(tx, v, ids), (p) => p.personId),
    holidays: await holidaysIn(tx, range), leave: groupBy(leave, (l) => l.personId),
  };
}
