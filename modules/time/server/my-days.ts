import { sql } from "drizzle-orm";
import type { Viewer } from "@amax/auth";
import { contextFor } from "@amax/core/server";
import { approvedLeave } from "@amax/leave/contracts";
import { isWeekend } from "../week";
import { read } from "./read";

/** 073: the shown working days My timesheet marks "On leave" (approved leave), as Team time shows them. */
export async function myLeaveDays(v: Viewer, days: string[]) {
  return read(v, async (tx) => {
    const installed = Boolean((await tx.execute(sql`select to_regclass('leave.request') is not null as on`))[0]?.on);
    if (!installed) return [];
    const mine = (await approvedLeave(tx, contextFor.job(v.tenantId, "time.my-days"), { from: days[0], to: days[days.length - 1] })).filter((l) => l.userId === v.userId);
    return days.filter((d) => !isWeekend(d) && mine.some((l) => l.startsOn <= d && l.endsOn >= d));
  });
}
