import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { can, type Viewer } from "@amax/auth";
import { adminOver, entitiesOf, inEntity, type Entity } from "./chain";
import { allocationsInstalled } from "./rules";

const back4 = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - 28 * 86_400_000).toISOString().slice(0, 10);

/** People with time or an allocation on one of these projects in the four weeks up to `day` (073 D2). */
async function onProjects(tx: Tx, projectIds: string[] | null, day: string): Promise<Set<string>> {
  if (projectIds && !projectIds.length) return new Set();
  const only = (col: string) => (projectIds ? sql`and ${sql.identifier(col)}::text in (${sql.join(projectIds.map((p) => sql`${p}`), sql`, `)})` : sql``);
  const time = await tx.execute(sql`select distinct user_id from time.entry where deleted_at is null and day between ${back4(day)} and ${day} ${only("project_id")}`);
  const alloc = (await allocationsInstalled(tx)) ? await tx.execute(sql`select distinct p.user_id from allocations.allocation a join hr.person p on p.id = a.person_id
    where p.user_id is not null and a.project_id is not null and a.month between date_trunc('month', ${back4(day)}::date) and date_trunc('month', ${day}::date) ${only("project_id")}`) : [];
  return new Set([...time, ...alloc].map((r) => r.user_id as string));
}

/**
 * 073 D2: who a viewer expects to log time on a day: their reports; people with time or an allocation on a project they
 * manage in the last four weeks; and, for Admins and time:team, everyone in their legal entities who had time or an
 * allocation in the last four weeks (so people who never log time aren't reminded). Never themself.
 */
export async function expectedBy(tx: Tx, v: Viewer, day: string): Promise<string[]> {
  const users = await tx.execute(sql`select id from auth.user where status = 'active' and id <> ${v.userId}`);
  const ids = users.map((u) => u.id as string);
  const entities = await entitiesOf(tx, ids);
  const managed = await onProjects(tx, v.managedProjects, day);
  const recent = await onProjects(tx, null, day);
  const wide = (id: string, e: Entity) => recent.has(id) && (can(v, "time:team", inEntity(e)) || adminOver(v, e));
  return ids.filter((id) => v.reports.includes(id) || managed.has(id) || wide(id, entities.get(id) ?? null));
}

/** Everyone active in an entity with time or an allocation in the last four weeks: the daily reminder's people (D2). */
export async function expectedIn(tx: Tx, entityId: string, day: string): Promise<string[]> {
  const recent = await onProjects(tx, null, day);
  const users = await tx.execute(sql`select id from auth.user where status = 'active' and legal_entity_id = ${entityId}`);
  return users.map((u) => u.id as string).filter((id) => recent.has(id));
}
