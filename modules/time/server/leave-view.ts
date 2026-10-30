import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { Viewer } from "@amax/auth";
import { contextFor, hasModule } from "@amax/core/server";
import { approvedLeave, leaveVisibleTo } from "@amax/leave/contracts";
import { entitiesOf } from "./chain";

/**
 * 073 final review (blocker): approved leave as Time shows it, read through Leave's contract as the viewer, so Leave's
 * own rule decides whose leave they see, as 072 does. `on` is true only for leave the viewer may see; `hidden` names
 * the people whose leave they may not see, so a day of theirs is "unknown", never shown as leave. With no viewer
 * (a system job, such as the scheduled reminder, which shows nothing to anyone) the read is a system read.
 */
export async function leaveSeen(tx: Tx, viewer: Viewer | null, tenantId: string, range: { from: string; to: string }, userIds: string[]) {
  const none = { on: (_u: string, _d: string) => false, hidden: new Set<string>() };
  const tables = Boolean((await tx.execute(sql`select to_regclass('leave.request') is not null as on`))[0]?.on);
  if (!hasModule("leave", tables) || !userIds.length) return none;
  const rows = await approvedLeave(tx, viewer ?? contextFor.job(tenantId, "time.leave"), range);
  const entities = viewer ? await entitiesOf(tx, userIds) : new Map<string, string | null>();
  const hidden = new Set(viewer ? userIds.filter((id) => !leaveVisibleTo(viewer, { userId: id, legalEntityId: entities.get(id) ?? null })) : []);
  return { on: (userId: string, day: string) => !hidden.has(userId) && rows.some((l) => l.userId === userId && l.startsOn <= day && l.endsOn >= day), hidden };
}
