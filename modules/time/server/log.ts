import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { assertCan, viewerOf } from "@amax/auth";
import { defineService, type ServiceContext } from "@amax/core/server";
import { getProjectRef } from "@amax/delivery/contracts";
import { EVENTS, type EntryLogged } from "../contracts";
import { isoWeekOf } from "../week";
import { guardDayTotal, guardLock, Hours, workDay } from "./guards";
import { by, ensureWeek, keyOf } from "./weeks";

const input = z.object({
  projectKey: z.string().min(1),
  // Required: the server can't know the person's local date, and a UTC "today" lands on the wrong day
  // (or ISO week) near midnight outside UTC.
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "give the day as YYYY-MM-DD"),
  hours: Hours,
  billable: z.boolean().default(true),
  note: z.string().max(500).optional(),
  userId: z.string().uuid().optional(),
  source: z.enum(["person", "agent"]).default("person"),
  agent: z.string().max(80).optional(),
});

async function personOf(tx: Tx, userId: string) {
  const [u] = await tx.execute(sql`select id, name from auth.user where id = ${userId} and status = 'active'`);
  if (!u) throw new Error("no active person with that id");
  return u as { id: string; name: string };
}

export type LogInput = z.infer<typeof input>;

/** The entry write inside the caller's transaction: logTime, and an accepted commit-time draft (008). */
export async function logEntry(tx: Tx, a: LogInput, ctx: ServiceContext) {
  {
    const v = viewerOf(ctx);
    const userId = a.userId ?? v?.userId;
    if (!userId) throw new Error("say whose time this is");
    if (v) assertCan(v, "time:log", { ownerUserId: userId });
    const project = await getProjectRef(tx, a.projectKey);
    if (!project) throw new Error(`no project ${a.projectKey}`);
    const day = a.day;
    const week = await ensureWeek(tx, ctx.tenantId, await personOf(tx, userId), isoWeekOf(workDay(day)));
    const lockedChange = await guardLock(tx, ctx, week, { day, hours: a.hours, projectKey: a.projectKey });
    await guardDayTotal(tx, userId, day, a.hours);
    const [e] = await tx.execute(sql`insert into time.entry (tenant_id, week_id, user_id, project_id, day, hours, billable, source, agent, note, logged_by)
      values (${ctx.tenantId}, ${week.id}, ${userId}, ${project.id}, ${day}, ${a.hours}, ${a.billable}, ${a.source}, ${a.agent ?? null}, ${a.note ?? null}, ${by(ctx)}) returning id`);
    const payload: EntryLogged = { entryId: e.id as string, weekId: week.id, userId, projectId: project.id, day, hours: a.hours, billable: a.billable, source: a.source, lockedChange, revision: 1 };
    return { result: { id: e.id as string, week: keyOf(week), day, hours: a.hours }, resourceId: e.id as string, after: { ...a, day }, events: [{ name: EVENTS.entryLogged, payload }] };
  }
}

export const logTime = defineService({
  scoped: true,
  name: "time.entry.log",
  action: "time:log",
  resource: "time.entry",
  input,
  run: (tx, a, ctx) => logEntry(tx, a, ctx),
});
