import { sql } from "drizzle-orm";
import { z } from "zod";
import { viewerOf } from "@amax/auth";
import { defineService } from "@amax/core/server";
import { eligible, STATUS, words, type BulkResult, type Kind } from "./bulk-card";
import { decide, mayDecide, writeRemind } from "./decide";
import { keyOf, type WeekRow } from "./weeks";

// A database error's own message, never the query text the driver wraps it in.
const reason = (e: unknown) => { const c = (e as { cause?: unknown }).cause; return c instanceof Error ? c.message : e instanceof Error ? e.message : String(e); };

/**
 * One confirmed card is one write (the chat engine's 043 rule), so the whole card is one service: each listed week
 * gets its own savepoint, so a failure rolls back only that person and the others still commit.
 */
const many = (kind: Kind) => defineService({
  scoped: true, name: `time.week.${kind}_many`, action: "time:approve", resource: "time.week", input: z.object({ weekIds: z.array(z.uuid()).min(1).max(50) }),
  async run(tx, a, ctx) {
    const may = mayDecide(tx, viewerOf(ctx));
    const results: BulkResult[] = [];
    const events: { name: string; payload: object }[] = [];
    for (const id of a.weekIds) {
      const [w] = (await tx.execute(sql`select * from time.week where id = ${id}`)) as unknown as WeekRow[];
      if (!w || !(await may(w))) { results.push({ person: "A timesheet", week: "", status: "skipped", note: "not one you can act on" }); continue; }
      const who = { person: w.person_name as string, week: keyOf(w) };
      if (!eligible[kind](w)) { results.push({ ...who, status: "skipped", note: `already ${STATUS[w.status] ?? w.status}` }); continue; }
      try {
        const out = await tx.transaction(async (sp) => {
          const [locked] = (await sp.execute(sql`select * from time.week where id = ${id} for update`)) as unknown as WeekRow[];
          return kind === "remind" ? writeRemind(ctx, locked) : decide(sp, ctx, locked, "approved", null);
        });
        events.push(...out.events);
        results.push({ ...who, status: "done", note: null });
      } catch (e) {
        results.push({ ...who, status: "failed", note: reason(e) });
      }
    }
    const n = (st: BulkResult["status"]) => results.filter((r) => r.status === st).length;
    const [verb, done] = words[kind];
    const shown = results.map((r) => ({ ...r, status: r.status === "done" ? done : r.status }));
    return { result: { summary: `${verb} ${n("done")} · skipped ${n("skipped")} · failed ${n("failed")}`, results: shown }, resourceId: a.weekIds[0], after: { results: shown }, events };
  },
});

export const remindMany = many("remind");
export const approveMany = many("approve");
