import { sql, type SQL } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { can, canEver, type Viewer } from "@amax/auth";
import { ValidationError } from "@amax/core/server";
import { dayLabel, parseWeekKey, weekKey } from "../week";
import { chainFor, entityOf } from "./chain";
import { read } from "./read";
import { weekProjectIds } from "./weeks";

// 070 amendment 3: change requests as the owner and their reviewers see them.
export type Values = { hours: number; billable: boolean; note: string | null; projectId: string; projectName: string };
export type RequestStatus = "pending" | "needs_info" | "applied" | "reopened" | "completed" | "declined" | "cancelled";
export type ChangeRequest = {
  id: string; weekId: string; week: string; weekStatus: string; userId: string; personName: string; entryId: string | null; day: string; dayLabel: string;
  /** 073: "add" asks for new hours on a locked week (no entry yet; `before` names the project at 0 h). */
  kind: "correct" | "delete" | "add"; before: Values; proposed: Partial<Values> & { weekend?: boolean; projectKey?: string }; revision: number; reason: string; status: RequestStatus; anonymised?: boolean;
  question: string | null; answer: string | null; decisionNote: string | null; decidedBy: string | null; createdAt: string;
  /** The person who last decided or asked (073: "Maya Fernando asks"), and when. */
  deciderName: string | null; decidedAt: string | null;
};
export const OPEN: RequestStatus[] = ["pending", "needs_info"];

const h = (n: number) => `${Number(n.toFixed(2))} h`;
/** "Hours 7 h → 5 h", or "Remove 3 h": what the request asks for, in the cards' words. */
export function changeText(r: Pick<ChangeRequest, "kind" | "before" | "proposed"> & { anonymised?: boolean }): string[] {
  // Retention emptied what it asked for; never shown as 0 h (070 review round 4).
  if (r.anonymised) return ["Anonymised"];
  if (r.kind === "delete") return [`Remove ${h(r.before.hours)}`];
  if (r.kind === "add") return [`Add ${h(r.proposed.hours ?? 0)}${r.proposed.weekend ? " (weekend)" : ""}`, ...(r.proposed.billable === false ? ["Not billable"] : []), ...(r.proposed.note ? [`Note ${r.proposed.note}`] : [])];
  const p = r.proposed;
  return [
    p.hours !== undefined && p.hours !== r.before.hours && `Hours ${h(r.before.hours)} → ${h(p.hours)}`,
    p.billable !== undefined && p.billable !== r.before.billable && `Billable ${r.before.billable ? "yes" : "no"} → ${p.billable ? "yes" : "no"}`,
    p.note !== undefined && p.note !== r.before.note && `Note ${r.before.note ?? "none"} → ${p.note ?? "none"}`,
    p.projectName !== undefined && p.projectName !== r.before.projectName && `Project ${r.before.projectName} → ${p.projectName}`,
  ].filter((x): x is string => Boolean(x));
}

// Retention anonymises before/proposed to {} (070 review round 1), so a request still reads after erasure.
const values = (j: unknown): Values => {
  const b = (j ?? {}) as Partial<Values>;
  return { hours: Number(b.hours ?? 0), billable: Boolean(b.billable), note: b.note ?? null, projectId: b.projectId ?? "", projectName: b.projectName ?? "Anonymised" };
};

const toRequest = (r: Record<string, unknown>): ChangeRequest => ({
  id: r.id as string, weekId: r.week_id as string, week: weekKey({ year: Number(r.iso_year), week: Number(r.iso_week) }), weekStatus: r.week_status as string,
  userId: r.user_id as string, personName: r.person_name as string, entryId: (r.entry_id as string | null) ?? null, day: r.day as string, dayLabel: dayLabel(r.day as string),
  kind: r.kind as ChangeRequest["kind"], before: values(r.before), proposed: (r.proposed ?? {}) as ChangeRequest["proposed"], anonymised: !(r.before as Partial<Values> | null)?.projectId, revision: Number(r.revision), reason: r.reason as string,
  status: r.status as RequestStatus, question: r.question as string | null, answer: r.answer as string | null, decisionNote: r.decision_note as string | null,
  decidedBy: r.decided_by as string | null, createdAt: new Date(r.created_at as string | Date).toISOString(),
  deciderName: (r.decider_name as string | null) ?? null, decidedAt: r.decided_at ? new Date(r.decided_at as string | Date).toISOString() : null,
});

export async function requestRows(tx: Tx, where: SQL, lock = false, limit?: number): Promise<ChangeRequest[]> {
  // 073: the decider's name, and "add" requests with no entry yet (their own day); 070 review: no tenant-wide cut, paged by the caller.
  const rows = await tx.execute(sql`select c.*, w.iso_year, w.iso_week, w.status as week_status, w.person_name, coalesce(to_char(e.day, 'YYYY-MM-DD'), to_char(c.day, 'YYYY-MM-DD')) as day, u.name as decider_name
    from time.change_request c join time.week w on w.id = c.week_id left join time.entry e on e.id = c.entry_id
    left join auth.user u on u.id::text = split_part(regexp_replace(c.decided_by, '^user:', ''), ' ', 1) where ${where} order by c.created_at desc, c.id desc ${limit ? sql`limit ${limit}` : sql``} ${lock ? sql`for update of c` : sql``}`);
  return rows.map(toRequest);
}

/** Whether the viewer reviews this request: anyone in its week's approval chain, never its owner (070 AC-32). */
export const reviews = async (tx: Tx, v: Viewer, r: Pick<ChangeRequest, "userId" | "weekId">) => chainFor(v, r.userId, await weekProjectIds(tx, r.weekId), await entityOf(tx, r.userId)) !== null;

export type RequestFilter = { id?: string; status?: RequestStatus | RequestStatus[]; week?: string; mine?: boolean; before?: string };

/**
 * Who could review a request, in SQL (070 review rounds 2 and 3): own requests; anyone's for an approver; a direct
 * report's; or a week with hours on a project the viewer approves. chainFor's rules without 071's legal-entity
 * narrowing, so a superset: reviews() (chainFor with the owner's entity) still decides every row.
 */
function scopeSql(v: Viewer): SQL {
  if (can(v, "time:approve")) return sql`true`;
  const projects = [...new Set([...v.managedProjects, ...v.assignedProjects])].filter((projectId) => can(v, "time:approve", { projectId }));
  return sql.join([
    sql`c.user_id = ${v.userId}`,
    canEver(v, "time:approve") && v.reports.length ? sql`c.user_id in (${sql.join(v.reports.map((id) => sql`${id}`), sql`, `)})` : null,
    projects.length ? sql`exists (select 1 from time.entry pe where pe.week_id = c.week_id and pe.deleted_at is null and pe.project_id in (${sql.join(projects.map((id) => sql`${id}`), sql`, `)}))` : null,
  ].filter((x): x is SQL => x !== null), sql` or `);
}

/** Every filter runs in SQL first (070 review round 1). */
function filterSql(v: Viewer, f: RequestFilter): SQL {
  const statuses = f.status === undefined ? null : [f.status].flat();
  const week = f.week === undefined ? null : parseWeekKey(f.week);
  return sql.join([
    sql`(${scopeSql(v)})`,
    f.id ? sql`c.id = ${f.id}` : null,
    statuses ? sql`c.status in (${sql.join(statuses.map((s) => sql`${s}`), sql`, `)})` : null,
    f.week !== undefined ? (week ? sql`w.iso_year = ${week.year} and w.iso_week = ${week.week}` : sql`false`) : null,
    f.mine === true ? sql`c.user_id = ${v.userId}` : f.mine === false ? sql`c.user_id <> ${v.userId}` : null,
    f.before ? sql`(c.created_at, c.id) < (select b.created_at, b.id from time.change_request b where b.id = ${f.before})` : null,
  ].filter((x): x is SQL => x !== null), sql` and `);
}

/** 070 AC-33: the viewer's own requests and those they review; nothing else, whatever the filter. */
export const listRequests = (v: Viewer, f: RequestFilter = {}) => read(v, async (tx) => {
  const out: ChangeRequest[] = [];
  for (const r of await requestRows(tx, filterSql(v, f))) if (r.userId === v.userId || (await reviews(tx, v, r))) out.push(r);
  return out;
});

export const PAGE = 50;
/**
 * get_change_requests: newest first, PAGE at a time. `truncated` says there are older ones, fetched with
 * before = the last one's id (070 review round 2: a list is never silently short, nor unbounded).
 */
export const pageRequests = (v: Viewer, f: RequestFilter = {}) => read(v, async (tx) => {
  // An unknown or unseen cursor is refused, never read as the end of the list (070 review round 3).
  if (f.before && !(await requestRows(tx, sql`c.id = ${f.before} and (${scopeSql(v)})`)).length)
    throw new ValidationError([{ code: "custom", path: ["before"], message: "is not a request in your list; use the before value from the last result", input: f.before }]);
  const rows = await requestRows(tx, filterSql(v, f), false, PAGE + 1);
  const requests: ChangeRequest[] = [];
  for (const r of rows.slice(0, PAGE)) if (r.userId === v.userId || (await reviews(tx, v, r))) requests.push(r);
  const truncated = rows.length > PAGE;
  return { requests, truncated, ...(truncated ? { before: rows[PAGE - 1].id } : {}) };
});

export const openToReview = (v: Viewer) => listRequests(v, { mine: false, status: OPEN });
export const openOfMine = (v: Viewer, week: string) => listRequests(v, { mine: true, week, status: OPEN });
/**
 * What My timesheet shows the owner as cards: open requests only (077 amendment 1). Decided ones go straight to the
 * week's folded History and the Requests page; the owner hears the outcome in their bell.
 */
export const shownToOwner = (v: Viewer, week: string) => listRequests(v, { mine: true, week, status: OPEN });

// 077: the Requests page and each week's history. Both read through listRequests, so the scope is get_change_requests':
// the viewer's own requests and those in their approval chain, nothing else.
const isOpen = (r: ChangeRequest) => OPEN.includes(r.status);
export const STATUS_FILTER: Record<string, RequestStatus[]> = {
  open: OPEN, applied: ["applied", "completed"], reopened: ["reopened"], declined: ["declined"], withdrawn: ["cancelled"],
};
export type RequestsQuery = { lens?: string; status?: string; week?: string; person?: string };

export async function requestsPage(v: Viewer, q: RequestsQuery) {
  const [mine, review] = await Promise.all([listRequests(v, { mine: true }), listRequests(v, { mine: false })]);
  // Where there's something to do, else where there's anything at all: open reviews, then your own, then any reviews.
  const lens: "mine" | "review" = q.lens === "mine" || q.lens === "review" ? q.lens : review.some(isOpen) || (!mine.length && review.length) ? "review" : "mine";
  const all = lens === "mine" ? mine : review;
  const want = q.status ? STATUS_FILTER[q.status] : undefined;
  const rows = all.filter((r) => (!want || want.includes(r.status)) && (!q.week || r.week === q.week) && (!q.person || r.userId === q.person));
  return {
    lens, reviews: review.length > 0, total: all.length,
    counts: { mine: mine.filter(isOpen).length, review: review.filter(isOpen).length },
    weeks: [...new Set(all.map((r) => r.week))].sort().reverse(),
    // 077 amendment 2: whose requests, for the To review lens (a member's timesheet links here filtered to them).
    people: [...new Map(all.map((r) => [r.userId, r.personName])).entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    open: rows.filter(isOpen), decided: rows.filter((r) => !isOpen(r)),
  };
}

/** A week's decided requests, newest first: the owner's own, or (with `person`) those of that person the viewer reviews. */
export const weekHistory = async (v: Viewer, week: string, person?: string) =>
  (await listRequests(v, { mine: !person, week })).filter((r) => !isOpen(r) && (!person || r.userId === person));
