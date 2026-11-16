import { sql } from "drizzle-orm";
import { canSee, type Masked, type Viewer } from "@amax/auth";
import type { Sensitivity } from "@amax/core/server";
import { getEmployment, toPersonRef, type Employment, type PersonRef } from "../contracts";
import { asOf, employmentAt } from "./inforce";
import { readHr } from "./read";

/** `asOf` (110): the day the row was read on, the person's own today unless a date was given. */
export type DirectoryRow = PersonRef & { country: string; entityName: string; probationEnds: string | null; asOf: string };
export type DocumentRow = { id: string; title: string | Masked; class: string; status: string; datedOn: string | null };
export type PersonView = { person: DirectoryRow; workEmail: string | null; location: string | null; employment: Employment | null; documents: DocumentRow[] };

const day = (v: unknown) => (v ? (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10) : null);

const directory = (on?: string) => sql`select p.*, to_char(${asOf(on)}, 'YYYY-MM-DD') as as_of, emp.department, emp.manager_person_id, mgr.user_id as manager_user_id, mgr.name as manager_name,
    le.country, le.name as entity_name, (select min(ends_on) from hr.probation b where b.person_id = p.id and b.status = 'open') as probation_ends
  from hr.person p ${employmentAt(on)} join core.legal_entity le on le.id = p.legal_entity_id`;

const row = (r: Record<string, unknown>): DirectoryRow => ({ ...toPersonRef(r), country: r.country as string, entityName: r.entity_name as string, probationEnds: day(r.probation_ends), asOf: r.as_of as string });

/** The directory as of `on` (default: each person's own today): shared people with a sign-in first, then by name. `total` counts every match. */
export const listDirectory = (v: Viewer, opts: { entityId?: string; q?: string; limit?: number; on?: string } = {}) =>
  readHr(v, async (tx) => {
    const on = opts.on;
    const where = [sql`p.status <> 'left'`, opts.entityId ? sql`p.legal_entity_id = ${opts.entityId}` : undefined,
      opts.q ? sql`(p.name ilike ${`%${opts.q}%`} or p.title ilike ${`%${opts.q}%`} or emp.department ilike ${`%${opts.q}%`})` : undefined].filter((w): w is ReturnType<typeof sql> => Boolean(w));
    const filter = sql`where ${sql.join(where, sql` and `)}`;
    const [{ n }] = await tx.execute(sql`select count(*)::int as n from hr.person p ${employmentAt(on)} ${filter}`);
    const rows = await tx.execute(sql`${directory(on)} ${filter} order by (p.user_id is null and p.status <> 'joining'), p.status = 'joining', p.name limit ${opts.limit ?? 50}`);
    return { total: Number(n), rows: rows.map(row) };
  });

/** One person's page: pay and bank masked per 002, each document masked by its own class. */
/** `ref`: an employee number, or the person's id (059: pins use the id; a number given with it only narrows). */
export const getPersonView = (v: Viewer, ref: string | { personId?: string; employeeNo?: string }, on?: string) =>
  readHr(v, async (tx): Promise<PersonView | null> => {
    const { personId, employeeNo } = typeof ref === "string" ? { personId: undefined, employeeNo: ref } : ref;
    if (!personId && !employeeNo) throw new Error("say which person: a personId or an employeeNo");
    const where = sql.join([personId ? sql`p.id = ${personId}` : undefined, employeeNo ? sql`p.employee_no = ${employeeNo}` : undefined].filter((x) => x !== undefined), sql` and `);
    const [r] = await tx.execute(sql`${directory(on)} where ${where}`);
    if (!r) return null;
    const subject = { ownerUserId: (r.user_id as string | null) ?? null, legalEntityId: r.legal_entity_id as string };
    const docs = await tx.execute(sql`select * from hr.document where person_id = ${r.id} order by dated_on desc nulls last, title`);
    return {
      person: row(r), workEmail: (r.work_email as string | null) ?? null, location: (r.location as string | null) ?? null,
      employment: await getEmployment(tx, r.id as string, v, r.as_of as string),
      documents: docs.map((d) => ({
        id: d.id as string, class: d.class as string, status: d.status as string, datedOn: day(d.dated_on),
        title: d.class === "personal" || canSee(v, d.class as Sensitivity, subject) ? (d.title as string) : { masked: true, class: d.class as Sensitivity },
      })),
    };
  });

/** Legal entities with a URL code: the country code, or the id when two entities share a country. */
export const listEntities = (v: Viewer) =>
  readHr(v, async (tx) => {
    const rows = await tx.execute(sql`select id, country, name from core.legal_entity order by name`);
    const shared = (c: unknown) => rows.filter((r) => r.country === c).length > 1;
    return rows.map((e) => ({ id: e.id as string, country: e.country as string, code: shared(e.country) ? (e.id as string) : (e.country as string).toLowerCase(), name: e.name as string }));
  });
