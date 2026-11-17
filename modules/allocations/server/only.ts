import { sql } from "drizzle-orm";
import { z } from "zod";
import { defineService } from "@amax/core/server";
import { listProjectRefs } from "@amax/delivery/contracts";
import { monthOf } from "../contracts";
import { personOf, projectNamed, setAllocation } from "./services";

const month = z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/, "a month, e.g. 2026-11").transform(monthOf);

export const allocateOnly = defineService({
  scoped: true,
  name: "allocations.allocation.only",
  action: "allocations:allocate",
  resource: "allocations.allocation",
  input: z.object({ person: z.string().min(2), projectKey: z.string().optional(), work: z.string().min(2).optional(), month, through: month.optional(), percent: z.number().int().min(1).max(200).default(100) })
    .refine((i) => Boolean(i.projectKey) !== Boolean(i.work), "name a project key or other work, not both")
    .refine((i) => !i.through || i.through >= i.month, { message: "through can't be before month", path: ["through"] }),
  async run(tx, asked, ctx) {
    const input = await projectNamed(tx, asked);
    const through = input.through ?? input.month;
    const person = await personOf(tx, ctx, input.person);
    const projects = await listProjectRefs(tx);
    const rows = await tx.execute(sql`select distinct project_id, work from allocations.allocation where person_id = ${person.id} and month between ${input.month}::date and ${through}::date`);
    const others = rows.flatMap((r) => {
      const key = projects.find((p) => p.id === r.project_id)?.key;
      return (key ?? r.work) === (input.projectKey ?? input.work) ? [] : [key ? { projectKey: key } : { work: r.work as string }];
    });
    const cleared = [];
    for (const slot of others) cleared.push(await setAllocation(tx, { person: input.person, ...slot, month: input.month, through, percent: 0 }, ctx));
    const set = await setAllocation(tx, input, ctx);
    return { ...set, result: { ...set.result, cleared: others.length }, events: [...cleared.flatMap((c) => c.events), ...set.events] };
  },
});
