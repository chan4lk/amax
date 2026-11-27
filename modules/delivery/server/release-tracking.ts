import { sql, type SQL } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { entityZone } from "@amax/workflows";
import { clockOf } from "./queries";
import { invalid } from "./refusal";
import type { Emitted } from "@amax/core/server";
import { EVENTS, releaseHref, type ReleaseStatusChanged } from "../contracts";
import { categoryLabel, completionOf, dayLabel, releaseDay, releaseStatus, statusLabel, type Category, type ReleaseStatus } from "./release-status";

type Row = Record<string, unknown>;
type Source = "create" | "update" | "deployment" | "void" | "schedule" | "environment";
export type Dates = { category: Category; startDate: string; targetDate: string };

export const zoneOf = (tx: Tx, project: Row) => entityZone(tx, (project.legal_entity_id as string | null) ?? null);

export const statusAt = (zone: string, now: Date, d: Pick<Dates, "startDate" | "targetDate">) =>
  releaseStatus({ today: releaseDay(zone, now), start: d.startDate, target: d.targetDate, completed: false });
export const statusFor = async (tx: Tx, project: Row, d: Pick<Dates, "startDate" | "targetDate">) => statusAt(await zoneOf(tx, project), await clockOf(tx), d);

export const categoryEnv = async (tx: Tx, projectId: unknown, category: Category) =>
  (await tx.execute(category === "prod" ? sql`select * from delivery.environment where project_id = ${projectId} and is_prod`
    : sql`select * from delivery.environment where project_id = ${projectId} and lower(name) = ${category}`))[0];

export const datesProblem = (start: string, target: string) => (target < start ? `The target date (${target}) is before the start date (${start})` : null);
export const categoryProblem = async (tx: Tx, project: Row, category: Category) =>
  ((await categoryEnv(tx, project.id, category)) ? null : `${project.key as string} has no ${categoryLabel(category)} environment; add one, or pick another category`);

export async function checkDates(tx: Tx, project: Row, d: Dates) {
  const problem = datesProblem(d.startDate, d.targetDate) ?? (await categoryProblem(tx, project, d.category));
  if (problem) throw invalid(problem);
}

export async function tracked(tx: Tx, releaseId: unknown) {
  const [r] = await tx.execute(sql`select id, tenant_id, version, name, category, status, completing_deployment_id,
    start_date::text as start_date, target_date::text as target_date from delivery.release where id = ${releaseId} for update`);
  return r;
}

export const missingForTracking = (r: Row, a: { category?: string; startDate?: string; targetDate?: string }) =>
  r.category || !(a.category || a.startDate || a.targetDate) ? null : ((["category", "startDate", "targetDate"] as const).find((f) => !a[f]) ?? null);

/** The refusal for a partial first tracking, one wording for the edit card and update_release. */
export const notTrackedYet = (projectKey: string, version: string) => `${projectKey} ${version} isn't tracked yet: give its category, start and target together`;

export function notCompleted(r: Row, projectKey: string) {
  if (r.status === "completed") throw invalid(`${projectKey} ${r.version as string} is completed; it can't change`);
}

export async function writeStatus(tx: Tx, r: Row, to: ReleaseStatus, source: Source, by: string, deploymentId: string | null = null, also: SQL = sql``): Promise<Emitted | null> {
  await tx.execute(sql`update delivery.release set status = ${to}, updated_at = now() ${also} where id = ${r.id}`);
  if (r.status === to) return null;
  await tx.execute(sql`insert into delivery.release_status_history (tenant_id, release_id, from_status, to_status, source, deployment_id, changed_by)
    values (${r.tenant_id}, ${r.id}, ${(r.status as string | null) ?? null}, ${to}, ${source}, ${deploymentId}, ${by})`);
  return statusChanged(tx, r.id, (r.status as string | null) ?? null, to, source);
}

async function statusChanged(tx: Tx, releaseId: unknown, from: string | null, to: ReleaseStatus, source: Source): Promise<Emitted> {
  const [x] = await tx.execute(sql`select r.id, r.version, r.name, r.category, r.target_date::text as target_date, p.id as project_id, p.key, p.manager_user_id
    from delivery.release r join delivery.project p on p.id = r.project_id where r.id = ${releaseId}`);
  const payload: ReleaseStatusChanged = { releaseId: x.id as string, projectId: x.project_id as string, projectKey: x.key as string, managerUserId: (x.manager_user_id as string | null) ?? null, version: x.version as string,
    name: (x.name as string | null) ?? (x.version as string), category: x.category as string, categoryLabel: categoryLabel(x.category as string)!, targetDate: x.target_date as string, targetDay: dayLabel(x.target_date as string)!,
    from, to, toLabel: statusLabel(to), source, href: releaseHref({ projectKey: x.key as string, version: x.version as string }) };
  return { name: EVENTS.releaseStatusChanged, payload };
}

export async function completeBy(tx: Tx, project: Row, r: Row, d: Row, source: Source, by: string, also: SQL = sql``) {
  const zone = await zoneOf(tx, project);
  const day = releaseDay(zone, d.at as string);
  const completion = completionOf(day, r.target_date as string);
  return writeStatus(tx, r, "completed", source, by, d.id as string,
    sql`, completed_at = ${d.at}, completed_zone = ${zone}, completed_day = ${day}, completion = ${completion}, completing_deployment_id = ${d.id} ${also}`);
}

/** The first live `deployed` record the release has in its category's environment: when it got there, if it already has. */
export async function reachedAlready(tx: Tx, projectId: unknown, releaseId: unknown, category: Category) {
  const env = await categoryEnv(tx, projectId, category);
  return env ? (await tx.execute(sql`select id, at, status, environment_id from delivery.deployment where release_id = ${releaseId} and environment_id = ${env.id}
    and status = 'deployed' and voided_at is null order by at limit 1`))[0] : undefined;
}

/**
 * After an environment change gives a category a new environment (made Prod, renamed Dev or UAT), each open release
 * that already has a live deployment there completes on it, as `update_release` does. Under the project lock; each row
 * is read again under its own lock, so one a deployment completed meanwhile stays as it is (Completed is final).
 */
export async function completeReached(tx: Tx, project: Row, by: string) {
  const open = await tx.execute(sql`select id from delivery.release where project_id = ${project.id} and category is not null and status <> 'completed' order by id`);
  const events: Emitted[] = [];
  const completed: { version: string; deploymentId: string }[] = [];
  for (const { id } of open) {
    const r = await tracked(tx, id);
    if (r.status === "completed") continue;
    const reached = await reachedAlready(tx, project.id, r.id, r.category as Category);
    if (!reached) continue;
    const done = await completeBy(tx, project, r, reached, "environment", by);
    if (done) events.push(done);
    completed.push({ version: r.version as string, deploymentId: reached.id as string });
  }
  return { events, completed };
}

const serves = (e: Row) => [...(["dev", "uat"] as const).filter((c) => String(e.name).toLowerCase() === c), ...(e.is_prod ? ["prod" as const] : [])];

/**
 * An environment change (rename, unmark Prod, remove) that would leave open releases of a category with no environment
 * to complete on is refused, naming them: they could never complete and would go Off track.
 */
export async function strandsReleases(tx: Tx, projectId: unknown, before: Row, after: Row | null) {
  const lost = serves(before).filter((c) => !(after ? serves(after) : []).includes(c));
  for (const category of lost) {
    const open = await tx.execute(sql`select version from delivery.release where project_id = ${projectId} and category = ${category} and status <> 'completed' order by version`);
    if (open.length) return `${open.map((r) => r.version as string).join(", ")} ${open.length === 1 ? "is an open" : "are open"} ${categoryLabel(category)} release${open.length === 1 ? "" : "s"} that complete${open.length === 1 ? "s" : ""} on ${before.name as string}; complete or change ${open.length === 1 ? "it" : "them"} first`;
  }
  return null;
}

export async function completeOnDeployment(tx: Tx, project: Row, releaseId: unknown, d: Row, by: string): Promise<Emitted | null> {
  const r = await tracked(tx, releaseId);
  if (!r.category || r.status === "completed" || d.status !== "deployed") return null;
  const env = await categoryEnv(tx, project.id, r.category as Category);
  return env && env.id === d.environment_id ? completeBy(tx, project, r, d, "deployment", by) : null;
}
