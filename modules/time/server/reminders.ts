import { sql } from "drizzle-orm";
import type { Viewer } from "@amax/auth";
import { leaveSeen } from "./leave-view";
import type { Tx } from "@amax/db";
import type { ServiceContext } from "@amax/core/server";
import { viewerOf } from "@amax/auth";
import { EVENTS, type DayReminded } from "../contracts";
import { dayLabel, isoWeekOf, weekKey } from "../week";
import { by } from "./weeks";

export const DEFAULT_MESSAGE = "Please update your hours for today.";
const FOUR_HOURS = 4 * 3_600_000;

type Reminder = { userId: string; kind: "week" | "day"; weekId?: string | null; day?: string | null; message?: string | null; slot?: string | null };

/** 073 AC-4: every reminder is recorded: who, by whom, for what, and when. A slot keeps an automatic one to one per person. */
export async function recordReminder(tx: Tx, ctx: ServiceContext, r: Reminder) {
  const sender = viewerOf(ctx)?.name ?? null;
  const [row] = await tx.execute(sql`insert into time.reminder (tenant_id, user_id, kind, week_id, day, message, sent_by, sender_name, slot)
    values (${ctx.tenantId}, ${r.userId}, ${r.kind}, ${r.weekId ?? null}, ${r.day ?? null}, ${r.message ?? null}, ${by(ctx)}, ${sender}, ${r.slot ?? null})
    on conflict (tenant_id, user_id, slot) where slot is not null do nothing returning id`);
  return Boolean(row);
}

/** Reminders in the last 4 hours, by person: what a card warns about (AC-4). */
export async function recentReminders(tx: Tx, userIds: string[]): Promise<Map<string, { by: string; at: Date }>> {
  if (!userIds.length) return new Map();
  const rows = await tx.execute(sql`select distinct on (user_id) user_id, coalesce(sender_name, 'amax') as by, sent_at from time.reminder
    where sent_at > now() - interval '4 hours' and user_id::text in (${sql.join(userIds.map((id) => sql`${id}`), sql`, `)}) order by user_id, sent_at desc`);
  return new Map(rows.map((r) => [r.user_id as string, { by: r.by as string, at: new Date(r.sent_at as string) }]));
}

export const agoText = (at: Date) => { const m = Math.max(1, Math.round((Date.now() - at.getTime()) / 60_000)); return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };
export const isRecent = (at: Date) => Date.now() - at.getTime() < FOUR_HOURS;

/**
 * Who logged hours on a day, and who is on approved leave then: the two reasons a day reminder skips someone. Leave
 * is read as the viewer (073 final review), so a card never says "on approved leave" about leave they may not see;
 * the scheduled reminder (no viewer, shows nothing to anyone) reads it as a system job.
 */
export async function dayState(tx: Tx, tenantId: string, day: string, userIds: string[], viewer: Viewer | null) {
  if (!userIds.length) return { logged: new Set<string>(), onLeave: new Set<string>() };
  const ids = sql.join(userIds.map((id) => sql`${id}`), sql`, `);
  const logged = new Set((await tx.execute(sql`select distinct user_id from time.entry where day = ${day} and deleted_at is null and user_id::text in (${ids})`)).map((r) => r.user_id as string));
  const leave = await leaveSeen(tx, viewer, tenantId, { from: day, to: day }, userIds);
  return { logged, onLeave: new Set(userIds.filter((id) => leave.on(id, day))) };
}

/** One day reminder: recorded, and the event the bell turns into "Log your hours for {day}" (AC-3). */
export async function writeDayReminder(tx: Tx, ctx: ServiceContext, userId: string, day: string, message: string, slot: string | null = null) {
  if (!(await recordReminder(tx, ctx, { userId, kind: "day", day, message, slot }))) return null;
  const payload: DayReminded = { userId, day, dayLabel: dayLabel(day), week: weekKey(isoWeekOf(new Date(`${day}T00:00:00Z`))), by: by(ctx), message };
  return { name: EVENTS.dayReminded, payload };
}
