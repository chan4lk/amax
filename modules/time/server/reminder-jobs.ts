import { contextFor, type ServiceContext } from "@amax/core/server";
import { cron, defineWorkflow, step } from "@amax/workflows";
import { remindDaily, remindDrafts } from "./schedules";

// 073 AC-5/AC-6: one run per legal entity, in its own time zone (workflows' "entity" schedules).
const job = (tenantId: string) => contextFor.job(tenantId, "time.reminders");
const forEntity = (name: string, title: string, run: (ctx: ServiceContext, raw: unknown) => Promise<{ reminded: number }>) => defineWorkflow({
  name, title,
  async run(ctx) {
    if (!ctx.legalEntityId) return { ok: true, summary: "No legal entity, so nobody is reminded" };
    const out = await step("remind", () => run(job(ctx.tenantId), { legalEntityId: ctx.legalEntityId! }), { timeout: "2m", retry: { maxAttempts: 3 } });
    return { ok: true, summary: `Reminded ${out.reminded}` };
  },
});

export const reminderWorkflows = [
  forEntity("time.daily-reminders", "Daily timesheet reminders", remindDaily),
  forEntity("time.draft-reminders", "Weekly timesheet reminders", remindDrafts),
];
// The daily one checks every 15 minutes on weekdays and sends once the Admin's local time has passed (off until set).
export const reminderSchedules = [
  cron({ name: "time.daily-reminders", title: "Daily timesheet reminders", description: "Reminds people with no hours that day, at the time an Admin sets, on working days", workflow: "time.daily-reminders", cron: "*/15 * * * 1-5", timezone: "entity" }),
  cron({ name: "time.draft-reminders", title: "Weekly timesheet reminders", description: "Monday 09:00: reminds people whose previous week is still a draft or sent back", workflow: "time.draft-reminders", cron: "0 9 * * 1", timezone: "entity" }),
];
