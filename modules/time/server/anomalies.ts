import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { Viewer } from "@amax/auth";
import { leaveSeen } from "./leave-view";
import { dayLabel, workDays } from "../week";
import { localToday } from "./rules";
import type { WeekRow } from "./weeks";

/**
 * 073 AC-9: a week's working days, up to the person's local today, with no hours and no approved leave the viewer may
 * see (073 final review: leave is read as the viewer). `leaveHidden`: their leave isn't the viewer's to see, so a
 * listed day may be leave. With no viewer (a system job) the read is a system read.
 */
export async function missingDaysSeen(tx: Tx, week: WeekRow, viewer: Viewer | null): Promise<{ days: string[]; leaveHidden: boolean }> {
  const days = workDays({ year: Number(week.iso_year), week: Number(week.iso_week) });
  const today = await localToday(tx, week.user_id);
  const logged = new Set((await tx.execute(sql`select distinct to_char(day, 'YYYY-MM-DD') as day from time.entry where week_id = ${week.id} and deleted_at is null`)).map((r) => r.day as string));
  const leave = await leaveSeen(tx, viewer, week.tenant_id as string, { from: days[0], to: days[4] }, [week.user_id]);
  return { days: days.filter((d) => d < today && !logged.has(d) && !leave.on(week.user_id, d)).map(dayLabel), leaveHidden: leave.hidden.has(week.user_id) };
}

export const missingDays = async (tx: Tx, week: WeekRow, viewer: Viewer | null) => (await missingDaysSeen(tx, week, viewer)).days;

/** 073 AC-10: what makes a week need individual review: over 60 h, a day over 14 h, or missing working days. */
export async function weekAnomalies(tx: Tx, week: WeekRow, viewer: Viewer | null): Promise<string[]> {
  const days = await tx.execute(sql`select to_char(day, 'YYYY-MM-DD') as day, sum(hours) as h from time.entry where week_id = ${week.id} and deleted_at is null group by day`);
  const total = days.reduce((n, d) => n + Number(d.h), 0);
  const long = days.filter((d) => Number(d.h) > 14).map((d) => dayLabel(d.day as string));
  const missing = await missingDaysSeen(tx, week, viewer);
  const note = missing.leaveHidden ? " (their leave isn't visible to you, so some may be leave)" : "";
  return [...(total > 60 ? [`over 60 h (${Math.round(total * 10) / 10} h)`] : []), ...(long.length ? [`a day over 14 h (${long.join(", ")})`] : []),
    ...(missing.days.length ? [`missing ${missing.days.join(", ")}${note}`] : [])];
}
