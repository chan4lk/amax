import { sql } from "drizzle-orm";
import { z } from "zod";
import { can, viewerOf } from "@amax/auth";
import { defineService } from "@amax/core/server";
import { EVENTS, type ChangeCompleted, type WeekSubmitted } from "../contracts";
import { findWeek, keyOf, weekHours, weekProjectIds } from "./weeks";
import { missingDays } from "./anomalies";
import { entityOf, inEntity } from "./chain";

export const submitWeek = defineService({
  scoped: true,
  name: "time.week.submit",
  action: "time:submit",
  resource: "time.week",
  input: z.object({ week: z.string().optional(), weekId: z.string().uuid().optional(), person: z.string().optional() }),
  async run(tx, a, ctx) {
    const v = viewerOf(ctx);
    const week = await findWeek(tx, { weekId: a.weekId, week: a.week, person: a.person ?? v?.email }, "time:submit", async (w) => !v || can(v, "time:submit", { ownerUserId: w.user_id, ...(w.user_id === v.userId ? {} : inEntity(await entityOf(tx, w.user_id))) }));
    if (week.status === "submitted" || week.status === "approved") throw new Error(`${keyOf(week)} is already ${week.status}`);
    const hours = await weekHours(tx, week.id);
    if (hours === 0) throw new Error(`${keyOf(week)} has no time logged yet`);
    // 073 AC-9: missing working days are a warning, never a refusal.
    const missing = await missingDays(tx, week);
    await tx.execute(sql`update time.week set status = 'submitted', submitted_at = now(), reject_comment = null, updated_at = now() where id = ${week.id}`);
    const payload: WeekSubmitted = { weekId: week.id, userId: week.user_id, week: keyOf(week), hours, projectIds: await weekProjectIds(tx, week.id), legalEntityId: await entityOf(tx, week.user_id) };
    // 070 AC-35: a change request that reopened this week is done once the week is submitted again.
    const done = await tx.execute(sql`update time.change_request set status = 'completed', updated_at = now() where week_id = ${week.id} and status = 'reopened' returning id`);
    const completed = done.map((d): { name: string; payload: ChangeCompleted } => ({ name: EVENTS.changeCompleted, payload: { requestId: d.id as string, weekId: week.id, userId: week.user_id, week: keyOf(week) } }));
    return { result: { week: keyOf(week), status: "submitted", hours, missingDays: missing }, resourceId: week.id, before: { status: week.status }, after: { status: "submitted" }, events: [{ name: EVENTS.weekSubmitted, payload }, ...completed] };
  },
});
