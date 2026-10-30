import { sql } from "drizzle-orm";
import { ToolError } from "@amax/mcp";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { viewerOf } from "@amax/auth";
import { adminOver, entityOf } from "./chain";
import { defineService, type ServiceContext } from "@amax/core/server";
import { EVENTS, type ApprovalChain, type WeekReopened } from "../contracts";
import { by, findWeek, keyOf, type WeekRow } from "./weeks";

/** The reopen itself: an Admin's reopen_week, or an approver accepting a change request (070 D8). */
// 073: a change request's reopen hands a submitted week back too (`from`), as draft, never "rejected": nothing was refused.
export async function writeReopen(tx: Tx, ctx: ServiceContext, week: WeekRow, reason: string, chain: ApprovalChain = "admin", from: string[] = ["approved"]) {
  if (!from.includes(week.status)) throw new ToolError(`${keyOf(week)} isn't approved, so it isn't locked`, "invalid_input");
  await tx.execute(sql`update time.week set status = 'draft', locked_at = null, decided_at = null, decided_by = null, updated_at = now() where id = ${week.id}`);
  await tx.execute(sql`insert into time.approval (tenant_id, week_id, decision, chain, comment, decided_by) values (${ctx.tenantId}, ${week.id}, 'reopened', ${chain}, ${reason}, ${by(ctx)})`);
  const payload: WeekReopened = { weekId: week.id, userId: week.user_id, week: keyOf(week), by: by(ctx), reason };
  return { result: { week: keyOf(week), status: "draft" }, resourceId: week.id, before: { status: week.status }, after: { status: "draft", reason }, events: [{ name: EVENTS.weekReopened, payload }] };
}

export const reopenWeek = defineService({
  name: "time.week.reopen",
  action: "time:admin",
  resource: "time.week",
  input: z.object({ weekId: z.string().uuid().optional(), person: z.string().optional(), week: z.string().optional(), reason: z.string().trim().min(3).max(1000) }),
  async run(tx, a, ctx) {
    const v = viewerOf(ctx);
    const week = await findWeek(tx, a, "time:admin", async (w) => !v || adminOver(v, await entityOf(tx, w.user_id)));
    // 070 AC-8: as with approving, never your own week.
    if (v && week.user_id === v.userId) throw new ToolError(`${keyOf(week)} is your own week; another Admin has to reopen it`, "invalid_input");
    return writeReopen(tx, ctx, week, a.reason);
  },
});
