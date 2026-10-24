import { sql } from "drizzle-orm";
import type { Viewer } from "@amax/auth";
import { contextFor } from "@amax/core/server";
import { approvedLeave } from "@amax/leave/contracts";
import { isWeekend } from "../week";
import { read } from "./read";
import { localToday } from "./rules";

/**
 * 073: what My timesheet marks on each shown day, as Team time does: approved leave, and past working days with nothing
 * logged and no leave ("Missing"). Today and later days are never missing; weekends never are.
 */
export async function myDayMarks(v: Viewer, days: string[], perDay: number[]) {
  return read(v, async (tx) => {
    const today = await localToday(tx, v.userId);
    const installed = Boolean((await tx.execute(sql`select to_regclass('leave.request') is not null as on`))[0]?.on);
    const mine = installed ? (await approvedLeave(tx, contextFor.job(v.tenantId, "time.my-days"), { from: days[0], to: days[days.length - 1] })).filter((l) => l.userId === v.userId) : [];
    const leave = days.filter((d) => !isWeekend(d) && mine.some((l) => l.startsOn <= d && l.endsOn >= d));
    const missing = days.filter((d, i) => !isWeekend(d) && d < today && !perDay[i] && !leave.includes(d));
    return { leave, missing };
  });
}
