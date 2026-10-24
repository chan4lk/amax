import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { can, canEver, type Viewer } from "@amax/auth";
import { entitiesOf, inEntity, reaches } from "./chain";

/**
 * 071 AC-13: whose hours a viewer may see in a range, for Reports' utilisation, on Time's week scope: their own;
 * time:team or an approver in the person's entity; a manager who approves time; and a PM for people with hours on a
 * project they manage in the range. Nobody else's.
 */
export async function hoursVisibleTo(tx: Tx, v: Viewer, q: { userIds: string[]; from: string; to: string }): Promise<Set<string>> {
  const ids = [...new Set(q.userIds)];
  if (!ids.length) return new Set();
  const entities = await entitiesOf(tx, ids);
  const timeOn = Boolean((await tx.execute(sql`select to_regclass('time.entry') is not null as on`))[0]?.on);
  const managed = timeOn && v.managedProjects.length && canEver(v, "time:approve") ? await tx.execute(sql`select distinct user_id, project_id from time.entry
    where deleted_at is null and day between ${q.from} and ${q.to} and project_id::text in (${sql.join(v.managedProjects.map((p) => sql`${p}`), sql`, `)})`) : [];
  const onMine = (id: string) => managed.some((m) => m.user_id === id && can(v, "time:approve", { projectId: m.project_id as string, ...inEntity(entities.get(id) ?? null) }));
  return new Set(ids.filter((id) => {
    const e = entities.get(id) ?? null;
    return id === v.userId || can(v, "time:team", inEntity(e)) || can(v, "time:approve", inEntity(e))
      || (v.reports.includes(id) && canEver(v, "time:approve") && reaches(v, e)) || onMine(id);
  }));
}
