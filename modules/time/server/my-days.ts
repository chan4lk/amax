import type { Viewer } from "@amax/auth";
import { leaveSeen } from "./leave-view";
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
    // Their own leave, read as them like everything Time shows (073 final review).
    const mine = await leaveSeen(tx, v, v.tenantId, { from: days[0], to: days[days.length - 1] }, [v.userId]);
    const leave = days.filter((d) => !isWeekend(d) && mine.on(v.userId, d));
    const missing = days.filter((d, i) => !isWeekend(d) && d < today && !perDay[i] && !leave.includes(d));
    return { leave, missing };
  });
}
