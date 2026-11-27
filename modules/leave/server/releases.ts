import { sql } from "drizzle-orm";
import { z } from "zod";
import type { EventHandlerDef } from "@amax/core";
import { contextFor, defineService, type ServiceOutcome } from "@amax/core/server";
import { EVENTS as DELIVERY, getProjectRef, unsuccessfulDeployment, type ReleaseDeployed } from "@amax/delivery/contracts";
import { WINDOW_DAYS } from "./clash";
import { addDays, todayOf } from "./days";

// A deployment short of Prod opens (or moves) the release's window for WINDOW_DAYS; reaching Prod
// closes it. Delivery is optional: without it no event arrives and no request ever clashes.
export const syncReleaseWindow = defineService({
  name: "leave.release_window.sync", action: "leave:admin", resource: "leave.release_window",
  input: z.object({ projectId: z.string().uuid(), version: z.string(), environment: z.string(), status: z.string(), released: z.boolean() }),
  async run(tx, a, ctx): Promise<ServiceOutcome<{ open: boolean; from: string | null; to: string | null }>> {
    if (a.released) {
      await tx.execute(sql`delete from leave.release_window where project_id = ${a.projectId} and version = ${a.version}`);
      return { result: { open: false, from: null, to: null }, resourceId: a.projectId, after: { version: a.version, open: false } };
    }
    const project = await getProjectRef(tx, a.projectId);
    if (!project) return { result: { open: false, from: null, to: null }, resourceId: a.projectId };
    const from = await todayOf(tx), to = addDays(from, WINDOW_DAYS);
    await tx.execute(sql`insert into leave.release_window (tenant_id, project_id, project_key, project_title, version, environment, retry, starts_on, ends_on)
      values (${ctx.tenantId}, ${project.id}, ${project.key}, ${project.name}, ${a.version}, ${a.environment}, ${unsuccessfulDeployment(a.status)}, ${from}, ${to})
      on conflict (tenant_id, project_id, version) do update set environment = excluded.environment, retry = excluded.retry, starts_on = excluded.starts_on, ends_on = excluded.ends_on`);
    return { result: { open: true, from, to }, resourceId: project.id, after: { version: a.version, environment: a.environment, from, to } };
  },
});

export const releaseHandler: EventHandlerDef = {
  id: "leave.release-window",
  event: DELIVERY.releaseDeployed,
  async handle({ tenantId, event }) {
    const r = event.payload as ReleaseDeployed;
    await syncReleaseWindow(contextFor.job(tenantId, "leave.release-window"), { projectId: r.projectId, version: r.version, environment: r.environment, status: r.status, released: r.released });
  },
};
