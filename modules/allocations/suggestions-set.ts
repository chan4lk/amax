import { sql } from "drizzle-orm";
import { z } from "zod";
import { getProjectRef } from "@amax/delivery/contracts";
import { setAllocation } from "./server/services";

export const Rebalance = z.object({ personId: z.uuid(), projectKey: z.string().min(1), month: z.string().regex(/^\d{4}-\d{2}-01$/), percent: z.number().int().min(0).max(200) });
export type Rebalance = z.infer<typeof Rebalance>;

const percentOf = async (tx: Parameters<typeof setAllocation>[0], p: Rebalance) => {
  const project = await getProjectRef(tx, p.projectKey);
  const [r] = project ? await tx.execute(sql`select percent from allocations.allocation where person_id = ${p.personId} and month = ${p.month}::date and project_id = ${project.id}`) : [];
  return (r?.percent as number | undefined) ?? 0;
};

export async function set(tx: Parameters<typeof setAllocation>[0], ctx: Parameters<typeof setAllocation>[2], p: Rebalance, percent: number) {
  const was = await percentOf(tx, p);
  const out = await setAllocation(tx, { person: p.personId, projectKey: p.projectKey, month: p.month, percent }, ctx);
  return { applied: { was }, action: "allocations.allocation.set", resource: "allocations.allocation", resourceId: out.resourceId, before: out.before, after: out.after, events: out.events };
}
