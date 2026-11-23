import { sql } from "drizzle-orm";
import type { Viewer } from "@amax/auth";
import { asOf as dayOf, employmentAt, entityDay } from "./inforce";
import { readHr } from "./read";

export type PeopleStats = {
  day: string; oneMonth: boolean; headcount: number; byEntity: { id: string; name: string; country: string; n: number }[]; departments: { name: string; n: number }[];
  months: string[]; joiners: number[]; leavers: number[]; quarter: { joined: number; left: number }; upcoming: { n: number; on: string | null };
  probation: { open: number; dueThisMonth: number }; documentsMissing: number; contractsEndingNextMonth: number;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Ticket, chart and lede numbers for the People screen, as of `asOf` (a date) or, by default (110 AC-2), each person's
 * own today: every count that depends on the day reads it per person, each in their own year and month. `day` is the
 * screen's own day, for the chart's year and month labels: the date given, else the latest today among the entities
 * shown; `oneMonth` says whether every entity shown is in that month, so a lede names a month only when it is everyone's.
 * The chart counts each person in the screen's year only.
 */
export const peopleStats = (v: Viewer, asOf?: string | Date, entityId?: string) =>
  readHr(v, async (tx): Promise<PeopleStats> => {
    const given = asOf === undefined ? undefined : typeof asOf === "string" ? asOf : iso(asOf);
    const ent = entityId ? sql`and p.legal_entity_id = ${entityId}` : sql``;
    const [{ day, months: entityMonths }] = given ? [{ day: given, months: 1 }] : await tx.execute(sql`select to_char(max(d), 'YYYY-MM-DD') as day,
        count(distinct date_trunc('month', d))::int as months
      from (select ${entityDay(sql`le.id`)} as d from core.legal_entity le ${entityId ? sql`where le.id = ${entityId}` : sql``}) x`);
    if (!day) throw new Error("no legal entity to count people in: add one first");
    const day0 = new Date(`${String(day)}T00:00:00Z`);
    const y = day0.getUTCFullYear(), m = day0.getUTCMonth();
    const D = dayOf(given);
    const month = (k: number) => sql`(date_trunc('month', ${D}) + ${`${k} month`}::interval)::date`;
    const byEntity = await tx.execute(sql`select le.id, le.name, le.country, count(p.id)::int as n from core.legal_entity le
      left join hr.person p on p.legal_entity_id = le.id and p.status = 'active' ${ent} group by le.id order by n desc`);
    const departments = await tx.execute(sql`select emp.department as name, count(*)::int as n from hr.person p ${employmentAt(given)}
      where p.status = 'active' ${ent} group by emp.department order by n desc, name`);
    const year = sql`date_trunc('year', ${D})::date`;
    const flows = await tx.execute(sql`select extract(month from d)::int as m, sum(j)::int as joined, sum(l)::int as left from (
        select joined_on as d, 1 as j, 0 as l from hr.person p where joined_on between ${year} and ${D} ${ent}
        union all select left_on, 0, 1 from hr.person p where status = 'left' and left_on between ${year} and ${D} ${ent}) f
      where extract(year from d)::int = ${y} group by 1`);
    const [one] = await tx.execute(sql`select
        (select count(*)::int from hr.person p where status = 'joining' ${ent}) as upcoming,
        (select min(joined_on) from hr.person p where status = 'joining' ${ent}) as upcoming_on,
        (select count(*)::int from hr.probation b join hr.person p on p.id = b.person_id where b.status = 'open' and p.status = 'active' ${ent}) as probation,
        (select count(*)::int from hr.probation b join hr.person p on p.id = b.person_id where b.status = 'open' and p.status = 'active'
           and b.ends_on >= ${month(0)} and b.ends_on < ${month(1)} ${ent}) as due,
        (select count(*)::int from hr.document d join hr.person p on p.id = d.person_id where d.status = 'missing' and p.status <> 'left' ${ent}) as missing,
        (select count(distinct x.person_id)::int from hr.employment x join hr.person p on p.id = x.person_id where p.status <> 'left' and x.contract = 'fixed-term'
           and x.ends_on >= ${month(1)} and x.ends_on < ${month(2)} ${ent}
           and not exists (select 1 from hr.employment later where later.person_id = x.person_id and later.starts_on > x.starts_on)) as ending`);
    const months = Array.from({ length: m + 1 }, (_, i) => new Date(Date.UTC(y, i, 1)).toLocaleString("en-US", { month: "short", timeZone: "UTC" }));
    const at = (i: number, k: "joined" | "left") => Number(flows.find((f) => Number(f.m) === i + 1)?.[k] ?? 0);
    const q = Math.floor(m / 3) * 3;
    const joiners = months.map((_, i) => at(i, "joined")), leavers = months.map((_, i) => at(i, "left"));
    return {
      day: String(day), oneMonth: Number(entityMonths) === 1, headcount: byEntity.reduce((n, e) => n + Number(e.n), 0),
      byEntity: byEntity.map((e) => ({ id: e.id as string, name: e.name as string, country: e.country as string, n: Number(e.n) })),
      departments: departments.map((d) => ({ name: d.name as string, n: Number(d.n) })), months, joiners, leavers,
      quarter: { joined: joiners.slice(q).reduce((a, b) => a + b, 0), left: leavers.slice(q).reduce((a, b) => a + b, 0) },
      upcoming: { n: Number(one.upcoming), on: one.upcoming_on ? String(one.upcoming_on instanceof Date ? iso(one.upcoming_on) : one.upcoming_on).slice(0, 10) : null },
      probation: { open: Number(one.probation), dueThisMonth: Number(one.due) }, documentsMissing: Number(one.missing), contractsEndingNextMonth: Number(one.ending),
    };
  });
