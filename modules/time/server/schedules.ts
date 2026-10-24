import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { defineService } from "@amax/core/server";
import { entityZone } from "@amax/workflows";
import { EVENTS, type WeekReminded } from "../contracts";
import { isWeekend, isoWeekOf, shiftWeek, weekKey } from "../week";
import { expectedIn } from "./expected";
import { dayState, DEFAULT_MESSAGE, recordReminder, writeDayReminder } from "./reminders";
import { settingsOf } from "./rules";
import { by } from "./weeks";

const input = z.object({ legalEntityId: z.uuid(), now: z.string().datetime().optional() });

async function localNow(tx: Tx, entityId: string, at: Date) {
  const zone = await entityZone(tx, entityId);
  const part = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, hourCycle: "h23", ...o }).format(at);
  return { day: part({ year: "numeric", month: "2-digit", day: "2-digit" }), time: part({ hour: "2-digit", minute: "2-digit" }) };
}

/** People whose recent projects a PM has all switched off (AC-5). Someone with no recent project is still reminded. */
async function switchedOff(tx: Tx, userIds: string[], day: string): Promise<Set<string>> {
  if (!userIds.length) return new Set();
  const rows = await tx.execute(sql`select e.user_id, bool_or(coalesce(r.enabled, true)) as on from (select distinct user_id, project_id from time.entry
      where deleted_at is null and day > ${day}::date - 28 and day <= ${day} and user_id::text in (${sql.join(userIds.map((id) => sql`${id}`), sql`, `)})) e
    left join time.project_reminder r on r.project_id = e.project_id group by e.user_id`);
  return new Set(rows.filter((r) => !r.on).map((r) => r.user_id as string));
}

/** 073 AC-5: the automatic daily reminder for one entity, once its local time has passed on a working day; one per person a day. */
export const remindDaily = defineService({
  name: "time.day.remind_auto", action: "time:admin", resource: "time.reminder", input,
  async run(tx, a, ctx) {
    const at = (await settingsOf(tx)).dailyReminderAt;
    const { day, time } = await localNow(tx, a.legalEntityId, a.now ? new Date(a.now) : new Date());
    if (!at || isWeekend(day) || time < at) return { result: { reminded: 0, day }, resourceId: null, events: [] };
    const people = await expectedIn(tx, a.legalEntityId, day);
    const { logged, onLeave } = await dayState(tx, ctx.tenantId, day, people);
    const off = await switchedOff(tx, people, day);
    const events = [];
    for (const id of people) {
      if (logged.has(id) || onLeave.has(id) || off.has(id)) continue;
      const e = await writeDayReminder(tx, ctx, id, day, DEFAULT_MESSAGE, `auto:day:${day}`);
      if (e) events.push(e);
    }
    return { result: { reminded: events.length, day }, resourceId: null, after: { day, reminded: events.length }, events };
  },
});

/** 073 AC-6: Monday morning, everyone in the entity whose previous week is still draft or sent back with hours; once per week. */
export const remindDrafts = defineService({
  name: "time.week.remind_auto", action: "time:admin", resource: "time.reminder", input,
  async run(tx, a, ctx) {
    const { day } = await localNow(tx, a.legalEntityId, a.now ? new Date(a.now) : new Date());
    const last = shiftWeek(isoWeekOf(new Date(`${day}T00:00:00Z`)), -1);
    const weeks = await tx.execute(sql`select w.id, w.user_id from time.week w join auth.user u on u.id = w.user_id where u.legal_entity_id = ${a.legalEntityId}
      and w.iso_year = ${last.year} and w.iso_week = ${last.week} and w.status in ('draft', 'rejected')
      and exists (select 1 from time.entry e where e.week_id = w.id and e.deleted_at is null)`);
    const events = [];
    for (const w of weeks) {
      if (!(await recordReminder(tx, ctx, { userId: w.user_id as string, kind: "week", weekId: w.id as string, slot: `auto:week:${weekKey(last)}` }))) continue;
      const payload: WeekReminded = { weekId: w.id as string, userId: w.user_id as string, week: weekKey(last), by: by(ctx), message: null };
      events.push({ name: EVENTS.weekReminded, payload });
    }
    return { result: { reminded: events.length, week: weekKey(last) }, resourceId: null, after: { week: weekKey(last), reminded: events.length }, events };
  },
});
