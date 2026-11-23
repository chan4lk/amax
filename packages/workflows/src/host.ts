import { sql, type SQL } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { StartOptions, WorkflowEngine } from "./engine";
import { ENTITY_ZONES } from "./schedules";
import type { Json } from "./types";

// Modules never import an engine (docs/architecture.md); the host registers how to reach its one, the
// way @amax/auth's setViewerResolver works for the signed-in viewer (030).
let engine: (() => Promise<WorkflowEngine>) | undefined;

export const setWorkflowEngine = (fn: (() => Promise<WorkflowEngine>) | undefined) => {
  engine = fn;
};

/** Starts a run on the host's engine. With `tx`, the run exists only if the caller's write commits. */
export async function startWorkflow(tenantId: string, workflow: string, input: Json, options: StartOptions) {
  if (!engine) throw new Error("amax: no workflow engine registered (setWorkflowEngine)");
  return (await engine()).start(tenantId, workflow, input, options);
}

/** A legal entity's time zone: its own (workflows.entity_zone), else its country's default, else UTC. */
export async function entityZone(tx: Tx, legalEntityId: string | null): Promise<string> {
  return (legalEntityId ? await entityZoneSet(tx, legalEntityId) : null) ?? "UTC";
}

/**
 * 110: the one rule for an entity's zone, as SQL for any query: its own (workflows.entity_zone), else its country's
 * default, else null. `entityId` is a SQL expression, such as a column of the caller's row.
 */
export const entityZoneSql = (entityId: SQL) => sql`coalesce(
  (select z.timezone from workflows.entity_zone z where z.legal_entity_id = ${entityId}),
  (select ${JSON.stringify(ENTITY_ZONES)}::jsonb ->> trim(e0.country) from core.legal_entity e0 where e0.id = ${entityId}))`;

/** 109: the zone an entity has, its own or its country's, or null where entityZone would fall back to UTC, so a screen can say so. */
export async function entityZoneSet(tx: Tx, legalEntityId: string): Promise<string | null> {
  const [r] = await tx.execute(sql`select ${entityZoneSql(sql`${legalEntityId}::uuid`)} as zone`);
  return (r?.zone as string | null) ?? null;
}
