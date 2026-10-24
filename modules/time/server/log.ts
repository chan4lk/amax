import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { assertCan, viewerOf } from "@amax/auth";
import { defineService, type ServiceContext } from "@amax/core/server";
import { getProjectRef } from "@amax/delivery/contracts";
import { EVENTS, type EntryLogged } from "../contracts";
import { isoWeekOf } from "../week";
import { entityOf, inEntity } from "./chain";
import { guardDayTotal, guardLock, Hours, possibleDuplicate, workDay } from "./guards";
import { allocationRefusal, dateRefusal } from "./rules";
import { actorId, by, ensureWeek, keyOf } from "./weeks";

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
  clientRef: z.string().min(1).max(100).optional(),
  weekend: z.boolean().optional(),
});

async function personOf(tx: Tx, userId: string) {
  const [u] = await tx.execute(sql`select id, name from auth.user where id = ${userId} and status = 'active'`);
  if (!u) throw new Error("no active person with that id");
  return u as { id: string; name: string };
}

export type LogInput = z.infer<typeof input>;

/** The entry write inside the caller's transaction: logTime, and an accepted commit-time draft (008). */
/** A live entry already logged from this source (071 AC-6), for one person. */
export async function bySource(tx: Tx, userId: string, sourceRef: string) {
  const [e] = await tx.execute(sql`select id, project_id, to_char(day, 'YYYY-MM-DD') as day, hours, billable from time.entry
    where user_id = ${userId} and source_ref = ${sourceRef} and deleted_at is null`);
  return e ? { id: e.id as string, projectId: e.project_id as string, day: e.day as string, hours: Number(e.hours), billable: Boolean(e.billable) } : null;
}

export async function logEntry(tx: Tx, a: LogInput, ctx: ServiceContext, sourceRef: string | null = null) {
  {
    const v = viewerOf(ctx);
    const userId = a.userId ?? v?.userId;
    if (!userId) throw new Error("say whose time this is");
    if (v) assertCan(v, "time:log", { ownerUserId: userId, ...(userId === v.userId ? {} : inEntity(await entityOf(tx, userId))) });
    const project = await getProjectRef(tx, a.projectKey);
    if (!project) throw new Error(`no project ${a.projectKey}`);
    const day = a.day;
    // 071 AC-10/AC-11: the tenant's entry rules (both off by default); the date window binds only the person's own time.
    const refused = (await allocationRefusal(tx, ctx.tenantId, userId, project.id, day)) ?? (userId === actorId(ctx) ? await dateRefusal(tx, userId, day) : null);
    if (refused) throw new Error(refused);
    const week = await ensureWeek(tx, ctx.tenantId, await personOf(tx, userId), isoWeekOf(workDay(day, a.weekend)));
    const lockedChange = await guardLock(tx, ctx, week, { day, hours: a.hours, projectKey: a.projectKey });
    await guardDayTotal(tx, userId, day, a.hours);
    const twin = await possibleDuplicate(tx, userId, project.id, day, a.note);
    const [e] = await tx.execute(sql`insert into time.entry (tenant_id, week_id, user_id, project_id, day, hours, billable, source, agent, note, logged_by, source_ref)
      values (${ctx.tenantId}, ${week.id}, ${userId}, ${project.id}, ${day}, ${a.hours}, ${a.billable}, ${a.source}, ${a.agent ?? null}, ${a.note ?? null}, ${by(ctx)}, ${sourceRef})
      on conflict (tenant_id, user_id, source_ref) where source_ref is not null and deleted_at is null do nothing returning id`);
    if (!e) throw Object.assign(new Error("already logged from the same source"), { code: "source_taken", retryable: false });
    const payload: EntryLogged = { entryId: e.id as string, weekId: week.id, userId, projectId: project.id, day, hours: a.hours, billable: a.billable, source: a.source, lockedChange, revision: 1 };
    return { result: { id: e.id as string, week: keyOf(week), day, hours: a.hours, ...(twin ? { possibleDuplicateOf: twin.id } : {}) }, resourceId: e.id as string, after: { ...a, day }, events: [{ name: EVENTS.entryLogged, payload }] };
  }
}

export const logTime = defineService({
  scoped: true,
  name: "time.entry.log",
  action: "time:log",
  resource: "time.entry",
  input,
  run: (tx, a, ctx) => logEntry(tx, a, ctx, a.clientRef ? `mcp:${a.clientRef}` : null),
});
