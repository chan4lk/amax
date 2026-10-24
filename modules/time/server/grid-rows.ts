import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { Viewer } from "@amax/auth";
import { workDays } from "../week";
import { expectedBy } from "./expected";
import type { TeamWeek } from "./team";

/** Hours by week, day and project for the visible weeks (optionally one project): week → day → project → hours. */
export async function entriesOf(tx: Tx, team: TeamWeek, projectId: string | null) {
  const ids = team.rows.map((r) => r.weekId);
  const out = new Map<string, Map<string, Map<string, number>>>();
  if (!ids.length) return out;
  const only = projectId ? sql`and project_id = ${projectId}` : sql``;
  for (const r of await tx.execute(sql`select week_id, to_char(day, 'YYYY-MM-DD') as day, project_id, sum(hours) as hours from time.entry
    where deleted_at is null and week_id::text in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)}) ${only} group by week_id, day, project_id`)) {
    const w = out.get(r.week_id as string) ?? new Map<string, Map<string, number>>();
    const d = w.get(r.day as string) ?? new Map<string, number>();
    d.set(r.project_id as string, Number(r.hours));
    w.set(r.day as string, d);
    out.set(r.week_id as string, w);
  }
  return out;
}

/** D9: people the viewer expects to log (073's D2) who have no timesheet this week. */
export async function notStarted(tx: Tx, v: Viewer, team: TeamWeek) {
  const have = new Set((await tx.execute(sql`select user_id from time.week where iso_year = ${team.week.year} and iso_week = ${team.week.week}`)).map((r) => r.user_id as string));
  const ids = (await expectedBy(tx, v, workDays(team.week)[4])).filter((id) => !have.has(id));
  if (!ids.length) return [];
  return (await tx.execute(sql`select id, name from auth.user where id::text in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`)).map((r) => ({ userId: r.id as string, name: r.name as string }));
}
