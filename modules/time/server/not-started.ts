import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { Viewer } from "@amax/auth";
import { parseWeekKey, workDays } from "../week";
import { expectedBy } from "./expected";

export type NotStarted = { userId: string; name: string; ok: boolean; why: string | null };

/**
 * 073: people named for a week reminder who have no timesheet that week ("Not started" on Team time). Only people the
 * viewer is responsible for (073's D2, as Team time decides who shows) and who still have no week can be reminded.
 */
export async function notStartedIn(tx: Tx, v: Viewer, weekKey: string, userIds: string[]): Promise<NotStarted[]> {
  const week = parseWeekKey(weekKey);
  if (!week || !userIds.length) return [];
  const ids = sql.join(userIds.map((i) => sql`${i}`), sql`, `);
  const expected = new Set(await expectedBy(tx, v, workDays(week)[4]));
  const have = new Set((await tx.execute(sql`select user_id from time.week where iso_year = ${week.year} and iso_week = ${week.week} and user_id::text in (${ids})`)).map((r) => r.user_id as string));
  const names = new Map((await tx.execute(sql`select id, name from auth.user where id::text in (${ids})`)).map((r) => [r.id as string, r.name as string]));
  return userIds.map((id) => {
    const why = !expected.has(id) || !names.has(id) ? "not one you can act on" : have.has(id) ? "already has a timesheet" : null;
    return { userId: id, name: names.get(id) ?? "Someone", ok: !why, why };
  });
}
