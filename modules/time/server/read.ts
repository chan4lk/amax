import { sql } from "drizzle-orm";
import { withTenant, type Tx } from "@amax/db";
import { can, type Viewer } from "@amax/auth";
import { ForbiddenError, getRuntime } from "@amax/core/server";
import { listProjectRefs } from "@amax/delivery/contracts";
import { isoWeekOf, type IsoWeek } from "../week";

export const read = async <T>(viewer: Viewer, fn: (tx: Tx) => Promise<T>) => {
  if (!can(viewer, "time:read")) throw new ForbiddenError("time:read", "time");
  return withTenant(getRuntime().db, viewer.tenantId, fn);
};

export type DayHours = { agent: number; person: number };
export type EntrySum = { week_id: string; project_id: string; day: string; source: string; hours: number };

export async function entrySums(tx: Tx, w: IsoWeek, userId?: string): Promise<EntrySum[]> {
  const mine = userId ? sql`and w.user_id = ${userId}` : sql``;
  const rows = await tx.execute(sql`select e.week_id, e.project_id, to_char(e.day, 'YYYY-MM-DD') as day, e.source, sum(e.hours) as hours
    from time.entry e join time.week w on w.id = e.week_id where w.iso_year = ${w.year} and w.iso_week = ${w.week} and e.deleted_at is null ${mine}
    group by e.week_id, e.project_id, e.day, e.source`);
  return rows.map((r) => ({ week_id: r.week_id as string, project_id: r.project_id as string, day: r.day as string, source: r.source as string, hours: Number(r.hours) }));
}

export async function projectNames(tx: Tx) {
  return new Map((await listProjectRefs(tx)).map((p) => [p.id, p.name]));
}

export async function latestWeek(tx: Tx, userId?: string): Promise<IsoWeek> {
  const mine = userId ? sql`and user_id = ${userId}` : sql``;
  const [r] = await tx.execute(sql`select iso_year, iso_week from time.week where starts_on <= current_date ${mine} order by starts_on desc limit 1`);
  return r ? { year: Number(r.iso_year), week: Number(r.iso_week) } : isoWeekOf(new Date());
}

export type EntryLine = { id: string; projectId: string; projectName: string; day: string; hours: number; billable: boolean; source: string; note: string | null };

/** 070 AC-5: a week's entries by id, so chat can name the one to correct or delete. */
export async function weekEntries(tx: Tx, weekId: string, names: Map<string, string>): Promise<EntryLine[]> {
  const rows = await tx.execute(sql`select id, project_id, to_char(day, 'YYYY-MM-DD') as day, hours, billable, source, note from time.entry where week_id = ${weekId} and deleted_at is null order by day, created_at`);
  return rows.map((r) => ({ id: r.id as string, projectId: r.project_id as string, projectName: names.get(r.project_id as string) ?? "Closed project", day: r.day as string, hours: Number(r.hours),
    billable: Boolean(r.billable), source: r.source as string, note: (r.note as string | null) ?? null }));
}

export const round1 = (n: number) => Math.round(n * 10) / 10;

export const hoursOf = (sums: EntrySum[], keep: (s: EntrySum) => boolean) => round1(sums.filter(keep).reduce((n, s) => n + s.hours, 0));
