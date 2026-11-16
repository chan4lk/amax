import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { ScopeError } from "@amax/auth";
import { defineService, isSystemContext } from "@amax/core/server";
import { CONTRACTS, EVENTS, type PersonJoined, type PersonLeft } from "../contracts";
import { changePersonRun, changeInput } from "./change";
import { date, inScope, inScopeFrom, personByNo } from "./records";
import { linkableAccount } from "./link";
import { entityZoneSet } from "@amax/workflows";
import { entityToday, noZone, unzonedEntities } from "./zones";

const initialsOf = (name: string) => name.trim().split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();

const COUNTRY: Record<string, string> = { "sri lanka": "LK", australia: "AU" };

/**
 * The add_person card's word, as the entity is picked: the refusal addPerson would give for an entity with no zone, or why
 * the entity can't be found. Undefined only for an entity found with a zone; a failed query is an error, not a pass.
 */
export async function zoneNote(tx: Tx, entity: string) {
  let e: Record<string, unknown>;
  try { e = await entityOf(tx, entity); } catch (err) { if (err instanceof EntityLookupError) return err.message; throw err; }
  return (await entityZoneSet(tx, e.id as string)) ? undefined : noZone(String(e.name));
}

/** 110 AC-6: entityOf's own refusals (none, or more than one), the only errors the card turns into its note. */
export class EntityLookupError extends Error {}

/** Exactly one legal entity: by id or full name first, else by country (name or code). Never a guess. */
export async function entityOf(tx: Tx, entity: string) {
  const key = entity.trim();
  const code = COUNTRY[key.toLowerCase()] ?? key;
  const rows = await tx.execute(sql`select id, name, country, base_currency, (id::text = ${key} or lower(name) = lower(${key})) as exact
    from core.legal_entity where id::text = ${key} or lower(name) = lower(${key}) or lower(country) = lower(${code})`);
  const exact = rows.filter((r) => r.exact);
  const hits = exact.length ? exact : rows;
  if (!hits.length) throw new EntityLookupError(`no legal entity ${key}`);
  if (hits.length > 1) throw new EntityLookupError(`${key} matches ${hits.length} legal entities: give the entity's full name`);
  return hits[0];
}

/** Next employee number in the entity's series (LL-0641 after LL-0640), serialised per tenant. */
async function nextEmployeeNo(tx: Tx, tenantId: string, entityId: string, country: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`hr.employee_no:${tenantId}`}))`);
  const [r] = await tx.execute(sql`select split_part(employee_no, '-', 1) as prefix, max(nullif(regexp_replace(split_part(employee_no, '-', 2), '\\D', '', 'g'), '')::int) as n
    from hr.person where legal_entity_id = ${entityId} and employee_no ~ '^[A-Z]+-\\d+$' group by 1 order by count(*) desc limit 1`);
  return `${(r?.prefix as string | undefined) ?? country}-${String(Number(r?.n ?? 0) + 1).padStart(4, "0")}`;
}

export const addPerson = defineService({
  scoped: true,
  name: "hr.person.add",
  action: "hr:person:create",
  resource: "hr.person",
  sensitive: { baseSalary: "pay" },
  input: z.object({
    name: z.string().min(2), title: z.string().min(1), department: z.string().min(1), entity: z.string().min(2), joinedOn: date.optional(),
    managerEmployeeNo: z.string().optional(), contract: z.enum(CONTRACTS).default("permanent"), fte: z.number().gt(0).max(1).default(1),
    grade: z.string().optional(), workEmail: z.string().email().optional(), baseSalary: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  }),
  async run(tx, input, ctx) {
    const e = await entityOf(tx, input.entity);
    inScope(ctx, "hr:person:create", { legalEntityId: e.id as string, department: input.department });
    const manager = input.managerEmployeeNo ? await personByNo(tx, input.managerEmployeeNo) : null;
    const no = await nextEmployeeNo(tx, ctx.tenantId, e.id as string, e.country as string);
    const local = await entityToday(tx, e.id as string);
    const joinedOn = input.joinedOn ?? local;
    // 109 AC-5: one today, the entity's own, for the default join date and for joining vs active.
    const status = joinedOn > local ? "joining" : "active";
    // 107: a person added with the work email of someone who can already sign in is linked to them, so their allocations
    // count for what they may do (assigned projects); an account already linked to someone else is left alone.
    const link = await linkableAccount(tx, input.workEmail);
    const [p] = await tx.execute(sql`insert into hr.person (tenant_id, legal_entity_id, employee_no, name, initials, title, work_email, status, joined_on, user_id)
      values (${ctx.tenantId}, ${e.id}, ${no}, ${input.name}, ${initialsOf(input.name)}, ${input.title}, ${input.workEmail ?? null}, ${status}, ${joinedOn}, ${link?.id ?? null})
      returning id, user_id`);
    await tx.execute(sql`insert into hr.employment (tenant_id, person_id, legal_entity_id, department, grade, manager_person_id, contract, fte, starts_on, currency, base_salary)
      values (${ctx.tenantId}, ${p.id}, ${e.id}, ${input.department}, ${input.grade ?? null}, ${manager?.id ?? null}, ${input.contract}, ${input.fte}, ${joinedOn}, ${e.base_currency}, ${input.baseSalary ?? null})`);
    const payload: PersonJoined = { personId: p.id as string, userId: (p.user_id as string | null) ?? null, legalEntityId: e.id as string, department: input.department, joinedOn, status };
    return { result: { id: p.id as string, employeeNo: no, status }, resourceId: p.id as string, after: { employeeNo: no, ...input, joinedOn, linkedUserId: (p.user_id as string | null) ?? null }, events: [{ name: EVENTS.personJoined, payload }] };
  },
});

export const changePerson = defineService({ scoped: true, name: "hr.person.change", action: "hr:person:update", resource: "hr.person", sensitive: { baseSalary: "pay" }, input: changeInput, run: changePersonRun });

export const recordLeaver = defineService({
  scoped: true,
  name: "hr.person.leave",
  action: "hr:person:leave",
  resource: "hr.person",
  input: z.object({ employeeNo: z.string(), leftOn: date, reason: z.string().max(500).optional() }),
  async run(tx, input, ctx) {
    const p = await personByNo(tx, input.employeeNo);
    await inScopeFrom(tx, ctx, "hr:person:leave", p, input.leftOn);
    if (p.status === "left") throw new Error(`${input.employeeNo} has already left`);
    // Review round 1: left today or before, in the person's entity's own today, as addPerson and the daily job decide.
    const status = input.leftOn <= await entityToday(tx, p.legal_entity_id as string) ? "left" : p.status;
    await tx.execute(sql`update hr.person set left_on = ${input.leftOn}, status = ${status}, updated_at = now() where id = ${p.id}`);
    // Periods that would only start after the last day never happen (a future FTE step, or the whole
    // employment of someone who leaves before their start date); the one in force ends that day.
    const removed = await tx.execute(sql`delete from hr.employment where person_id = ${p.id} and starts_on > ${input.leftOn}::date
      returning id, starts_on::text as "startsOn", ends_on::text as "endsOn", department, grade, manager_person_id as "managerPersonId", contract, fte::float as fte,
        next_review::text as "nextReview", currency, (base_salary is not null) as "hadPay"`);
    const ended = await tx.execute(sql`update hr.employment e set ends_on = ${input.leftOn}, updated_at = now() from hr.employment old
      where old.id = e.id and e.person_id = ${p.id} and (e.ends_on is null or e.ends_on > ${input.leftOn}::date)
      returning e.id, e.starts_on::text as "startsOn", old.ends_on::text as "endsOnBefore"`);
    const payload: PersonLeft = { personId: p.id as string, userId: (p.user_id as string | null) ?? null, leftOn: input.leftOn };
    return { result: { employeeNo: input.employeeNo, status, leftOn: input.leftOn }, resourceId: p.id as string, before: { status: p.status, leftOn: p.left_on ?? null, removedPeriods: removed.map((r) => ({ ...r })), endedPeriods: ended.map((r) => ({ ...r })) }, after: { status, ...input }, events: [{ name: EVENTS.personLeft, payload }] };
  },
});

/**
 * Moves people whose dates have come: 'joining' to 'active' once joined_on passes, anyone to 'left'
 * once left_on passes. Run hourly by the hr.person.status job; safe to re-run.
 */
export const applyStatusDates = defineService({
  name: "hr.person.status-dates",
  action: "hr:person:update",
  resource: "hr.person",
  input: z.object({ on: date.optional() }),
  async run(tx, { on }, ctx) {
    if (!isSystemContext(ctx)) throw new ScopeError("hr:person:update");
    // Review round 1: without `on`, each entity's people move by that entity's own today, as addPerson decides. Review
    // round 2: an entity with no zone is left as it is and named, never moved by UTC's today.
    const entities = await tx.execute(sql`select id from core.legal_entity`);
    const missing = on ? [] : await unzonedEntities(tx);
    const days: Record<string, string> = {};
    for (const e of entities) {
      if (on) days[e.id as string] = on;
      else if (!missing.some((m) => m.id === e.id)) days[e.id as string] = await entityToday(tx, e.id as string);
    }
    const unzoned = missing.map((m) => m.name);
    const started: string[] = [], left: string[] = [];
    for (const [entity, d] of Object.entries(days)) {
      left.push(...(await tx.execute(sql`update hr.person set status = 'left', updated_at = now() where legal_entity_id = ${entity} and status <> 'left' and left_on <= ${d}::date returning employee_no`)).map((r) => r.employee_no as string));
      started.push(...(await tx.execute(sql`update hr.person set status = 'active', updated_at = now()
        where legal_entity_id = ${entity} and status = 'joining' and joined_on <= ${d}::date returning employee_no`)).map((r) => r.employee_no as string));
    }
    const result = { on: on ?? null, days, started, left, unzoned };
    return { result, after: result };
  },
});
