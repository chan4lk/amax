import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { viewerOf, type Viewer } from "@amax/auth";
import type { ToolCard } from "@amax/core";
import { defineService } from "@amax/core/server";
import { dayLabel, isWeekend } from "../week";
import { refuse } from "./card";
import { expectedBy } from "./expected";
import { read } from "./read";
import { agoText, dayState, DEFAULT_MESSAGE, isRecent, recentReminders, writeDayReminder } from "./reminders";
import { localToday } from "./rules";

const input = z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), message: z.string().trim().min(1).max(300).optional(), userIds: z.array(z.uuid()).max(100).optional() });
type Input = z.infer<typeof input>;
type Plan = { remind: { id: string; name: string; recent: string | null }[]; skipped: { name: string; why: string }[] };

/** Why a day can't be reminded about: a weekend (AC-7), a day still to come, or not a real date. */
async function dayRefusal(tx: Tx, v: Viewer, day: string) {
  if (Number.isNaN(Date.parse(`${day}T00:00:00Z`))) return `${day} isn't a real date`;
  if (isWeekend(day)) return `${dayLabel(day)} is a weekend; reminders go out on working days only`;
  if (day > (await localToday(tx, v.userId))) return `${dayLabel(day)} hasn't happened yet`;
  return null;
}

/** 073 AC-3: who a day reminder goes to (D2's people with nothing logged that day), and who is skipped and why. */
async function plan(tx: Tx, v: Viewer, a: Input): Promise<Plan> {
  const scope = await expectedBy(tx, v, a.day);
  const ids = a.userIds ? a.userIds.filter((id) => scope.includes(id)) : scope;
  const names = new Map((ids.length ? await tx.execute(sql`select id, name from auth.user where id::text in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`) : []).map((r) => [r.id as string, r.name as string]));
  const { logged, onLeave } = await dayState(tx, v.tenantId, a.day, ids);
  const recent = await recentReminders(tx, ids);
  const out: Plan = { remind: [], skipped: a.userIds ? [...Array(a.userIds.length - ids.length)].map(() => ({ name: "Someone", why: "not someone you can remind" })) : [] };
  for (const id of ids.sort((x, y) => names.get(x)!.localeCompare(names.get(y)!))) {
    const name = names.get(id)!;
    if (logged.has(id)) { if (a.userIds) out.skipped.push({ name, why: "already logged" }); continue; }
    if (onLeave.has(id)) { out.skipped.push({ name, why: "on approved leave" }); continue; }
    const r = recent.get(id);
    out.remind.push({ id, name, recent: r && isRecent(r.at) ? `reminded ${agoText(r.at)} by ${r.by}` : null });
  }
  return out;
}

export const remindMissing = defineService({
  scoped: true, name: "time.day.remind", action: "time:approve", resource: "time.reminder", input,
  async run(tx, a, ctx) {
    const v = viewerOf(ctx);
    if (!v) throw new Error("a person sends this reminder");
    const why = await dayRefusal(tx, v, a.day);
    if (why) throw new Error(why);
    const p = await plan(tx, v, a);
    const events = [];
    for (const r of p.remind) { const e = await writeDayReminder(tx, ctx, r.id, a.day, a.message ?? DEFAULT_MESSAGE); if (e) events.push(e); }
    const results = [...p.remind.map((r) => ({ person: r.name, status: "sent", note: null })), ...p.skipped.map((s) => ({ person: s.name, status: "skipped", note: s.why }))];
    return { result: { summary: `Reminded ${p.remind.length} · skipped ${p.skipped.length} · failed 0`, results }, resourceId: null, after: { day: a.day, sent: p.remind.length }, events };
  },
});

export async function proposeMissing(v: Viewer, a: Input) {
  const why = await read(v, (tx) => dayRefusal(tx, v, a.day));
  if (why) refuse(why);
  if (!(await read(v, (tx) => plan(tx, v, a))).remind.length) refuse(`everyone you'd remind has logged ${dayLabel(a.day)} or is on leave`);
}

export async function missingCard(v: Viewer, a: Input): Promise<ToolCard> {
  const p = await read(v, (tx) => plan(tx, v, a));
  return { title: `Remind ${p.remind.length} ${p.remind.length === 1 ? "person" : "people"} to log ${dayLabel(a.day)}`, lines: [
    ...p.remind.map((r) => ({ label: r.name, value: `nothing logged${r.recent ? ` · ${r.recent}` : ""}` })),
    ...p.skipped.map((s) => ({ label: s.name, value: `skipped: ${s.why}` })),
    { label: "Message", value: a.message ?? DEFAULT_MESSAGE }] };
}
