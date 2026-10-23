import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { can, viewerOf } from "@amax/auth";
import { defineService, type ServiceContext } from "@amax/core/server";
import { EVENTS, type ApprovalChain, type WeekReopened } from "../contracts";
import { by, findWeek, keyOf, type WeekRow } from "./weeks";

/** The reopen itself: an Admin's reopen_week, or an approver accepting a change request (070 D8). */
export async function writeReopen(tx: Tx, ctx: ServiceContext, week: WeekRow, reason: string, chain: ApprovalChain = "admin") {
  if (week.status !== "approved") throw new Error(`${keyOf(week)} isn't approved, so it isn't locked`);
  await tx.execute(sql`update time.week set status = 'draft', locked_at = null, decided_at = null, decided_by = null, updated_at = now() where id = ${week.id}`);
  await tx.execute(sql`insert into time.approval (tenant_id, week_id, decision, chain, comment, decided_by) values (${ctx.tenantId}, ${week.id}, 'reopened', ${chain}, ${reason}, ${by(ctx)})`);
  const payload: WeekReopened = { weekId: week.id, userId: week.user_id, week: keyOf(week), by: by(ctx), reason };
  return { result: { week: keyOf(week), status: "draft" }, resourceId: week.id, before: { status: "approved" }, after: { status: "draft", reason }, events: [{ name: EVENTS.weekReopened, payload }] };
}

export const reopenWeek = defineService({
  name: "time.week.reopen",
  action: "time:admin",
  resource: "time.week",
  input: z.object({ weekId: z.string().uuid().optional(), person: z.string().optional(), week: z.string().optional(), reason: z.string().trim().min(3).max(1000) }),
  async run(tx, a, ctx) {
    const v = viewerOf(ctx);
    const week = await findWeek(tx, a, "time:admin", () => !v || can(v, "time:admin"));
    // 070 AC-8: as with approving, never your own week.
    if (v && week.user_id === v.userId) throw new Error(`${keyOf(week)} is your own week; another Admin has to reopen it`);
    return writeReopen(tx, ctx, week, a.reason);
  },
});
