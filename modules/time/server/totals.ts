import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { can, canEver, type Viewer } from "@amax/auth";
import { ForbiddenError } from "@amax/core/server";
import { weekKey } from "../week";
import { entitiesOf, inEntity, type Entity } from "./chain";

export type ApprovedWeekHours = { rows: { userId: string; week: string; hours: number }[]; unreadable: string[] };

const readable = (v: Viewer, userId: string, entity: Entity) => userId === v.userId || can(v, "time:totals", inEntity(entity));

/**
 * 071 AC-1: approved hours per person and ISO week (weeks starting in the range), for Payroll's overtime. Totals
 * only: no projects, days, notes or requests; never a deleted entry. People asked for outside the reader's entity
 * scope come back as `unreadable`, so a caller never mistakes "can't read" for "no overtime".
 */
export async function approvedWeekHours(tx: Tx, v: Viewer, q: { from: string; to: string; userIds?: string[] }): Promise<ApprovedWeekHours> {
  if (!canEver(v, "time:totals")) throw new ForbiddenError("time:totals", "time");
  const only = q.userIds ? (q.userIds.length ? sql`and w.user_id::text in (${sql.join(q.userIds.map((id) => sql`${id}`), sql`, `)})` : sql`and false`) : sql``;
  const weeks = await tx.execute(sql`select w.user_id, w.iso_year, w.iso_week, coalesce(sum(e.hours), 0) as hours
    from time.week w left join time.entry e on e.week_id = w.id and e.deleted_at is null
    where w.status = 'approved' and w.starts_on between ${q.from} and ${q.to} ${only} group by w.id order by w.user_id, w.starts_on`);
  const people = q.userIds ?? weeks.map((w) => w.user_id as string);
  const entities = await entitiesOf(tx, people);
  const unreadable = [...new Set(people)].filter((id) => !readable(v, id, entities.get(id) ?? null));
  const hidden = new Set(unreadable);
  const rows = weeks.filter((w) => !hidden.has(w.user_id as string))
    .map((w) => ({ userId: w.user_id as string, week: weekKey({ year: Number(w.iso_year), week: Number(w.iso_week) }), hours: Math.round(Number(w.hours) * 100) / 100 }));
  return { rows, unreadable };
}
