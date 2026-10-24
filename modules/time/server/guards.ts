import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { viewerOf, type Viewer } from "@amax/auth";
import { appendAudit, type ServiceContext } from "@amax/core/server";
import { isoDate } from "../week";
import { adminOver, entityOf, type Entity } from "./chain";
import { keyOf, type WeekRow } from "./weeks";

export const Hours = z.number().positive().max(24).multipleOf(0.05);

// A week is Monday to Friday; 073 AC-1: Saturday and Sunday take hours only when the weekend work is confirmed.
export function workDay(day: string, weekend = false): Date {
  const d = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || isoDate(d) !== day) throw new Error(`${day} isn't a real date`);
  if (!weekend && (d.getUTCDay() === 0 || d.getUTCDay() === 6)) throw new Error(`${day} is a weekend; to log weekend work, confirm it (weekend: true)`);
  return d;
}

// A submitted week is what the approver decides on, so it can't change underneath them; an approved
// week is locked and only another Admin may change it, audited.
export function lockRefusal(week: WeekRow, v: Viewer | undefined, entity: Entity): string | null {
  if (week.status === "submitted") return `${keyOf(week)} is submitted and waiting for approval; ask the approver to send it back before changing it`;
  if (week.status !== "approved") return null;
  if (!v || !adminOver(v, entity)) return `${keyOf(week)} is approved and locked; only an Admin can change it`;
  if (week.user_id === v.userId) return `${keyOf(week)} is your own approved week; another Admin has to change it`;
  return null;
}

export async function guardLock(tx: Tx, ctx: ServiceContext, week: WeekRow, after: object) {
  const refused = lockRefusal(week, viewerOf(ctx), await entityOf(tx, week.user_id));
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

/** 071 AC-12: a live entry with the same person, project, day and note; flagged, never refused. */
export async function possibleDuplicate(tx: Tx, userId: string, projectId: string, day: string, note: string | null | undefined) {
  const [e] = await tx.execute(sql`select id, hours from time.entry where user_id = ${userId} and project_id = ${projectId} and day = ${day}
    and coalesce(note, '') = ${note ?? ""} and deleted_at is null order by created_at limit 1`);
  return e ? { id: e.id as string, hours: Number(e.hours) } : null;
}
