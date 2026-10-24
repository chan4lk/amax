import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { can, canEver, type Viewer } from "@amax/auth";
import type { ApprovalChain } from "../contracts";

// 071 AC-4: checks about another person's week carry the owner's legal entity. An owner with none is out of every
// entity-scoped grant (fails closed); unscoped grants still reach them. can.ts is unchanged (PLT-B05).
const NO_ENTITY = "00000000-0000-4000-8000-000000000000";
export type Entity = string | null;
export const inEntity = (entity: Entity) => ({ legalEntityId: entity ?? NO_ENTITY });
export const reaches = (v: Viewer, entity: Entity) => v.assignments.some((a) => a.legalEntityIds === null || a.legalEntityIds.includes(entity ?? NO_ENTITY));

export async function entitiesOf(tx: Tx, userIds: string[]): Promise<Map<string, Entity>> {
  if (!userIds.length) return new Map();
  const rows = await tx.execute(sql`select id, legal_entity_id from auth.user where id::text in (${sql.join([...new Set(userIds)].map((id) => sql`${id}`), sql`, `)})`);
  return new Map(rows.map((r) => [r.id as string, (r.legal_entity_id as string | null) ?? null]));
}
export const entityOf = async (tx: Tx, userId: string) => (await entitiesOf(tx, [userId])).get(userId) ?? null;

export function chainFor(v: Viewer | undefined, ownerId: string, projectIds: string[], entity: Entity): ApprovalChain | null {
  if (!v || ownerId === v.userId) return null;
  if (can(v, "time:approve", inEntity(entity))) return "admin";
  if (v.reports.includes(ownerId) && canEver(v, "time:approve") && reaches(v, entity)) return "manager";
  if (projectIds.some((projectId) => can(v, "time:approve", { projectId, ...inEntity(entity) }))) return "project";
  return null;
}

export const seesWeek = (v: Viewer, ownerId: string, projectIds: string[], entity: Entity) =>
  ownerId !== v.userId && (can(v, "time:team", inEntity(entity)) || chainFor(v, ownerId, projectIds, entity) !== null);

/** Admin-only acts on another person's week (reopen, a locked change), in the owner's entity. */
export const adminOver = (v: Viewer, entity: Entity) => can(v, "time:admin", inEntity(entity));
