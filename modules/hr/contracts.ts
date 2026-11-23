// The only import surface for other modules (docs/module-standard.md). Reads run in the caller's
// tenant transaction and take a Reader: a viewer sees only the legal entities their hr:read reaches,
// with pay and bank masked per 002; trusted system code (a ServiceContext core issued with
// contextFor.job, checked by isSystemContext, not by its fields) sees everything, and its pay reads are audited. Every read takes an as-of date
// (default: each person's own today, in their entity's time zone, 110) so one screen or job reads one day. For an entity
// with no time zone a read falls back to UTC's today and never refuses: HR's writes refuse it, and People names it.
import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { can, mask, ScopeError, type Masked, type Viewer } from "@amax/auth";
import { appendAudit, isSystemContext, type ServiceContext } from "@amax/core/server";
import { asOf, employmentAt, inForceOrder, subjectOf } from "./server/inforce";

/** Who reads: a signed-in viewer, or a ServiceContext (a system job, or a call acting for a viewer). */
export type Reader = Viewer | ServiceContext;
type Resolved = { kind: "viewer"; viewer: Viewer } | { kind: "system"; ctx: ServiceContext };

/** @internal A ServiceContext reads as its viewer; without one only a context core issued with contextFor.job may read. Fails closed. */
export function readerOf(r: Reader): Resolved {
  if (!("actor" in r)) return { kind: "viewer", viewer: r };
  if (r.viewer) return { kind: "viewer", viewer: r.viewer as Viewer };
  if (isSystemContext(r)) return { kind: "system", ctx: r };
  throw new ScopeError("hr:read");
}

/** System code sees everyone; a viewer sees the entities and departments their hr:read reaches, and always themself. */
const sees = (r: Resolved, row: Record<string, unknown>) =>
  r.kind === "system" || (!!row.user_id && row.user_id === r.viewer.userId) || can(r.viewer, "hr:read", subjectOf(row));

export const PERSON_STATUSES = ["joining", "active", "left"] as const;
export type PersonStatus = (typeof PERSON_STATUSES)[number];
export const CONTRACTS = ["permanent", "fixed-term", "contractor", "intern"] as const;
export type ContractType = (typeof CONTRACTS)[number];

export type PersonRef = {
  id: string; userId: string | null; employeeNo: string; name: string; initials: string; title: string;
  legalEntityId: string; department: string | null; managerPersonId: string | null; managerUserId: string | null; managerName: string | null;
  status: PersonStatus; joinedOn: string | null; leftOn: string | null;
};

/** Filters for listPeople. Omitted fields don't narrow; `status` defaults to everyone. `on` is the as-of date for department and manager. */
export type PeopleScope = { on?: string; status?: PersonStatus[]; legalEntityId?: string; department?: string; managerPersonId?: string; ids?: string[] };

/** One employment period: a change of department, grade, manager, contract or FTE starts a new one. */
export type EmploymentPeriod = { personId: string; legalEntityId: string; department: string; fte: number; contract: ContractType; startsOn: string; endsOn: string | null };

export type Employment = EmploymentPeriod & {
  /** End of the contract: the last period's end. `endsOn` is only this period's end (a later change starts a new period). */
  contractEndsOn: string | null;
  id: string; grade: string | null; managerPersonId: string | null; nextReview: string | null; currency: string;
  baseSalary: string | null | Masked; epfNumber: string | null | Masked; bankName: string | null | Masked; bankAccount: string | null | Masked;
};

/** 002 classes of the classified employment fields. Documents carry their own class per row. */
export const EMPLOYMENT_SENSITIVE = { baseSalary: "pay", epfNumber: "pay", bankName: "bank", bankAccount: "bank" } as const;

export const EVENTS = { personJoined: "hr.person.joined", personLeft: "hr.person.left", personChanged: "hr.person.changed" } as const;
export type PersonJoined = { personId: string; userId: string | null; legalEntityId: string; department: string; joinedOn: string; status: PersonStatus };
export type PersonLeft = { personId: string; userId: string | null; leftOn: string };
/** Names of the fields that changed, never their values (pay stays out of the outbox). */
export type PersonChanged = { personId: string; userId: string | null; changed: string[]; effectiveOn: string };

const day = (v: unknown) => (v === null || v === undefined ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

const people = (at?: string) => sql`select p.*, emp.department, emp.manager_person_id, mgr.user_id as manager_user_id, mgr.name as manager_name from hr.person p ${employmentAt(at)}`;

/** @internal Row mapper shared with this module's own queries; not part of the v1 contract. */
export const toPersonRef = (r: Record<string, unknown>): PersonRef => ({
  id: r.id as string, userId: (r.user_id as string | null) ?? null, employeeNo: r.employee_no as string, name: r.name as string, initials: r.initials as string,
  title: r.title as string, legalEntityId: r.legal_entity_id as string, department: (r.department as string | null) ?? null,
  managerPersonId: (r.manager_person_id as string | null) ?? null, managerUserId: (r.manager_user_id as string | null) ?? null, managerName: (r.manager_name as string | null) ?? null,
  status: r.status as PersonStatus, joinedOn: day(r.joined_on), leftOn: day(r.left_on),
});

/** One person by employee number or id, or null when there's none the reader may see. */
export async function getPerson(tx: Tx, reader: Reader, idOrEmployeeNo: string, on?: string): Promise<PersonRef | null> {
  const [r] = await tx.execute(sql`${people(on)} where p.employee_no = ${idOrEmployeeNo} or p.id::text = ${idOrEmployeeNo}`);
  return r && sees(readerOf(reader), r) ? toPersonRef(r) : null;
}

/** People matching the scope, limited to the legal entities the reader may see. */
export async function listPeople(tx: Tx, reader: Reader, scope: PeopleScope = {}): Promise<PersonRef[]> {
  const who = readerOf(reader);
  const where = [
    scope.status?.length ? sql`p.status in (${sql.join(scope.status.map((s) => sql`${s}`), sql`, `)})` : undefined,
    scope.legalEntityId ? sql`p.legal_entity_id = ${scope.legalEntityId}` : undefined,
    scope.department ? sql`emp.department = ${scope.department}` : undefined,
    scope.managerPersonId ? sql`emp.manager_person_id = ${scope.managerPersonId}` : undefined,
    scope.ids ? (scope.ids.length ? sql`p.id::text in (${sql.join(scope.ids.map((i) => sql`${i}`), sql`, `)})` : sql`false`) : undefined,
  ].filter((w): w is ReturnType<typeof sql> => Boolean(w));
  const filter = where.length ? sql`where ${sql.join(where, sql` and `)}` : sql``;
  return (await tx.execute(sql`${people(scope.on)} ${filter} order by p.name`)).filter((r) => sees(who, r)).map(toPersonRef);
}

const toPeriod = (r: Record<string, unknown>): EmploymentPeriod => ({
  personId: r.person_id as string, legalEntityId: r.legal_entity_id as string, department: r.department as string, fte: Number(r.fte),
  contract: r.contract as ContractType, startsOn: day(r.starts_on)!, endsOn: day(r.ends_on),
});

/** Every employment period of these people (all people when omitted) the reader may see, oldest first. No pay fields. */
export async function listEmploymentPeriods(tx: Tx, reader: Reader, personIds?: string[]): Promise<EmploymentPeriod[]> {
  const who = readerOf(reader);
  const filter = personIds ? (personIds.length ? sql`where e.person_id::text in (${sql.join(personIds.map((i) => sql`${i}`), sql`, `)})` : sql`where false`) : sql``;
  return (await tx.execute(sql`select e.*, p.user_id from hr.employment e join hr.person p on p.id = e.person_id ${filter} order by e.person_id, e.starts_on`)).filter((r) => sees(who, r)).map(toPeriod);
}

/**
 * The employment in force on `on` (default: the person's own today). A viewer gets pay and bank masked per 002 (null when
 * the person is outside their entities and isn't them); a system reader gets them unmasked, and that read is audited.
 */
export async function getEmployment(tx: Tx, personId: string, reader: Reader, on?: string): Promise<Employment | null> {
  const who = readerOf(reader);
  const [r] = await tx.execute(sql`select e.*, p.user_id, to_char(${asOf(on)}, 'YYYY-MM-DD') as as_of,
      (select x.ends_on from hr.employment x where x.person_id = e.person_id order by x.starts_on desc limit 1) as contract_ends_on
    from hr.employment e join hr.person p on p.id = e.person_id where e.person_id::text = ${personId} ${inForceOrder(on)}`);
  if (!r || !sees(who, r)) return null;
  const full: Employment = {
    ...toPeriod(r), contractEndsOn: day(r.contract_ends_on), id: r.id as string, grade: (r.grade as string | null) ?? null, managerPersonId: (r.manager_person_id as string | null) ?? null,
    nextReview: day(r.next_review), currency: r.currency as string, baseSalary: r.base_salary === null ? null : String(r.base_salary),
    epfNumber: (r.epf_number as string | null) ?? null, bankName: (r.bank_name as string | null) ?? null, bankAccount: (r.bank_account as string | null) ?? null,
  };
  if (who.kind === "system") {
    await appendAudit(tx, who.ctx, { action: "hr.employment.read", resource: "hr.employment", resourceId: full.id, before: null, after: { personId, on: r.as_of as string, fields: Object.keys(EMPLOYMENT_SENSITIVE) } });
    return full;
  }
  return mask(who.viewer, full, EMPLOYMENT_SENSITIVE, subjectOf(r)) as Employment;
}

/**
 * The Person page's sections other modules serve under /hr/p/<employeeNo>/<path> (066). The page
 * links each one whose module's schema is installed, so a switched-off module leaves no dead tab.
 */
export const PERSON_SECTIONS = [{ path: "career", label: "Career", schema: "career" }] as const;

/** The hr.person ids a signed-in person is known by, for access and erasure requests (032). */
export async function personIdsForUser(tx: Tx, userId: string): Promise<string[]> {
  return (await tx.execute(sql`select id::text as id from hr.person where user_id = ${userId}`)).map((r) => r.id as string);
}

/** Auth users who report to this user (feeds the viewer's `reports` scope for manager-visible fields). */
export async function reportUserIds(tx: Tx, userId: string, on?: string): Promise<string[]> {
  return (await tx.execute(sql`select p.user_id from hr.person p ${employmentAt(on)} where mgr.user_id = ${userId} and p.user_id is not null and p.status <> 'left'`)).map((r) => r.user_id as string);
}
