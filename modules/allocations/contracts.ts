// The only import surface for other modules (docs/module-standard.md). Reads run in the caller's
// tenant transaction and take an hr Reader: a viewer gets the allocations of the people their hr:read
// reaches, a system job gets everyone's. Months are the first day of the month, "2026-10-01".
import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { listPeople, type Reader } from "@amax/hr/contracts";

export type { Reader } from "@amax/hr/contracts";

/** One person's share of a month on a delivery project (projectId) or on other work (work). Percent of a full-time month. */
export type Allocation = { id: string; personId: string; projectId: string | null; work: string | null; month: string; percent: number };

export const EVENTS = { allocationSet: "allocations.allocation.set", monthCopied: "allocations.month.copied", fixSuggested: "allocations.fix.suggested", monthSettled: "allocations.month.settled" } as const;
export type MonthSettled = { personUserId: string; month: string };
/** Emitted for every allocate call: the months written, and percent 0 when the rows were removed. */
/** `standing` (107): set or ended until further notice; `months` are the ones written ahead (none when it ended). */
export type AllocationSet = { personId: string; projectId: string | null; work: string | null; months: string[]; percent: number; by: string; standing?: boolean;
  personUserId?: string | null; project?: string; month?: string; total?: number; over?: boolean; byUser?: string };
export type FixSuggested = { suggestionId: string; personUserId: string | null; projectId: string; project: string; month: string; total: number; percent: number };
/** The audited Copy to next month bulk action. */
export type MonthCopied = { team: string; from: string; to: string; rows: number; by: string };

export const monthOf = (iso: string) => `${iso.slice(0, 7)}-01`;
const day = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);

const toAllocation = (r: Record<string, unknown>): Allocation => ({
  id: r.id as string, personId: r.person_id as string, projectId: (r.project_id as string | null) ?? null, work: (r.work as string | null) ?? null,
  month: day(r.month), percent: Number(r.percent),
});

const ids = (col: string, list?: string[]) => (list ? (list.length ? sql`and ${sql.identifier(col)}::text in (${sql.join(list.map((i) => sql`${i}`), sql`, `)})` : sql`and false`) : sql``);

/**
 * A scoped read: the rows of people the reader may see, and how many people with rows it may not
 * (`hidden`), so a caller never mistakes "can't see" for "nothing allocated".
 */
export type Scoped<T> = { rows: T[]; hidden: number };

// With `personIds`, every requested person outside the reader's scope counts as hidden whether or not
// they have rows, so the count says nothing about a person the reader may not see.
async function visible<T extends { personId: string }>(tx: Tx, reader: Reader, rows: T[], requested?: string[]): Promise<Scoped<T>> {
  const ids = requested ? [...new Set(requested)] : [...new Set(rows.map((r) => r.personId))];
  if (!ids.length) return { rows, hidden: 0 };
  const seen = new Set((await listPeople(tx, reader, { ids })).map((p) => p.id));
  return { rows: rows.filter((r) => seen.has(r.personId)), hidden: ids.filter((id) => !seen.has(id)).length };
}

/** Allocations between two months (inclusive), optionally for some people or projects, of the people the reader may see. */
export async function listAllocations(tx: Tx, reader: Reader, opts: { from: string; to: string; personIds?: string[]; projectIds?: string[] }): Promise<Scoped<Allocation>> {
  return visible(tx, reader, (await tx.execute(sql`select * from allocations.allocation where month between ${monthOf(opts.from)}::date and ${monthOf(opts.to)}::date
    ${ids("person_id", opts.personIds)} ${ids("project_id", opts.projectIds)} order by person_id, month, project_id nulls last, work`)).map(toAllocation), opts.personIds);
}

/** Each person's total percent per month (people the reader may see): what over-allocation (above their FTE) is judged on. */
export async function personMonthTotals(tx: Tx, reader: Reader, opts: { from: string; to: string; personIds?: string[] }): Promise<Scoped<{ personId: string; month: string; percent: number }>> {
  return visible(tx, reader, (await tx.execute(sql`select person_id, month, sum(percent)::int as percent from allocations.allocation
    where month between ${monthOf(opts.from)}::date and ${monthOf(opts.to)}::date ${ids("person_id", opts.personIds)} group by person_id, month order by person_id, month`))
    .map((r) => ({ personId: r.person_id as string, month: day(r.month), percent: Number(r.percent) })), opts.personIds);
}

export { monthOutlook, type MonthOutlook } from "./server/outlook";
export { windowMonths } from "./server/months";
