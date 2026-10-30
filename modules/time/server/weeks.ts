import { sql } from "drizzle-orm";
import { ToolError } from "@amax/mcp";
import type { Tx } from "@amax/db";
import { ScopeError, viewerOf } from "@amax/auth";
import type { ServiceContext } from "@amax/core/server";
import { parseWeekKey, weekKey, weekStart, type IsoWeek } from "../week";

export type WeekRow = Record<string, unknown> & { id: string; user_id: string; status: string; iso_year: number; iso_week: number };
export type WeekRef = { weekId?: string; person?: string; week?: string };

export const by = (ctx: ServiceContext) => (ctx.onBehalfOf ? `${ctx.actor.id} for ${ctx.onBehalfOf}` : ctx.actor.id);
/** The acting person's user id, as event payloads name them for notifications (`{by|name}`, `except: "by"`). */
export const actorId = (ctx: ServiceContext) => viewerOf(ctx)?.userId ?? ctx.actor.id;
export const keyOf = (w: WeekRow) => weekKey({ year: Number(w.iso_year), week: Number(w.iso_week) });

/** 070 AC-9: a week a write names must be given; the server never picks one by the UTC clock. */
export function weekOf(key: string | undefined): IsoWeek {
  if (!key) throw new ToolError("say which ISO week, such as 2026-W42", "invalid_input");
  const w = parseWeekKey(key);
  if (!w) throw new ToolError(`${key} isn't an ISO week like 2026-W42`, "invalid_input");
  return w;
}

/** An optional week from a URL or tool input: absent means "latest", malformed or non-existent is an error, never another week. */
export const wantedWeek = (key: string | undefined): IsoWeek | undefined => (key === undefined || key === "" ? undefined : weekOf(key));

export async function ensureWeek(tx: Tx, tenantId: string, user: { id: string; name: string }, w: IsoWeek): Promise<WeekRow> {
  await tx.execute(sql`insert into time.week (tenant_id, user_id, person_name, iso_year, iso_week, starts_on)
    values (${tenantId}, ${user.id}, ${user.name}, ${w.year}, ${w.week}, ${weekStart(w).toISOString().slice(0, 10)}) on conflict do nothing`);
  const [row] = await tx.execute(sql`select * from time.week where user_id = ${user.id} and iso_year = ${w.year} and iso_week = ${w.week} for update`);
  return row as WeekRow;
}

export type MayAct = (week: WeekRow) => boolean | Promise<boolean>;

async function candidates(tx: Tx, ref: WeekRef): Promise<WeekRow[]> {
  if (ref.weekId) return (await tx.execute(sql`select * from time.week where id = ${ref.weekId}`)) as unknown as WeekRow[];
  if (!ref.person) throw new ToolError("say whose timesheet: a weekId, or a person and week", "invalid_input");
  const w = weekOf(ref.week);
  return (await tx.execute(sql`select w.*, u.email from time.week w join auth.user u on u.id = w.user_id
    where (lower(u.email) = lower(${ref.person}) or lower(w.person_name) = lower(${ref.person})) and w.iso_year = ${w.year} and w.iso_week = ${w.week} order by u.email`)) as unknown as WeekRow[];
}

/** The one week the caller may act on that `ref` names, without locking it; null when there's none. */
export async function peekWeek(tx: Tx, ref: WeekRef, may: MayAct): Promise<WeekRow | null> {
  const rows: WeekRow[] = [];
  for (const r of await candidates(tx, ref)) if (await may(r)) rows.push(r);
  const exact = rows.filter((r) => String(r.email ?? "").toLowerCase() === ref.person?.toLowerCase());
  const pick = exact.length === 1 ? exact[0] : rows.length === 1 ? rows[0] : null;
  if (!pick && rows.length > 1) throw new ToolError(`more than one ${ref.person} has a timesheet in ${ref.week} you can act on; use their email`, "invalid_input");
  return pick;
}

/**
 * 070 AC-10: the week a write acts on. Only weeks the caller may act on are considered, before any row
 * is locked, so a missing week and someone else's give the same error, and a namesake's email never shows.
 */
export async function findWeek(tx: Tx, ref: WeekRef, action: string, may: MayAct): Promise<WeekRow> {
  const pick = await peekWeek(tx, ref, may);
  const [locked] = pick ? await tx.execute(sql`select * from time.week where id = ${pick.id} for update`) : [];
  if (!locked || !(await may(locked as WeekRow))) throw new ScopeError(action);
  return locked as WeekRow;
}

/** A week's projects: those of every live entry in it, for a query over `time.week w`. The one definition (071 review round 3). */
export const weekProjects = sql`coalesce((select array_agg(distinct x.project_id::text) from time.entry x where x.week_id = w.id and x.deleted_at is null), '{}')`;

export const weekProjectIds = async (tx: Tx, weekId: string) =>
  ((await tx.execute(sql`select ${weekProjects} as projects from time.week w where w.id = ${weekId}`))[0]?.projects as string[] | undefined) ?? [];

export const weekHours = async (tx: Tx, weekId: string) =>
  Number((await tx.execute(sql`select coalesce(sum(hours), 0) as h from time.entry where week_id = ${weekId} and deleted_at is null`))[0].h);
