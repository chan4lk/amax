import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { can, ScopeError, viewerOf } from "@amax/auth";
import { defineService, isSystemContext, type ServiceContext } from "@amax/core/server";
import { getProjectRef } from "@amax/delivery/contracts";
import { EVENTS, monthOf, type AllocationSet, type MonthCopied } from "../contracts";
import { teamMembers } from "./forecast";
import { lockStanding, setStanding, skipMonths } from "./standing";
import { STANDING_WITH_END, standingWithEnd } from "./rules";
import { ambiguous, resolvePerson } from "./person";

const month = z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/, "a month, e.g. 2026-11").transform(monthOf);
const by = (ctx: ServiceContext) => (ctx.onBehalfOf ? `${ctx.actor.id} for ${ctx.onBehalfOf}` : ctx.actor.id);
const nextMonth = (m: string) => { const d = new Date(`${m}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 10); };
const monthsBetween = (from: string, to: string) => { const out = [from]; while (out[out.length - 1] < to) out.push(nextMonth(out[out.length - 1])); return out; };

/** Allocating on a project needs the grant for that project (PMs: the projects they manage); other work needs an unscoped grant. */
/** Fails closed: without a viewer only a context core issued for a job (contextFor.job) may allocate. */
const mayAllocate = (ctx: ServiceContext, projectId: string | null) => {
  const v = viewerOf(ctx);
  return v ? can(v, "allocations:allocate", projectId ? { projectId } : {}) : isSystemContext(ctx);
};
/** Longest range one allocate call may write. */
export const MAX_MONTHS = 24;
const span = (from: string, to: string) => (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7)) + 1;

async function personOf(tx: Tx, ctx: ServiceContext, who: string) {
  const r = await resolvePerson(tx, ctx, who);
  if (r.kind === "found") return r.person;
  throw new Error(r.kind === "ambiguous" ? ambiguous(who) : `no person ${who}`);
}

export const allocate = defineService({
  scoped: true,
  name: "allocations.allocation.set",
  action: "allocations:allocate",
  resource: "allocations.allocation",
  input: z.object({ person: z.string().min(2), projectKey: z.string().optional(), work: z.string().min(2).optional(), month, through: month.optional(), percent: z.number().int().min(0).max(200), standing: z.boolean().optional() })
    .refine((i) => Boolean(i.projectKey) !== Boolean(i.work), "name a project key or other work, not both")
    .refine((i) => !i.standing || Boolean(i.projectKey), { message: "until further notice needs a project", path: ["standing"] })
    .refine((i) => !standingWithEnd(i), { message: STANDING_WITH_END, path: ["through"] })
    .refine((i) => !i.through || i.through >= i.month, { message: "through can't be before month", path: ["through"] })
    .refine((i) => !i.through || span(i.month, i.through) <= MAX_MONTHS, { message: `at most ${MAX_MONTHS} months at a time`, path: ["through"] }),
  run: (tx, input, ctx) => setAllocation(tx, input, ctx),
});

type AllocateInput = { person: string; projectKey?: string; work?: string; month: string; through?: string; percent: number; standing?: boolean };

/** The allocate write inside the caller's transaction: the service, and an accepted agent suggestion (006). */
export async function setAllocation(tx: Tx, input: AllocateInput, ctx: ServiceContext) {
  const person = await personOf(tx, ctx, input.person);
  const project = input.projectKey ? await getProjectRef(tx, input.projectKey) : null;
  if (input.projectKey && !project) throw new Error(`no project ${input.projectKey}`);
  if (!mayAllocate(ctx, project?.id ?? null)) throw new ScopeError("allocations:allocate");
  if (input.standing && project) {
    const { months, removed, standing } = await setStanding(tx, { personId: person.id, projectId: project.id, month: input.month, percent: input.percent, by: by(ctx), tenantId: ctx.tenantId });
    const payload: AllocationSet = { personId: person.id, projectId: project.id, work: null, months, percent: input.percent, by: by(ctx), standing: true };
    return { result: { person: person.name, months, percent: input.percent, standing: true }, resourceId: person.id, before: { rows: removed, standing }, after: { from: input.month, percent: input.percent, project: input.projectKey, standing: true }, events: [{ name: EVENTS.allocationSet, payload }] };
  }
  const months = monthsBetween(input.month, input.through ?? input.month);
  if (project) await lockStanding(tx, person.id, project.id);
  const slot = project ? sql`project_id = ${project.id}` : sql`work = ${input.work}`;
  const before = (await tx.execute(sql`select month::text as month, percent from allocations.allocation where person_id = ${person.id} and ${slot} and month between ${months[0]}::date and ${months[months.length - 1]}::date order by month`));
  await tx.execute(sql`delete from allocations.allocation where person_id = ${person.id} and ${slot} and month between ${months[0]}::date and ${months[months.length - 1]}::date`);
  if (input.percent > 0) for (const m of months) {
    await tx.execute(sql`insert into allocations.allocation (tenant_id, person_id, project_id, work, month, percent, updated_by) values (${ctx.tenantId}, ${person.id}, ${project?.id ?? null}, ${project ? null : input.work}, ${m}, ${input.percent}, ${by(ctx)})`);
  }
  else if (project) await skipMonths(tx, person.id, project.id, months);
  const payload: AllocationSet = { personId: person.id, projectId: project?.id ?? null, work: project ? null : input.work!, months, percent: input.percent, by: by(ctx) };
  return { result: { person: person.name, months, percent: input.percent, standing: false }, resourceId: person.id, before: { rows: before }, after: { months, percent: input.percent, project: input.projectKey ?? input.work }, events: [{ name: EVENTS.allocationSet, payload }] };
}

/** Copy to next month: each person/project row of `from` the viewer may allocate is copied into the month after, unless that slot is already planned. */
export const copyMonth = defineService({
  name: "allocations.month.copy",
  action: "allocations:copy",
  resource: "allocations.allocation",
  input: z.object({ team: z.string().default("Delivery team"), from: month }),
  async run(tx, input, ctx) {
    // Without a viewer there's nothing to judge each row by: refuse rather than report every row as skipped.
    if (!viewerOf(ctx) && !isSystemContext(ctx)) throw new ScopeError("allocations:copy");
    const to = nextMonth(input.from);
    const members = (await teamMembers(tx, input.team)).map((m) => m.personId);
    const all = await tx.execute(sql`select a.*, exists (select 1 from allocations.allocation b where b.person_id = a.person_id and b.month = ${to}::date
        and coalesce(b.project_id::text, 'work:' || b.work) = coalesce(a.project_id::text, 'work:' || a.work)) as planned
      from allocations.allocation a where month = ${input.from}::date and person_id::text in (${sql.join([...members, "none"].map((i) => sql`${i}`), sql`, `)})`);
    // Two different reasons a row isn't copied, counted apart: already planned next month (skipped), or
    // on a project the caller may not allocate (forbidden).
    const rows = all.filter((r) => !r.planned);
    const allowed = rows.filter((r) => mayAllocate(ctx, (r.project_id as string | null) ?? null));
    const skipped = all.length - rows.length, forbidden = rows.length - allowed.length;
    for (const r of allowed) {
      await tx.execute(sql`insert into allocations.allocation (tenant_id, person_id, project_id, work, month, percent, updated_by) values (${ctx.tenantId}, ${r.person_id}, ${r.project_id}, ${r.work}, ${to}, ${r.percent}, ${by(ctx)})`);
    }
    const payload: MonthCopied = { team: input.team, from: input.from, to, rows: allowed.length, by: by(ctx) };
    return { result: { from: input.from, to, copied: allowed.length, skipped, forbidden }, resourceId: null, after: { ...payload, skipped, forbidden }, events: [{ name: EVENTS.monthCopied, payload }] };
  },
});
