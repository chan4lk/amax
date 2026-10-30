import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { can, type Viewer } from "@amax/auth";
import { contextFor } from "@amax/core/server";
import { listAllocations } from "@amax/allocations/contracts";
import { listPeople } from "@amax/hr/contracts";
import { adminOver, entitiesOf, inEntity, type Entity } from "./chain";
import { allocationsInstalled } from "./rules";

const back4 = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - 28 * 86_400_000).toISOString().slice(0, 10);


/**
 * People with time or an allocation on one of these projects in the four weeks up to `day` (073 D2). Time is this
 * module's own table; allocations and people come through their owners' contracts (073 review round 1: never raw SQL
 * against another schema). They are read as a system job (round 2): this only decides who is expected to log, and
 * expectedBy then keeps only the viewer's reports, people on projects they manage, or their team's entities, so no
 * one outside the viewer's own rules is shown. Read as the viewer, HR scope would drop a PM's allocated people
 * silently ("could not see" read as "not allocated").
 */
async function onProjects(tx: Tx, tenantId: string, projectIds: string[] | null, day: string): Promise<Set<string>> {
  if (projectIds && !projectIds.length) return new Set();
  const only = projectIds ? sql`and project_id::text in (${sql.join(projectIds.map((p) => sql`${p}`), sql`, `)})` : sql``;
  const time = (await tx.execute(sql`select distinct user_id from time.entry where deleted_at is null and day between ${back4(day)} and ${day} ${only}`)).map((r) => r.user_id as string);
  if (!(await allocationsInstalled(tx))) return new Set(time);
  const system = contextFor.job(tenantId, "time.expected");
  const { rows } = await listAllocations(tx, system, { from: back4(day), to: day, ...(projectIds ? { projectIds } : {}) });
  const personIds = [...new Set(rows.filter((a) => a.projectId).map((a) => a.personId))];
  const people = personIds.length ? await listPeople(tx, system, { ids: personIds }) : [];
  return new Set([...time, ...people.flatMap((p) => (p.userId ? [p.userId] : []))]);
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
  const managed = await onProjects(tx, v.tenantId, v.managedProjects, day);
  const recent = await onProjects(tx, v.tenantId, null, day);
  const wide = (id: string, e: Entity) => recent.has(id) && (can(v, "time:team", inEntity(e)) || adminOver(v, e));
  return ids.filter((id) => v.reports.includes(id) || managed.has(id) || wide(id, entities.get(id) ?? null));
}

/** Everyone active in an entity with time or an allocation in the last four weeks: the daily reminder's people (D2). */
export async function expectedIn(tx: Tx, tenantId: string, entityId: string, day: string): Promise<string[]> {
  const recent = await onProjects(tx, tenantId, null, day);
  const users = await tx.execute(sql`select id from auth.user where status = 'active' and legal_entity_id = ${entityId}`);
  return users.map((u) => u.id as string).filter((id) => recent.has(id));
}
