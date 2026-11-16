import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { viewerOf } from "@amax/auth";
import { defineService, type ServiceContext } from "@amax/core/server";

// Kept apart from services.ts so contracts.ts can publish it without an import cycle
// (services.ts reads PHASES from contracts.ts while it loads).

export const DEFAULT_ENVIRONMENTS = ["Dev", "QA", "UAT", "Prod"];

export async function ensureEnvironments(tx: Tx, tenantId: string, projectId: string) {
  for (const [i, name] of DEFAULT_ENVIRONMENTS.entries()) {
    await tx.execute(sql`insert into delivery.environment (tenant_id, project_id, name, position, is_prod)
      values (${tenantId}, ${projectId}, ${name}, ${i + 1}, ${name === "Prod"}) on conflict do nothing`);
  }
}

export const projectInput = z.object({
  key: z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/, "2–10 capitals or digits, e.g. CON"),
  name: z.string().min(1),
  client: z.string().min(1),
  billing: z.enum(["fixed", "t&m", "retainer", "internal"]),
  managerName: z.string().optional(),
});
// Only the contract takes a sourceRef: "<module id>.<record>:<id>", e.g. presales.opportunity:OPP0042
// or it-access.request:REQ-7 (module ids are lowercase with hyphens).
const sourcedInput = projectInput.extend({ sourceRef: z.string().regex(/^[a-z][a-z0-9-]*\.[a-z][a-z0-9_]*:[A-Za-z0-9_-]{1,100}$/, "module.record:id").optional() });
export type ProjectInput = z.infer<typeof sourcedInput>;
export type CreatedProject = { id: string; key: string; existing?: true };

/** The key is taken, or the sourceRef already made a project under another key. Retrying won't help. */
export class ProjectConflictError extends Error {
  readonly retryable = false;
  constructor(message: string, readonly existingKey: string) {
    super(message);
    this.name = "ProjectConflictError";
  }
}

const one = async (tx: Tx, where: ReturnType<typeof sql>) => (await tx.execute(sql`select id, key from delivery.project where ${where}`))[0];

// A create that inserted nothing: the same sourceRef and key is the project we made (a retry or
// a race that waited for it); anything else is a conflict the caller must see.
async function conflictOf(tx: Tx, input: ProjectInput) {
  const made = input.sourceRef ? await one(tx, sql`source_ref = ${input.sourceRef}`) : undefined;
  if (made && made.key === input.key) return { id: made.id as string, key: made.key as string, existing: true as const };
  if (made) throw new ProjectConflictError(`${input.sourceRef} already made project ${made.key as string}`, made.key as string);
  if (await one(tx, sql`key = ${input.key}`)) throw new ProjectConflictError(`project key ${input.key} is taken; choose another`, input.key);
  // Neither row is visible: an unknown outcome, so a plain (retryable) error rather than a conflict.
  throw new Error(`project ${input.key} wasn't created and the clash couldn't be identified; try again`);
}

export async function insertProject(tx: Tx, input: ProjectInput, ctx: ServiceContext) {
  const [p] = await tx.execute(sql`insert into delivery.project (tenant_id, key, name, client, billing, manager_name, manager_user_id, source_ref)
    values (${ctx.tenantId}, ${input.key}, ${input.name}, ${input.client}, ${input.billing}, ${input.managerName ?? null},
            ${viewerOf(ctx)?.userId ?? null}, ${input.sourceRef ?? null})
    on conflict do nothing returning id, key`);
  if (!p) {
    const result = await conflictOf(tx, input);
    return { result: result as CreatedProject, resourceId: result.id, after: { sourceRef: input.sourceRef, existing: true } };
  }
  await ensureEnvironments(tx, ctx.tenantId, p.id as string);
  return { result: { id: p.id as string, key: p.key as string } as CreatedProject, resourceId: p.id as string, after: input };
}

const spec = { name: "delivery.project.create", action: "delivery:project:create", resource: "delivery.project" };
export const createProjectService = defineService({ ...spec, input: projectInput, run: insertProject });
export const createSourcedProject = defineService({ ...spec, input: sourcedInput, run: insertProject });
