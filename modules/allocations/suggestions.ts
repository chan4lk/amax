import { sql } from "drizzle-orm";
import { withTenant } from "@amax/db";
import { contextFor, getRuntime } from "@amax/core/server";
import { defineSuggestionKind } from "@amax/agents";
import { createSuggestion } from "@amax/agents/server";
import { cron, defineWorkflow, step } from "@amax/workflows";
import { getProjectRef } from "@amax/delivery/contracts";
import { getPerson } from "@amax/hr/contracts";
import { monthLabel } from "./server/months";
import { monthWords } from "./server/load";
import { Rebalance, set } from "./suggestions-set";
import { fixSuggested, told } from "./server/suggested";

// 006: an allocation change an agent suggests. Undo restores the earlier percent until the month starts.
export const rebalance = defineSuggestionKind<Rebalance, { was: number }>({
  kind: "allocations.rebalance",
  title: "Allocation change",
  permission: "allocations:allocate",
  proposed: Rebalance,
  jobs: ["allocations.agent-check"],
  apply: (tx, ctx, p) => set(tx, ctx, p, p.percent),
  undo: (tx, ctx, p, a) => set(tx, ctx, p, a.was),
  cutoff: (p) => new Date(`${p.month}T00:00:00Z`),
});

const OVER = sql`select a.person_id, a.month::text as month, sum(a.percent)::int as total,
    (array_agg(a.project_id order by a.percent desc, a.project_id) filter (where a.project_id is not null))[1] as project_id,
    (array_agg(a.percent order by a.percent desc, a.project_id) filter (where a.project_id is not null))[1] as percent
  from allocations.allocation a where a.month > date_trunc('month', now()) and a.month <= date_trunc('month', now()) + interval '3 months'
  group by a.person_id, a.month having sum(a.percent) > 100`;

/** One pass: each person over 100% in a coming month gets a suggestion to trim their largest project, for that project's manager. */
export async function checkAllocations(tenantId: string) {
  return withTenant(getRuntime().db, tenantId, async (tx) => {
    const job = contextFor.job(tenantId, "allocations.agent-check");
    let n = 0;
    for (const r of await tx.execute(OVER)) {
      const [person, project] = [await getPerson(tx, job, r.person_id as string), r.project_id ? await getProjectRef(tx, r.project_id as string) : null];
      if (!person || !project) continue;
      const to = Math.max(0, Number(r.percent) - (Number(r.total) - 100));
      const plan = await tx.execute(sql`select project_id, work, percent from allocations.allocation where person_id = ${person.id} and month = ${r.month}::date order by percent desc`);
      const parts = await Promise.all(plan.map(async (x) => `${x.project_id ? (await getProjectRef(tx, x.project_id as string))?.name ?? "a project" : x.work} ${x.percent}%`));
      const by = contextFor.job(tenantId, "allocations.agent-check", project.managerUserId ? `user:${project.managerUserId}` : undefined);
      const made = await createSuggestion(by, {
        kind: rebalance.kind, target: { type: "allocations.slot", id: `${person.id}:${project.id}:${r.month}`, label: `${person.name}, ${project.name}, ${monthLabel(r.month as string, "long")}` },
        title: `${person.name} is at ${r.total}% in ${monthWords(r.month as string)}`, detail: `${parts.join(", ")}, above 100% capacity.`,
        proposed: { personId: person.id, projectKey: project.key, month: r.month, percent: to }, confidence: 0.8, agentName: "Allocation check", scope: { projectId: project.id, legalEntityId: project.legalEntityId },
        evidence: [{ type: "record", label: `${monthLabel(r.month as string, "long")} plan`, ref: `/allocations` }],
      });
      if (made.existing && await told(tx, made.id)) continue;
      if (!made.existing) n++;
      await fixSuggested(by, { suggestionId: made.id, personUserId: person.userId, projectId: project.id, project: project.name, month: monthWords(r.month as string), total: Number(r.total), percent: to });
    }
    return n;
  });
}

export const agentCheck = defineWorkflow({
  name: "allocations.agent-check",
  title: "Allocation check",
  async run(ctx) {
    const n = await step("scan", () => checkAllocations(ctx.tenantId), { timeout: "2m" });
    return { summary: n ? `${n} new suggestion${n === 1 ? "" : "s"}` : "Nobody over-allocated" };
  },
});

export const agentCheckSchedule = cron({ name: "allocations.agent-check", title: "Allocation check", description: "Suggests rebalancing people planned over 100% in the next three months", workflow: "allocations.agent-check", cron: "0 6 * * 1", enabled: false });
