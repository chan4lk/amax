import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import type { ServiceContext } from "@amax/core/server";
import { CONTRACTS, EVENTS, type PersonChanged } from "../contracts";
import { date, inScopeFrom, personByNo } from "./records";
import { entityToday } from "./zones";

export const changeInput = z.object({
  employeeNo: z.string(), effectiveOn: date.optional(),
  title: z.string().min(1).optional(), location: z.string().optional(), workEmail: z.string().email().optional(),
  department: z.string().min(1).optional(), grade: z.string().optional(), managerEmployeeNo: z.string().optional(),
  contract: z.enum(CONTRACTS).optional(), fte: z.number().gt(0).max(1).optional(), nextReview: date.optional(),
  baseSalary: z.string().regex(/^\d+(\.\d+)?$/).optional(),
});
type ChangeInput = z.infer<typeof changeInput>;

const PERSON_FIELDS = { title: "title", location: "location", workEmail: "work_email" } as const;
const JOB_FIELDS = { department: "department", grade: "grade", contract: "contract", fte: "fte", nextReview: "next_review", baseSalary: "base_salary" } as const;

/**
 * A job change starts a new employment period on `effectiveOn`; the period before it ends the day before.
 * Periods that already start later carry the change too until one plans its own value, or it would be
 * undone when they start.
 */
async function newPeriod(tx: Tx, personId: string, on: string, set: Record<string, unknown>) {
  const [cur] = await tx.execute(sql`select *, starts_on::text as starts from hr.employment where person_id = ${personId} and starts_on <= ${on}::date order by starts_on desc limit 1 for update`);
  if (!cur) throw new Error("this person has no employment on that date");
  const next = { ...cur, ...set };
  if (cur.starts !== on) {
    await tx.execute(sql`update hr.employment set ends_on = ${on}::date - 1, updated_at = now() where id = ${cur.id}`);
    await tx.execute(sql`insert into hr.employment (tenant_id, person_id, legal_entity_id, department, grade, manager_person_id, contract, fte, starts_on, ends_on, next_review, currency, base_salary, epf_number, bank_name, bank_account)
      values (${cur.tenant_id}, ${personId}, ${cur.legal_entity_id}, ${next.department}, ${next.grade}, ${next.manager_person_id}, ${next.contract}, ${next.fte}, ${on}, ${cur.ends_on},
              ${next.next_review}, ${cur.currency}, ${next.base_salary}, ${cur.epf_number}, ${cur.bank_name}, ${cur.bank_account})`);
  } else {
    await tx.execute(sql`update hr.employment set department = ${next.department}, grade = ${next.grade}, manager_person_id = ${next.manager_person_id}, contract = ${next.contract},
      fte = ${next.fte}, next_review = ${next.next_review}, base_salary = ${next.base_salary}, updated_at = now() where id = ${cur.id}`);
  }
  // A later period inherits the change only while it still holds what the period before it held: the
  // first period that sets its own value (an FTE step, a raise, an acting grade) and everything after
  // it keep their plan, even a later step back to the old value.
  const later = await tx.execute(sql`select * from hr.employment where person_id = ${personId} and starts_on > ${on}::date order by starts_on for update`);
  const same = (a: unknown, b: unknown) => (a ?? null) === (b ?? null) || (a != null && b != null && String(a) === String(b));
  for (const [col, v] of Object.entries(set)) {
    for (const l of later) {
      if (!same(l[col], cur[col])) break;
      await tx.execute(sql`update hr.employment set ${sql.identifier(col)} = ${v}, updated_at = now() where id = ${l.id}`);
    }
  }
}

export async function changePersonRun(tx: Tx, input: ChangeInput, ctx: ServiceContext) {
  const p = await personByNo(tx, input.employeeNo);
  // 110 AC-1: the person's entity's own today, as addPerson and the status job decide; an entity with no zone is refused.
  const local = await entityToday(tx, p.legal_entity_id as string);
  const on = input.effectiveOn ?? local;
  await inScopeFrom(tx, ctx, "hr:person:update", p, on, [input.department]);
  const personSet = Object.entries(PERSON_FIELDS).filter(([k]) => input[k as keyof ChangeInput] !== undefined);
  // Title, location and work email aren't effective-dated: they change now, so the event and audit
  // must not claim another date for them.
  if (personSet.length && on !== local) throw new Error(`${personSet.map(([k]) => k).join(", ")} change today: leave out effectiveOn or change them separately`);
  const changed = Object.keys(input).filter((k) => k !== "employeeNo" && k !== "effectiveOn" && input[k as keyof ChangeInput] !== undefined);
  if (!changed.length) throw new Error("nothing to change");
  for (const [k, col] of personSet) await tx.execute(sql`update hr.person set ${sql.identifier(col)} = ${input[k as keyof ChangeInput]}, updated_at = now() where id = ${p.id}`);
  const job: Record<string, unknown> = Object.fromEntries(Object.entries(JOB_FIELDS).filter(([k]) => input[k as keyof ChangeInput] !== undefined).map(([k, col]) => [col, input[k as keyof ChangeInput]]));
  if (input.managerEmployeeNo) job.manager_person_id = (await personByNo(tx, input.managerEmployeeNo)).id;
  if (Object.keys(job).length) await newPeriod(tx, p.id as string, on, job);
  const payload: PersonChanged = { personId: p.id as string, userId: (p.user_id as string | null) ?? null, changed, effectiveOn: on };
  return { result: { employeeNo: input.employeeNo, changed, effectiveOn: on }, resourceId: p.id as string, after: { ...input, effectiveOn: on }, events: [{ name: EVENTS.personChanged, payload }] };
}
