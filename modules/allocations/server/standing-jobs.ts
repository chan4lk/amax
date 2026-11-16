import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { z } from "zod";
import type { EventHandlerDef } from "@amax/core";
import { ScopeError } from "@amax/auth";
import { contextFor, defineService, isSystemContext } from "@amax/core/server";
import { cron, defineWorkflow, step } from "@amax/workflows";
import { listProjectRefs } from "@amax/delivery/contracts";
import { listPeople } from "@amax/hr/contracts";
import { EVENTS, monthOf, type AllocationSet } from "../contracts";
import { addMonths, day, fill, HORIZON, setStanding } from "./standing";

const STILL = ["active", "joining"] as const;

type Ended = { personId: string; projectId: string; from: string; rows: unknown; standing: unknown };

/**
 * Review round 1: a job or the leaver handler ends a standing allocation exactly as a hand end does: setStanding at 0%,
 * with the month rows it removed and the standing rows it ended in the audit's before, and the same allocationSet event.
 */
async function endSlot(tx: Tx, personId: string, projectId: string, from: string, by: string, tenantId: string) {
  const { months, removed, standing } = await setStanding(tx, { personId, projectId, month: from, percent: 0, by, tenantId });
  const event = { name: EVENTS.allocationSet, payload: { personId, projectId, work: null, months, percent: 0, by, standing: true } satisfies AllocationSet };
  return { before: { personId, projectId, from, rows: removed, standing } satisfies Ended, event };
}

/**
 * The monthly job's write: each open standing allocation, locked, is written up to HORIZON months ahead, skipping months
 * removed by hand, in the name of whoever set it. One whose person no longer works here, or whose project is no longer
 * active, is ended past what it has written instead (final pass).
 */
export const extendStanding = defineService({
  name: "allocations.standing.extend",
  action: "allocations:allocate",
  resource: "allocations.standing",
  input: z.object({ today: z.string() }),
  async run(tx, input, ctx) {
    if (!isSystemContext(ctx)) throw new ScopeError("allocations:allocate");
    const target = addMonths(monthOf(input.today), HORIZON - 1);
    const rows = await tx.execute(sql`select *, to_json(skip) as skips from allocations.standing where until_month is null and filled_to < ${target}::date for update`);
    const people = new Set((await listPeople(tx, ctx, { status: [...STILL], ids: rows.map((s) => s.person_id as string) })).map((p) => p.id));
    const projects = new Set((await listProjectRefs(tx)).map((p) => p.id));
    const events: { name: string; payload: AllocationSet }[] = [];
    const ended: Ended[] = [];
    for (const s of rows) {
      // 110 AC-4: the job writes and ends in the name of whoever set it.
      const by = `allocations.standing for ${String(s.updated_by)}`;
      // 109 AC-1: ended as ending it by hand would, from next month: the months it wrote from then on go too, kept in the audit.
      if (!people.has(s.person_id as string) || !projects.has(s.project_id as string)) {
        const end = await endSlot(tx, s.person_id as string, s.project_id as string, addMonths(monthOf(input.today), 1), by, ctx.tenantId);
        ended.push(end.before);
        events.push(end.event);
        continue;
      }
      const skip = new Set((s.skips as string[]).map(day));
      const months: string[] = [];
      for (let m = addMonths(day(s.filled_to), 1); m <= target; m = addMonths(m, 1)) if (!skip.has(m)) months.push(m);
      const written = await fill(tx, s.id as string, { personId: s.person_id as string, projectId: s.project_id as string, percent: Number(s.percent), by, tenantId: ctx.tenantId }, months);
      await tx.execute(sql`update allocations.standing set filled_to = ${target} where id = ${s.id}`);
      if (written.length) events.push({ name: EVENTS.allocationSet, payload: { personId: s.person_id as string, projectId: s.project_id as string, work: null, months: written, percent: Number(s.percent), by, standing: true } });
    }
    const extended = events.length - ended.length;
    return { result: { written: events.reduce((n, e) => n + e.payload.months.length, 0), ended: ended.length }, resourceId: null, before: { ended },
      after: { through: target, slots: extended, ended: ended.length }, events };
  },
});

/** Final pass: a leaver's standing allocations end the month after they leave, with the months written from then removed. */
export const endStandingForLeaver = defineService({
  name: "allocations.standing.leaver",
  action: "allocations:allocate",
  resource: "allocations.standing",
  input: z.object({ personId: z.string(), leftOn: z.string() }),
  async run(tx, input, ctx) {
    if (!isSystemContext(ctx)) throw new ScopeError("allocations:allocate");
    const month = addMonths(monthOf(input.leftOn), 1);
    const open = await tx.execute(sql`select project_id from allocations.standing where person_id = ${input.personId} and until_month is null`);
    const ends = [];
    // 110 AC-4: the end names the leaver's record it follows from.
    for (const s of open) ends.push(await endSlot(tx, input.personId, s.project_id as string, month, `hr leaver ${input.personId}`, ctx.tenantId));
    return { result: { ended: open.length }, resourceId: input.personId, before: { ended: ends.map((e) => e.before) }, after: { from: month, ended: open.length }, events: ends.map((e) => e.event) };
  },
});

export const onLeaver: EventHandlerDef = {
  id: "allocations.standing-leaver",
  event: "hr.person.left",
  handle: async ({ tenantId, event }) => { await endStandingForLeaver(contextFor.job(tenantId, "allocations.standing-leaver"), { personId: String(event.payload.personId), leftOn: String(event.payload.leftOn) }); },
};

export const standingExtend = defineWorkflow({
  name: "allocations.standing-extend",
  title: "Until further notice",
  async run(ctx) {
    const n = await step("extend", () => extendStanding(contextFor.job(ctx.tenantId, "allocations.standing-extend"), { today: new Date().toISOString().slice(0, 10) }), { timeout: "2m" });
    return { summary: `${n.written} months written ahead, ${n.ended} ended` };
  },
});

export const standingExtendSchedule = cron({ name: "allocations.standing-extend", title: "Until further notice", description: "Writes standing allocations a month further ahead", workflow: "allocations.standing-extend", cron: "0 2 1 * *", enabled: true });
