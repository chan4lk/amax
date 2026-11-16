import { sql, type SQL } from "drizzle-orm";
import { entityZoneSql } from "@amax/workflows";

/**
 * 110 AC-2: today for the person in the row (alias `p`), in their entity's own time zone (its own, else its country's,
 * else UTC: a read never refuses), from the app's clock, so one read covers people in Sri Lanka and Sydney alike.
 */
export const localToday = () => entityDay(sql`p.legal_entity_id`);

/** Today in a legal entity's own zone (else UTC, for a read), from the app's clock; `entityId` is a SQL expression. */
export const entityDay = (entityId: SQL) => sql`(${new Date().toISOString()}::timestamptz at time zone coalesce(${entityZoneSql(entityId)}, 'UTC'))::date`;

/** The as-of date: the one given, or each person's own today (localToday). Selected beside a row, it says which day was read. */
export const asOf = (at?: string) => (at ? sql`${at}::date` : localToday());

/** Orders a person's employment periods (alias `e`) so the first is the one in force on `at` (default: the person's own today), or the first period for someone who hasn't started yet. */
export const inForceOrder = (at?: string) =>
  sql`order by (e.starts_on <= ${asOf(at)}) desc, case when e.starts_on <= ${asOf(at)} then e.starts_on end desc nulls last, e.starts_on limit 1`;

/** The scope attributes of a person or employment row: every dimension an assignment can narrow by. Reads, masking and writes all check this one subject. */
export const subjectOf = (row: Record<string, unknown>) => ({
  ownerUserId: (row.user_id as string | null) ?? null, legalEntityId: row.legal_entity_id as string, department: (row.department as string | null) ?? null,
});

/** Joins the employment in force on `at` (default: each person's own today) (alias `emp`) and its manager (alias `mgr`) to `hr.person p`. */
export const employmentAt = (at?: string) => sql`left join lateral (select * from hr.employment e where e.person_id = p.id ${inForceOrder(at)}) emp on true
  left join hr.person mgr on mgr.id = emp.manager_person_id`;
