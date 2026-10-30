import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { ScopeError, viewerOf, type Viewer } from "@amax/auth";
import { defineService, type ServiceContext } from "@amax/core/server";
import { EVENTS, type WeekDecided, type WeekReminded } from "../contracts";
import { chainFor, entityOf } from "./chain";
import { ToolError } from "@amax/mcp";
import { recordReminder } from "./reminders";
import { by, findWeek, keyOf, weekProjectIds, type MayAct, type WeekRef, type WeekRow } from "./weeks";

const ref = { weekId: z.string().uuid().optional(), person: z.string().optional(), week: z.string().optional() };

async function approver(tx: Tx, ctx: ServiceContext, week: WeekRow) {
  const chain = chainFor(viewerOf(ctx), week.user_id, await weekProjectIds(tx, week.id), await entityOf(tx, week.user_id));
  if (!chain) throw new ScopeError("time:approve");
  return chain;
}

// Only weeks the caller is in the approval chain for are found (070 AC-10).
export const mayDecide = (tx: Tx, v: Viewer | undefined): MayAct => async (w) => chainFor(v, w.user_id, await weekProjectIds(tx, w.id), await entityOf(tx, w.user_id)) !== null;
const target = (tx: Tx, ctx: ServiceContext, a: WeekRef) => findWeek(tx, a, "time:approve", mayDecide(tx, viewerOf(ctx)));

export async function decide(tx: Tx, ctx: ServiceContext, week: WeekRow, to: "approved" | "rejected", comment: string | null) {
  const chain = await approver(tx, ctx, week);
  if (week.status !== "submitted") throw new ToolError(`${keyOf(week)} is ${week.status}, not submitted`, "invalid_input");
  await tx.execute(sql`update time.week set status = ${to}, decided_at = now(), decided_by = ${by(ctx)}, reject_comment = ${comment},
    locked_at = ${to === "approved" ? sql`now()` : null}, updated_at = now() where id = ${week.id}`);
  await tx.execute(sql`insert into time.approval (tenant_id, week_id, decision, chain, comment, decided_by) values (${ctx.tenantId}, ${week.id}, ${to}, ${chain}, ${comment}, ${by(ctx)})`);
  const payload: WeekDecided = { weekId: week.id, userId: week.user_id, week: keyOf(week), by: by(ctx), chain, comment };
  return { result: { week: keyOf(week), person: week.person_name as string, status: to, chain }, resourceId: week.id, before: { status: week.status }, after: { status: to, chain, comment },
    events: [{ name: to === "approved" ? EVENTS.weekApproved : EVENTS.weekRejected, payload }] };
}

export const approveWeek = defineService({
  scoped: true, name: "time.week.approve", action: "time:approve", resource: "time.week", input: z.object(ref),
  run: async (tx, a, ctx) => decide(tx, ctx, await target(tx, ctx, a), "approved", null),
});

export const rejectWeek = defineService({
  scoped: true, name: "time.week.reject", action: "time:approve", resource: "time.week",
  input: z.object({ ...ref, comment: z.string().trim().min(3, "say why it's rejected").max(1000) }),
  run: async (tx, a, ctx) => decide(tx, ctx, await target(tx, ctx, a), "rejected", a.comment),
});

export const remindWeek = defineService({
  scoped: true, name: "time.week.remind", action: "time:approve", resource: "time.week", input: z.object({ ...ref, message: z.string().trim().min(1).max(300).optional() }),
  run: async (tx, a, ctx) => writeRemind(tx, ctx, await target(tx, ctx, a), a.message ?? null),
});

/** The reminder itself, shared by remind_week and remind_weeks (070 amendment 4); 073 AC-3/AC-4: with a message, recorded. */
export async function writeRemind(tx: Tx, ctx: ServiceContext, week: WeekRow, message: string | null = null) {
  if (week.status !== "draft" && week.status !== "rejected") throw new ToolError(`${keyOf(week)} is already ${week.status}`, "invalid_input");
  await recordReminder(tx, ctx, { userId: week.user_id, kind: "week", weekId: week.id, message });
  const payload: WeekReminded = { weekId: week.id, userId: week.user_id, week: keyOf(week), by: by(ctx), message };
  return { result: { week: keyOf(week), person: week.person_name as string, recorded: true,
    note: "Reminder recorded; notifications (030) delivers it to the person when installed" }, resourceId: week.id, events: [{ name: EVENTS.weekReminded, payload }] };
}
