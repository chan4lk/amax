import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Viewer } from "@amax/auth";
import type { ToolCard } from "@amax/core";
import { defineService } from "@amax/core/server";
import { refuse } from "./card";
import { read } from "./read";
import { allocationsInstalled, settingsOf, type TimeSettings } from "./rules";
import { by } from "./weeks";

const input = z.object({
  requireAllocation: z.boolean().optional(),
  backdateWeeks: z.number().int().min(1).max(52).nullable().optional(),
  allowFuture: z.boolean().optional(),
  // 073 AC-5: the automatic daily reminder's local time (HH:MM), or null to switch it off.
  dailyReminderAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "a time such as 16:00").nullable().optional(),
}).refine((a) => a.requireAllocation !== undefined || a.backdateWeeks !== undefined || a.allowFuture !== undefined || a.dailyReminderAt !== undefined, "say which rule to change");
type Input = z.infer<typeof input>;

export const getSettings = (v: Viewer) => read(v, settingsOf);

/** 071 AC-9: the tenant's entry rules, Admin only; requiring allocations needs Allocations installed (D7). */
export const setSettings = defineService({
  name: "time.settings.set", action: "time:admin", resource: "time.setting", input,
  async run(tx, a, ctx) {
    const before = await settingsOf(tx);
    if (a.requireAllocation && !(await allocationsInstalled(tx))) throw new Error("allocations aren't installed, so time can't require an allocation");
    const next: TimeSettings = { requireAllocation: a.requireAllocation ?? before.requireAllocation, backdateWeeks: a.backdateWeeks === undefined ? before.backdateWeeks : a.backdateWeeks, allowFuture: a.allowFuture ?? before.allowFuture, dailyReminderAt: a.dailyReminderAt === undefined ? before.dailyReminderAt : a.dailyReminderAt };
    await tx.execute(sql`insert into time.setting (tenant_id, require_allocation, backdate_weeks, allow_future, daily_reminder_at, updated_by) values (${ctx.tenantId}, ${next.requireAllocation}, ${next.backdateWeeks}, ${next.allowFuture}, ${next.dailyReminderAt}, ${by(ctx)})
      on conflict (tenant_id) do update set require_allocation = excluded.require_allocation, backdate_weeks = excluded.backdate_weeks, allow_future = excluded.allow_future, daily_reminder_at = excluded.daily_reminder_at, updated_by = excluded.updated_by, updated_at = now()`);
    return { result: next, resourceId: null, before, after: next };
  },
});

const yes = (b: boolean) => (b ? "on" : "off");
const daily = (t: string | null) => (t === null ? "off" : `${t} on working days, for people with no hours that day`);
const back = (n: number | null) => (n === null ? "no limit" : `${n} week${n === 1 ? "" : "s"}`);

export async function settingsCard(v: Viewer, a: Input): Promise<ToolCard> {
  const now = await getSettings(v);
  const lines = [
    ...(a.requireAllocation === undefined ? [] : [{ label: "Allocated projects only", value: `${yes(now.requireAllocation)} → ${yes(a.requireAllocation)}` }]),
    ...(a.dailyReminderAt === undefined ? [] : [{ label: "Daily reminder", value: `${daily(now.dailyReminderAt)} → ${daily(a.dailyReminderAt)}` }]),
    ...(a.backdateWeeks === undefined ? [] : [{ label: "Back-dating limit", value: `${back(now.backdateWeeks)} → ${back(a.backdateWeeks)}` }]),
    ...(a.allowFuture === undefined ? [] : [{ label: "Future dates", value: `${now.allowFuture ? "allowed" : "blocked"} → ${a.allowFuture ? "allowed" : "blocked"}` }]),
  ];
  return { title: "Change the timesheet rules", lines };
}

export async function proposeSettings(v: Viewer, a: Input) {
  if (a.requireAllocation && !(await read(v, allocationsInstalled))) refuse("allocations aren't installed, so time can't require an allocation");
}
