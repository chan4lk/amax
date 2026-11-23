import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { assertCan, ScopeError, viewerOf, type ResourceAttrs } from "@amax/auth";
import { isSystemContext, type ServiceContext } from "@amax/core/server";

import { employmentAt, subjectOf } from "./inforce";

export { subjectOf };
export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date, e.g. 2026-11-02");

/**
 * HR writes are scoped like reads (subjectOf: legal entity, department, owner): an HR role limited to
 * Australia can't change Sri Lankan records. Fails closed: without a viewer to check, only a context
 * core issued for a job (contextFor.job) may write.
 */
export function inScope(ctx: ServiceContext, action: string, subject: ResourceAttrs) {
  const v = viewerOf(ctx);
  if (v) assertCan(v, action, subject);
  else if (!isSystemContext(ctx)) throw new ScopeError(action);
}

/**
 * The write scope of a dated change to one person: every employment period it touches (the one in force
 * on `on` and every later one) and any department it moves them into must be in scope.
 */
export async function inScopeFrom(tx: Tx, ctx: ServiceContext, action: string, p: Record<string, unknown>, on: string, into: (string | null | undefined)[] = []) {
  const touched = await tx.execute(sql`select distinct department from hr.employment where person_id = ${p.id} and (ends_on is null or ends_on >= ${on}::date)`);
  const departments = new Set<string | null>([...touched.map((r) => r.department as string), ...into.filter((d): d is string => !!d)]);
  if (!departments.size) departments.add((p.department as string | null) ?? null);
  for (const department of departments) inScope(ctx, action, { ...subjectOf(p), department });
}

/** The person, locked, with the department in force today (for the write scope). */
export async function personByNo(tx: Tx, employeeNo: string) {
  const [p] = await tx.execute(sql`select p.*, emp.department from hr.person p ${employmentAt()} where p.employee_no = ${employeeNo} for update of p`);
  if (!p) throw new Error(`no person ${employeeNo}`);
  return p;
}
