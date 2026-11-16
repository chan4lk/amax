import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";

export const HORIZON = 12;
export const addMonths = (month: string, n: number) => { const d = new Date(`${month}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
const ahead = (from: string, n: number) => Array.from({ length: n }, (_, i) => addMonths(from, i));
export const day = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);

type Slot = { personId: string; projectId: string; month: string; percent: number; by: string; tenantId: string };

/** Writes a standing allocation's months that have no row yet: a month set by hand wins. Returns the months written. */
export async function fill(tx: Tx, standingId: string, s: Omit<Slot, "month">, months: string[]) {
  const written: string[] = [];
  for (const m of months) {
    const [row] = await tx.execute(sql`insert into allocations.allocation (tenant_id, person_id, project_id, month, percent, updated_by, standing_id)
      values (${s.tenantId}, ${s.personId}, ${s.projectId}, ${m}, ${s.percent}, ${s.by}, ${standingId}) on conflict do nothing returning id`);
    if (row) written.push(m);
  }
  return written;
}

/**
 * Sets or ends a person's standing allocation on a project from `month`. Any open one is ended there; only the month rows
 * standing allocations wrote from then on are replaced, so a month set by hand wins. Returns the months written and the
 * rows it removed (the audit's `before`).
 */
export async function setStanding(tx: Tx, s: Slot): Promise<{ months: string[]; removed: Record<string, unknown>[]; standing: Record<string, unknown>[] }> {
  const slot = sql`person_id = ${s.personId} and project_id = ${s.projectId}`;
  await lockStanding(tx, s.personId, s.projectId);
  const removed = await tx.execute(sql`delete from allocations.allocation where ${slot} and standing_id is not null and month >= ${s.month}::date returning to_char(month, 'YYYY-MM-DD') as month, percent`);
  const ended = await tx.execute(sql`update allocations.standing set until_month = ${s.month}, updated_by = ${s.by}, updated_at = now() where ${slot} and until_month is null and from_month < ${s.month} returning ${STANDING_COLS}`);
  const dropped = await tx.execute(sql`delete from allocations.standing where ${slot} and until_month is null and from_month >= ${s.month} returning ${STANDING_COLS}`);
  const standing = [...ended, ...dropped];
  if (s.percent === 0) return { months: [], removed, standing };
  // 109 AC-2: months removed by hand from the new start on stay removed when it is set again.
  const kept = [...new Set(standing.flatMap((r) => (r.skip as string[] | null) ?? []).map(day).filter((m) => m >= s.month))].sort();
  const months = ahead(s.month, HORIZON);
  const [row] = await tx.execute(sql`insert into allocations.standing (tenant_id, person_id, project_id, percent, from_month, filled_to, updated_by, skip)
    values (${s.tenantId}, ${s.personId}, ${s.projectId}, ${s.percent}, ${s.month}, ${months[months.length - 1]}, ${s.by}, ${`{${kept.join(",")}}`}::date[]) returning id`);
  return { months: await fill(tx, row.id as string, s, months.filter((m) => !kept.includes(m))), removed, standing };
}

const STANDING_COLS = sql`percent, to_char(from_month, 'YYYY-MM-DD') as from_month, to_char(until_month, 'YYYY-MM-DD') as until_month, to_json(skip) as skip`;

/**
 * Review round 2: every writer of a slot that a standing allocation covers takes its row lock first, before reading or
 * deleting month rows, so a month the extend job is writing is either seen committed or written after; never missed.
 */
export async function lockStanding(tx: Tx, personId: string, projectId: string) {
  await tx.execute(sql`select id from allocations.standing where person_id = ${personId} and project_id = ${projectId} and until_month is null for update`);
}

/** A month removed by hand past what a standing allocation has written: the monthly job leaves it out. */
export async function skipMonths(tx: Tx, personId: string, projectId: string, months: string[]) {
  await tx.execute(sql`update allocations.standing set skip = array(select distinct unnest(skip || ${`{${months.join(",")}}`}::date[]))
    where person_id = ${personId} and project_id = ${projectId} and until_month is null`);
}

const open = (tx: Tx, where = sql`true`) => tx.execute(sql`select person_id, project_id from allocations.standing where until_month is null and ${where}`);

/** The people standing on a project now: their team rows read "until further notice". */
export const standingOn = async (tx: Tx, projectId: string) => new Set((await open(tx, sql`project_id = ${projectId}`)).map((r) => r.person_id as string));

/** Every open standing slot as "personId:projectId", for the grid's mark. */
export const standingSlots = async (tx: Tx) => new Set((await open(tx)).map((r) => `${r.person_id}:${r.project_id}`));

