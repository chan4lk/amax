import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { contextFor } from "@amax/core/server";
import { approvedLeave } from "@amax/leave/contracts";
import { dayLabel, workDays } from "../week";
import { localToday } from "./rules";
import type { WeekRow } from "./weeks";

/** 073 AC-9: a week's working days, up to the person's local today, with no hours and no approved leave. */
export async function missingDays(tx: Tx, week: WeekRow): Promise<string[]> {
  const days = workDays({ year: Number(week.iso_year), week: Number(week.iso_week) });
  const today = await localToday(tx, week.user_id);
  const logged = new Set((await tx.execute(sql`select distinct to_char(day, 'YYYY-MM-DD') as day from time.entry where week_id = ${week.id} and deleted_at is null`)).map((r) => r.day as string));
  const leaveOn = Boolean((await tx.execute(sql`select to_regclass('leave.request') is not null as on`))[0]?.on);
  const leave = leaveOn ? (await approvedLeave(tx, contextFor.job(week.tenant_id as string, "time.anomalies"), { from: days[0], to: days[4] })).filter((l) => l.userId === week.user_id) : [];
  const away = (d: string) => leave.some((l) => l.startsOn <= d && l.endsOn >= d);
  return days.filter((d) => d < today && !logged.has(d) && !away(d)).map(dayLabel);
}

/** 073 AC-10: what makes a week need individual review: over 60 h, a day over 14 h, or missing working days. */
export async function weekAnomalies(tx: Tx, week: WeekRow): Promise<string[]> {
  const days = await tx.execute(sql`select to_char(day, 'YYYY-MM-DD') as day, sum(hours) as h from time.entry where week_id = ${week.id} and deleted_at is null group by day`);
  const total = days.reduce((n, d) => n + Number(d.h), 0);
  const long = days.filter((d) => Number(d.h) > 14).map((d) => dayLabel(d.day as string));
  const missing = await missingDays(tx, week);
  return [...(total > 60 ? [`over 60 h (${Math.round(total * 10) / 10} h)`] : []), ...(long.length ? [`a day over 14 h (${long.join(", ")})`] : []),
    ...(missing.length ? [`missing ${missing.join(", ")}`] : [])];
}
