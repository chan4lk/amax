import { sql } from "drizzle-orm";
import { withTenant } from "@amax/db";
import { getRuntime } from "@amax/core/server";
import { cron, defineWorkflow, step } from "@amax/workflows";
import { refreshProposalHours } from "./proposal-hours";

/**
 * 104 review round 4: approved and waiting hours per proposal, recomputed nightly for every project with time on it.
 * The event handlers keep them current as entries and weeks change; this run fills them in for proposals that had hours
 * before 104 (waiting_hours starts at 0) and puts right anything an event missed. Idempotent: the same figures twice.
 */
export const proposalHoursWorkflows = [defineWorkflow({
  name: "time.proposal-hours-refresh", title: "Proposal hours refresh",
  async run(ctx) {
    const projects = await step("projects", () => withTenant(getRuntime().db, ctx.tenantId, async (tx) =>
      (await tx.execute(sql`select distinct project_id from time.entry where deleted_at is null and proposal_id is not null`)).map((r) => r.project_id as string)), { timeout: "1m" });
    await step("refresh", () => withTenant(getRuntime().db, ctx.tenantId, (tx) => refreshProposalHours(tx, ctx.tenantId, projects)), { timeout: "5m", retry: { maxAttempts: 3 } });
    return { ok: true, summary: `Refreshed ${projects.length} projects` };
  },
})];

export const proposalHoursSchedules = [
  cron({ name: "time.proposal-hours-refresh", title: "Proposal hours refresh", description: "Nightly: recomputes approved and waiting hours on every proposal with time logged against it", workflow: "time.proposal-hours-refresh", cron: "30 2 * * *", timezone: "entity" }),
];
