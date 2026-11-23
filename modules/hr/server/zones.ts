import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { entityZoneSet } from "@amax/workflows";
import { entityDay } from "./inforce";

/** Review round 2: HR's refusal for an entity whose today it can't know. */
export const noZone = (name: string) => `${name} has no time zone set: set one before adding people there or recording leavers`;

/**
 * 109 AC-5: today in the legal entity's own time zone, the one date HR decides joining, active and left by. Review round
 * 2: an entity with no zone set (its own, or its country's default) is refused, never counted in UTC. 111 AC-1: the
 * date is the database's (entityDay), the same engine HR's in-force reads use.
 */
export async function entityToday(tx: Tx, entityId: string) {
  if (!(await entityZoneSet(tx, entityId))) {
    const [e] = await tx.execute(sql`select name from core.legal_entity where id = ${entityId}`);
    throw new Error(noZone(String(e?.name ?? "This legal entity")));
  }
  const [r] = await tx.execute(sql`select to_char(${entityDay(sql`${entityId}::uuid`)}, 'YYYY-MM-DD') as day`);
  return String(r.day);
}

/** 110 AC-3: the legal entities with no time zone (their own or their country's), whose people HR can't move or add. */
export async function unzonedEntities(tx: Tx): Promise<{ id: string; name: string }[]> {
  const entities = await tx.execute(sql`select id, name from core.legal_entity order by name`);
  const out: { id: string; name: string }[] = [];
  for (const e of entities) if (!(await entityZoneSet(tx, e.id as string))) out.push({ id: e.id as string, name: String(e.name) });
  return out;
}

/** The People screen's line and the status job's failure, in one wording. */
export const unzonedLine = (name: string) => `${name} has no time zone set: its joiners and leavers aren't moved, and people can't be added there`;

// Legal entities' names and zones are tenant-wide, as the People screen's entity filter is: every hr:read viewer sees them.

/** 110 AC-3: one legal entity and its time zone (null when it has none, own or country's), for its pin. */
export async function getLegalEntity(tx: Tx, entityId: string) {
  const [e] = await tx.execute(sql`select id, name, country from core.legal_entity where id = ${entityId}`);
  return e ? { id: e.id as string, name: String(e.name), country: String(e.country), timezone: await entityZoneSet(tx, entityId) } : null;
}
