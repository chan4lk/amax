import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { Viewer } from "@amax/auth";
import { isoWeekOf, weekKey } from "../week";
import { entitiesOf, seesWeek } from "./chain";
import { weekProjects } from "./weeks";

/**
 * 071 AC-13: whose hours a viewer may see, for Reports' utilisation, decided week by week by Time's own rule
 * (seesWeek, with the owner's legal entity), so a report is never wider than Time: their own; time:team or an
 * approver in the person's entity; a manager who approves time there; and a PM only for the weeks that hold hours
 * on a project they approve (071 review round 1: not the person's whole range).
 */
export async function hoursVisibleTo(tx: Tx, v: Viewer, q: { userIds: string[]; from: string; to: string }): Promise<(userId: string, day: string) => boolean> {
  const ids = [...new Set(q.userIds)];
  if (!ids.length) return () => false;
  const entities = await entitiesOf(tx, ids);
  const timeOn = Boolean((await tx.execute(sql`select to_regclass('time.entry') is not null as on`))[0]?.on);
  // The weeks the range touches, each with the projects of every live entry in the week, as Time's own reads count
  // them (weekProjectIds), so a week across the range's edge reads the same in Time and in Reports (review round 2).
  const weeks = timeOn ? await tx.execute(sql`select w.user_id, w.iso_year, w.iso_week, ${weekProjects} as projects from time.week w
    where w.id in (select week_id from time.entry where deleted_at is null and day between ${q.from} and ${q.to})
    and w.user_id::text in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`) : [];
  const projectsIn = new Map(weeks.map((r) => [`${r.user_id}:${weekKey({ year: Number(r.iso_year), week: Number(r.iso_week) })}`, (r.projects as string[]) ?? []]));
  const seen = new Map<string, boolean>();
  return (userId, day) => {
    if (userId === v.userId) return true;
    const key = `${userId}:${weekKey(isoWeekOf(new Date(`${day}T00:00:00Z`)))}`;
    if (!seen.has(key)) seen.set(key, seesWeek(v, userId, projectsIn.get(key) ?? [], entities.get(userId) ?? null));
    return seen.get(key)!;
  };
}
