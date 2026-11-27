import { sql } from "drizzle-orm";
import { z } from "zod";
import { ScopeError } from "@amax/auth";
import { contextFor, defineService, isSystemContext, type Emitted } from "@amax/core/server";
import { cron, defineWorkflow, step } from "@amax/workflows";
import { clockOf } from "./queries";
import { statusAt, writeStatus, zoneOf } from "./release-tracking";

type Moved = { project: string; version: string; from: string; to: string };

export const evaluateReleases = defineService({
  name: "delivery.release.evaluate",
  action: "delivery:release:create",
  resource: "delivery.release",
  input: z.object({}),
  async run(tx, _input, ctx) {
    if (!isSystemContext(ctx)) throw new ScopeError("delivery:release:create");
    const now = await clockOf(tx);
    const open = await tx.execute(sql`select r.id, r.tenant_id, r.version, r.status, r.start_date::text as start_date, r.target_date::text as target_date,
      p.key, p.legal_entity_id from delivery.release r join delivery.project p on p.id = r.project_id
      where r.category is not null and r.status <> 'completed' order by r.id for update of r`);
    const zones = new Map<string, string>();
    const changed: Moved[] = [];
    const events: Emitted[] = [];
    for (const r of open) {
      const entity = (r.legal_entity_id as string | null) ?? "";
      if (!zones.has(entity)) zones.set(entity, await zoneOf(tx, r));
      const to = statusAt(zones.get(entity)!, now, { startDate: r.start_date as string, targetDate: r.target_date as string });
      if (to === r.status) continue;
      const e = await writeStatus(tx, r, to, "schedule", "amax");
      if (e) events.push(e);
      changed.push({ project: r.key as string, version: r.version as string, from: r.status as string, to });
    }
    return { result: { changed: changed.length }, resourceId: "delivery.release", after: { changed }, events };
  },
});

export const releaseCheck = defineWorkflow({
  name: "delivery.release-status",
  title: "Release status check",
  async run(ctx) {
    const r = await step("evaluate", () => evaluateReleases(contextFor.job(ctx.tenantId, "delivery.release-status"), {}), { timeout: "2m" });
    return { summary: `${r.changed} ${r.changed === 1 ? "release" : "releases"} moved` };
  },
});

export const releaseCheckSchedule = cron({ name: "delivery.release-status", title: "Release status check", description: "Moves releases as their start and target dates pass",
  workflow: "delivery.release-status", cron: "0 * * * *", timezone: "UTC", enabled: true });
