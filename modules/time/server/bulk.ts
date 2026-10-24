import { sql } from "drizzle-orm";
import { z } from "zod";
import { viewerOf } from "@amax/auth";
import type { Tx } from "@amax/db";
import { defineService, type ServiceContext } from "@amax/core/server";
import { eligible, STATUS, words, type BulkResult, type Kind } from "./bulk-card";
import { weekAnomalies } from "./anomalies";
import { decide, mayDecide, writeRemind } from "./decide";
import { notStartedIn } from "./not-started";
import { recordReminder } from "./reminders";
import { by, keyOf, type WeekRow } from "./weeks";
import { EVENTS, type WeekReminded } from "../contracts";

// A database error's own message, never the query text the driver wraps it in.
const reason = (e: unknown) => { const c = (e as { cause?: unknown }).cause; return c instanceof Error ? c.message : e instanceof Error ? e.message : String(e); };

/**
 * One confirmed card is one write (the chat engine's 043 rule), so the whole card is one service: each listed week
 * gets its own savepoint, so a failure rolls back only that person and the others still commit.
 */
// 073: remind_weeks may also name people with no timesheet that week (Not started), with the week they owe.
const input = z.object({ weekIds: z.array(z.uuid()).max(50).default([]), week: z.string().regex(/^\d{4}-W\d{2}$/).optional(), userIds: z.array(z.uuid()).max(50).optional() })
  .refine((a) => a.weekIds.length > 0 || (a.userIds?.length && a.week), "name the week ids, or the week and the people with no timesheet");

/** Not started people get the same week reminder, recorded with no week id; each in its own savepoint, as the weeks are. */
async function remindNotStarted(tx: Tx, ctx: ServiceContext, a: z.infer<typeof input>, results: BulkResult[], events: { name: string; payload: object }[]) {
  if (!a.userIds?.length || !a.week) return;
  for (const p of await notStartedIn(tx, viewerOf(ctx)!, a.week, a.userIds)) {
    if (!p.ok) { results.push({ person: p.name, week: a.week, status: "skipped", note: p.why }); continue; }
    await tx.transaction((sp) => recordReminder(sp, ctx, { userId: p.userId, kind: "week", weekId: null }));
    const payload: WeekReminded = { weekId: null, userId: p.userId, week: a.week, by: by(ctx), message: null };
    events.push({ name: EVENTS.weekReminded, payload });
    results.push({ person: p.name, week: a.week, status: "done", note: null });
  }
}

const many = (kind: Kind) => defineService({
  scoped: true, name: `time.week.${kind}_many`, action: "time:approve", resource: "time.week", input,
  async run(tx, a, ctx) {
    const may = mayDecide(tx, viewerOf(ctx));
    const results: BulkResult[] = [];
    const events: { name: string; payload: object }[] = [];
    for (const id of a.weekIds) {
      const [w] = (await tx.execute(sql`select * from time.week where id = ${id}`)) as unknown as WeekRow[];
      if (!w || !(await may(w))) { results.push({ person: "A timesheet", week: "", status: "skipped", note: "not one you can act on" }); continue; }
      const who = { person: w.person_name as string, week: keyOf(w) };
      if (!eligible[kind](w)) { results.push({ ...who, status: "skipped", note: `already ${STATUS[w.status] ?? w.status}` }); continue; }
      // 073 AC-10: a week that needs a closer look is never approved in bulk.
      const checks = kind === "approve" ? await weekAnomalies(tx, w) : [];
      if (checks.length) { results.push({ ...who, status: "skipped", note: `needs individual review: ${checks.join("; ")}` }); continue; }
      try {
        const out = await tx.transaction(async (sp) => {
          const [locked] = (await sp.execute(sql`select * from time.week where id = ${id} for update`)) as unknown as WeekRow[];
          return kind === "remind" ? writeRemind(sp, ctx, locked) : decide(sp, ctx, locked, "approved", null);
        });
        events.push(...out.events);
        results.push({ ...who, status: "done", note: null });
      } catch (e) {
        results.push({ ...who, status: "failed", note: reason(e) });
      }
    }
    if (kind === "remind") await remindNotStarted(tx, ctx, a, results, events);
    const n = (st: BulkResult["status"]) => results.filter((r) => r.status === st).length;
    const [verb, done] = words[kind];
    const shown = results.map((r) => ({ ...r, status: r.status === "done" ? done : r.status }));
    return { result: { summary: `${verb} ${n("done")} · skipped ${n("skipped")} · failed ${n("failed")}`, results: shown }, resourceId: a.weekIds[0] ?? a.userIds?.[0] ?? "", after: { results: shown }, events };
  },
});

export const remindMany = many("remind");
export const approveMany = many("approve");
