import { ToolError } from "@amax/mcp";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { ScopeError, viewerOf, type Viewer } from "@amax/auth";
import type { ToolCard } from "@amax/core";
import { defineService } from "@amax/core/server";
import { refuse } from "./card";
import { adminOver, entityOf } from "./chain";
import { read } from "./read";
import { by } from "./weeks";

export const DEFAULT_TARGET = 40;

/** 072 AC-7: each person's weekly target hours; 40 h when none is set. */
export async function targetsOf(tx: Tx, userIds: string[]): Promise<Map<string, number>> {
  const ids = [...new Set(userIds)];
  const rows = ids.length ? await tx.execute(sql`select user_id, hours from time.target where user_id::text in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`) : [];
  const set = new Map(rows.map((r) => [r.user_id as string, Number(r.hours)]));
  return new Map(ids.map((id) => [id, set.get(id) ?? DEFAULT_TARGET]));
}

/**
 * 072 AC-8, AC-9 (review round 1): one rule for a week's utilisation, used by My week and by get_week_utilisation:
 * the week's exact hours (never the screens' 0.1 h rounding), none for a sent-back week (D4), against the target.
 */
export function weekFigures(exactHours: number, status: string | null, target: number) {
  const hours = status === "rejected" ? 0 : Math.round(exactHours * 100) / 100;
  return { hours, target, utilisation: target > 0 ? Math.round((hours / target) * 100) : 0, overtime: hours > target };
}

/** The exact hours of each person's week: the one query My week and get_week_utilisation share (review round 2). */
export async function exactWeekHours(tx: Tx, userIds: string[], w: { year: number; week: number }): Promise<Map<string, number>> {
  const ids = [...new Set(userIds)];
  if (!ids.length) return new Map();
  const rows = await tx.execute(sql`select w.user_id, sum(e.hours) as hours from time.week w join time.entry e on e.week_id = w.id
    where w.iso_year = ${w.year} and w.iso_week = ${w.week} and e.deleted_at is null and w.user_id::text in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)}) group by w.user_id`);
  const found = new Map(rows.map((r) => [r.user_id as string, Number(r.hours)]));
  return new Map(ids.map((id) => [id, found.get(id) ?? 0]));
}

async function personOf(tx: Tx, person: string) {
  const rows = await tx.execute(sql`select id, name from auth.user where status = 'active' and (lower(email) = lower(${person}) or lower(name) = lower(${person}))`);
  if (rows.length !== 1) throw new ToolError(rows.length ? `more than one ${person}; use their email` : `no active person called ${person}`, rows.length ? "invalid_input" : "not_found");
  return { id: rows[0].id as string, name: rows[0].name as string };
}

const input = z.object({ person: z.string().min(1), hours: z.number().min(1).max(60).multipleOf(0.5).nullable() });
type Input = z.infer<typeof input>;

/** AC-7: an Admin sets (or, with null, clears back to 40 h) a person's weekly target, in the person's legal entity. */
export const setTarget = defineService({
  name: "time.target.set", action: "time:admin", resource: "time.target", input,
  async run(tx, a, ctx) {
    const p = await personOf(tx, a.person);
    const v = viewerOf(ctx);
    if (v && !adminOver(v, await entityOf(tx, p.id))) throw new ScopeError("time:admin");
    const before = (await targetsOf(tx, [p.id])).get(p.id)!;
    if (a.hours === null) await tx.execute(sql`delete from time.target where user_id = ${p.id}`);
    else await tx.execute(sql`insert into time.target (tenant_id, user_id, hours, updated_by) values (${ctx.tenantId}, ${p.id}, ${a.hours}, ${by(ctx)})
      on conflict (tenant_id, user_id) do update set hours = excluded.hours, updated_by = excluded.updated_by, updated_at = now()`);
    const after = a.hours ?? DEFAULT_TARGET;
    return { result: { person: p.name, target: after }, resourceId: p.id, before: { target: before }, after: { target: after } };
  },
});

export async function targetCard(v: Viewer, a: Input): Promise<ToolCard> {
  const { p, now } = await read(v, async (tx) => { const p = await personOf(tx, a.person); return { p, now: (await targetsOf(tx, [p.id])).get(p.id)! }; });
  return { title: `Weekly target for ${p.name}`, lines: [{ label: "Target", value: `${now} h → ${a.hours ?? DEFAULT_TARGET} h` }] };
}

export async function proposeTarget(v: Viewer, a: Input) {
  const ok = await read(v, async (tx) => { const p = await personOf(tx, a.person).catch((e: Error) => refuse(e.message)); return adminOver(v, await entityOf(tx, p.id)); });
  if (!ok) refuse("that person isn't one whose target you can set");
}
