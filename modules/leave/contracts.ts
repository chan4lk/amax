// The only import surface for other modules (docs/module-standard.md). Payroll (014) and time read
// approved leave here and react to leave.approved; reads apply the caller's data scope, and trusted
// system code (a context core issued with contextFor.job) sees every row.
import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { Viewer } from "@amax/auth";
import { readerOf, sees, visibleTo, type Reader } from "./server/scope";

export { LEAVE_SENSITIVE } from "./server/scope";
/** Whether a viewer may see a person's leave: Leave's own rule, for modules that show leave next to their data (072). */
export const leaveVisibleTo = (v: Viewer, p: { userId: string | null; legalEntityId: string | null }) => sees(v, { user_id: p.userId, legal_entity_id: p.legalEntityId });

export const LEAVE_TYPES = ["annual", "casual", "medical", "lieu", "personal", "long-service", "unpaid"] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];
export const REQUEST_STATUSES = ["pending", "approved", "rejected", "cancelled"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export type HalfDay = "am" | "pm";
export type { Reader };

export const EVENTS = { requested: "leave.requested", approved: "leave.approved", rejected: "leave.rejected", cancelled: "leave.cancelled" } as const;

type Leave = { requestId: string; personId: string; userId: string | null; legalEntityId: string; type: LeaveType; startsOn: string; endsOn: string; halfDay: HalfDay | null; days: number };
export type LeaveRequested = Leave & { clashes: number };
/** Payroll pays or deducts by `paid`; time marks the days as leave. */
export type LeaveApproved = Leave & { paid: boolean; by: string };
export type LeaveRejected = Leave & { by: string };
export type LeaveCancelled = Leave & { by: string; wasApproved: boolean };

export type ApprovedLeave = Leave & { paid: boolean };
export type Balance = { personId: string; type: LeaveType; year: number; entitled: number; taken: number; pending: number; left: number };

const day = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);

/** Approved leave overlapping a date range (inclusive), optionally for some people, limited to what the reader may see. */
export async function approvedLeave(tx: Tx, reader: Reader, range: { from: string; to: string; personIds?: string[] }): Promise<ApprovedLeave[]> {
  const who = readerOf(reader);
  const people = range.personIds ? (range.personIds.length ? sql`and r.person_id::text in (${sql.join(range.personIds.map((p) => sql`${p}`), sql`, `)})` : sql`and false`) : sql``;
  const rows = await tx.execute(sql`select r.*, coalesce(p.paid, true) as paid from leave.request r
    left join leave.policy p on p.legal_entity_id = r.legal_entity_id and p.type = r.type
    where r.status = 'approved' and r.starts_on <= ${range.to} and r.ends_on >= ${range.from} ${people} order by r.starts_on, r.person_name`);
  return rows.filter((r) => visibleTo(who, r)).map((r) => ({
    requestId: r.id as string, personId: r.person_id as string, userId: (r.user_id as string | null) ?? null, legalEntityId: r.legal_entity_id as string,
    type: r.type as LeaveType, startsOn: day(r.starts_on), endsOn: day(r.ends_on), halfDay: (r.half_day as HalfDay | null) ?? null, days: Number(r.days), paid: Boolean(r.paid),
  }));
}

/** A person's balances for a year: entitlement, approved days taken or booked, pending days, and what's left. */
export async function balancesFor(tx: Tx, reader: Reader, personId: string, year: number): Promise<Balance[]> {
  const who = readerOf(reader);
  const rows = await tx.execute(sql`select b.*, coalesce(t.approved, 0) as approved, coalesce(t.pending, 0) as pending from leave.balance b
    left join lateral (select sum(days) filter (where status = 'approved') as approved, sum(days) filter (where status = 'pending') as pending from leave.request r
      where r.person_id = b.person_id and r.type = b.type and extract(year from r.starts_on) = b.year) t on true
    where b.person_id::text = ${personId} and b.year = ${year} order by b.type`);
  return rows.filter((r) => visibleTo(who, r)).map((r) => {
    const entitled = Number(r.entitled) + Number(r.carried), taken = Number(r.taken_before) + Number(r.approved), pending = Number(r.pending);
    return { personId, type: r.type as LeaveType, year, entitled, taken, pending, left: entitled - taken - pending };
  });
}
