import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { Viewer } from "@amax/auth";
import { listEmploymentPeriods, listPeople, type EmploymentPeriod } from "@amax/hr/contracts";
import { approvedLeave, type ApprovedLeave } from "@amax/leave/contracts";
import { asDay, type Range } from "./days";
import { installed } from "./read";
import { hoursVisibleTo } from "@amax/time/contracts";
import { seesLeave } from "./reach";

export type Person = { userId: string; personId: string; name: string; initials: string; legalEntityId: string; leaveSeen: boolean };
export type Logged = { day: string; hours: number; billable: boolean };
export type Inputs = {
  people: Person[]; hours: Map<string, Logged[]>; periods: Map<string, EmploymentPeriod[]>;
  holidays: Map<string, Set<string>>; leave: Map<string, ApprovedLeave[]>; leaveOn: boolean;
};

const groupBy = <T>(rows: T[], key: (r: T) => string) => {
  const out = new Map<string, T[]>();
  for (const r of rows) out.set(key(r), [...(out.get(key(r)) ?? []), r]);
  return out;
};

async function hoursIn(tx: Tx, v: Viewer, range: Range) {
  // 072 AC-6 (D1): hours of submitted and approved weeks; rows without a week (seeded, or copied before 072) count as before.
  const rows = await tx.execute(sql`select h.user_id, h.day, h.hours, h.billable from reports.logged_hours h left join reports.week_status s on s.week_id = h.week_id
    where h.day between ${range.from} and ${range.to} and h.deleted_at is null and (h.week_id is null or s.status in ('submitted', 'approved')) order by h.day`);
  // 071 AC-13: Time decides whose hours the viewer may see (its week scope, with legal entity and PMs' project members).
  const visible = await hoursVisibleTo(tx, v, { userIds: rows.map((r) => r.user_id as string), ...range });
  const seen = rows.filter((r) => visible.has(r.user_id as string));
  return groupBy(seen.map((r) => ({ userId: r.user_id as string, day: asDay(r.day), hours: Number(r.hours), billable: Boolean(r.billable) })), (r) => r.userId);
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
  const hours = await hoursIn(tx, v, range);
  const reached = (await listPeople(tx, v)).filter((p) => p.userId && hours.has(p.userId));
  const leaveOn = await installed(tx, "leave.request");
  const people = reached.map((p) => ({ userId: p.userId!, personId: p.id, name: p.name, initials: p.initials, legalEntityId: p.legalEntityId, leaveSeen: seesLeave(v, p) }));
  const ids = people.map((p) => p.personId);
  const leave = leaveOn ? await approvedLeave(tx, v, { ...range, personIds: ids }) : [];
  return {
    people: people.sort((a, b) => a.name.localeCompare(b.name)), hours, leaveOn,
    periods: groupBy(await listEmploymentPeriods(tx, v, ids), (p) => p.personId),
    holidays: await holidaysIn(tx, range), leave: groupBy(leave, (l) => l.personId),
  };
}
