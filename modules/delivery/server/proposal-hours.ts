import { sql } from "drizzle-orm";
import { z } from "zod";
import { defineService, ForbiddenError } from "@amax/core/server";

/** Review round 2 (round 3: a denial, ForbiddenError): the one job that may write hours, Time's (it imports the name from Delivery's contracts). */
export const PROPOSAL_HOURS_JOB = "time.proposal-hours";

/**
 * 081 AC-4: Time's approved hours per proposal, for whole projects at a time: every proposal in `projectIds` takes its
 * total from `totals` (proposal id → hours), or 0. Time owns the entries and their rules and is the only caller, under a
 * job context; nothing else writes `hours`. A service like every other write (AGENTS rule 5), audited by count, never by
 * value. `updated_at` stays, since hours approved later don't make a proposal "updated".
 */
export const setProposalHours = defineService({
  name: "delivery.proposal.hours",
  action: "delivery:proposal:hours",
  resource: "delivery.proposal",
  input: z.object({ projectIds: z.array(z.uuid()), totals: z.record(z.uuid(), z.number().min(0)) }),
  async run(tx, input, ctx) {
    if (ctx.actor.id !== `job:${PROPOSAL_HOURS_JOB}`) throw new ForbiddenError("delivery:proposal:hours", "delivery.proposal");
    if (!input.projectIds.length) return { result: { changed: 0 }, resourceId: null, after: { projects: 0, changed: 0 } };
    const json = JSON.stringify(input.totals);
    const changed = await tx.execute(sql`update delivery.proposal p set hours = round(coalesce((${json}::jsonb ->> p.id::text)::numeric, 0), 2)
      where p.project_id::text in (${sql.join(input.projectIds.map((id) => sql`${id}`), sql`, `)})
        and p.hours is distinct from round(coalesce((${json}::jsonb ->> p.id::text)::numeric, 0), 2)
      returning p.id`);
    return { result: { changed: changed.length }, resourceId: null, after: { projects: input.projectIds.length, changed: changed.length } };
  },
});
