import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { can, viewerOf, type Viewer } from "@amax/auth";
import { appendAudit, type ServiceContext } from "@amax/core/server";
import { isoDate } from "../week";
import { keyOf, type WeekRow } from "./weeks";

export const Hours = z.number().positive().max(24).multipleOf(0.05);

// Weeks are Mon–Fri (the screens, totals and submit payload all count the same five days).
export function workDay(day: string): Date {
  const d = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || isoDate(d) !== day) throw new Error(`${day} isn't a real date`);
  if (d.getUTCDay() === 0 || d.getUTCDay() === 6) throw new Error(`${day} is a weekend; timesheets cover Monday to Friday`);
  return d;
}

// A submitted week is what the approver decides on, so it can't change underneath them; an approved
// week is locked and only another Admin may change it, audited.
export function lockRefusal(week: WeekRow, v: Viewer | undefined): string | null {
  if (week.status === "submitted") return `${keyOf(week)} is submitted and waiting for approval; ask the approver to send it back before changing it`;
  if (week.status !== "approved") return null;
  if (!v || !can(v, "time:admin")) return `${keyOf(week)} is approved and locked; only an Admin can change it`;
  if (week.user_id === v.userId) return `${keyOf(week)} is your own approved week; another Admin has to change it`;
  return null;
}

export async function guardLock(tx: Tx, ctx: ServiceContext, week: WeekRow, after: object) {
  const refused = lockRefusal(week, viewerOf(ctx));
  if (refused) throw new Error(refused);
  if (week.status !== "approved") return false;
  await appendAudit(tx, ctx, { action: "time.week.locked_change", resource: "time.week", resourceId: week.id, before: { status: week.status }, after });
  return true;
}

/** A person-day holds at most 24 h, counted in hundredths so 23.95 + 0.05 is exactly 24. */
export async function guardDayTotal(tx: Tx, userId: string, day: string, hours: number, except?: string) {
  const other = except ? sql`and id <> ${except}` : sql``;
  const [{ total }] = await tx.execute(sql`select coalesce(sum(hours), 0) as total from time.entry where user_id = ${userId} and day = ${day} and deleted_at is null ${other}`);
  if (Math.round(Number(total) * 100) + Math.round(hours * 100) > 2400) throw new Error(`that would make ${day} more than 24 h`);
}
