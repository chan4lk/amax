import { sql, type SQL } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { Viewer } from "@amax/auth";
import { dayLabel, weekKey } from "../week";
import { chainFor } from "./chain";
import { read } from "./read";
import { weekProjectIds } from "./weeks";

// 070 amendment 3: change requests as the owner and their reviewers see them.
export type Values = { hours: number; billable: boolean; note: string | null; projectId: string; projectName: string };
export type RequestStatus = "pending" | "needs_info" | "applied" | "reopened" | "completed" | "declined" | "cancelled";
export type ChangeRequest = {
  id: string; weekId: string; week: string; weekStatus: string; userId: string; personName: string; entryId: string; day: string; dayLabel: string;
  kind: "correct" | "delete"; before: Values; proposed: Partial<Values>; revision: number; reason: string; status: RequestStatus;
  question: string | null; answer: string | null; decisionNote: string | null; decidedBy: string | null; createdAt: string;
};
export const OPEN: RequestStatus[] = ["pending", "needs_info"];

const h = (n: number) => `${Number(n.toFixed(2))} h`;
/** "Hours 7 h → 5 h", or "Remove 3 h": what the request asks for, in the cards' words. */
export function changeText(r: Pick<ChangeRequest, "kind" | "before" | "proposed">): string[] {
  if (r.kind === "delete") return [`Remove ${h(r.before.hours)}`];
  const p = r.proposed;
  return [
    p.hours !== undefined && p.hours !== r.before.hours && `Hours ${h(r.before.hours)} → ${h(p.hours)}`,
    p.billable !== undefined && p.billable !== r.before.billable && `Billable ${r.before.billable ? "yes" : "no"} → ${p.billable ? "yes" : "no"}`,
    p.note !== undefined && p.note !== r.before.note && `Note ${r.before.note ?? "none"} → ${p.note ?? "none"}`,
    p.projectName !== undefined && p.projectName !== r.before.projectName && `Project ${r.before.projectName} → ${p.projectName}`,
  ].filter((x): x is string => Boolean(x));
}

const toRequest = (r: Record<string, unknown>): ChangeRequest => ({
  id: r.id as string, weekId: r.week_id as string, week: weekKey({ year: Number(r.iso_year), week: Number(r.iso_week) }), weekStatus: r.week_status as string,
  userId: r.user_id as string, personName: r.person_name as string, entryId: r.entry_id as string, day: r.day as string, dayLabel: dayLabel(r.day as string),
  kind: r.kind as ChangeRequest["kind"], before: r.before as Values, proposed: r.proposed as Partial<Values>, revision: Number(r.revision), reason: r.reason as string,
  status: r.status as RequestStatus, question: r.question as string | null, answer: r.answer as string | null, decisionNote: r.decision_note as string | null,
  decidedBy: r.decided_by as string | null, createdAt: new Date(r.created_at as string | Date).toISOString(),
});

export async function requestRows(tx: Tx, where: SQL, lock = false): Promise<ChangeRequest[]> {
  const rows = await tx.execute(sql`select c.*, w.iso_year, w.iso_week, w.status as week_status, w.person_name, to_char(e.day, 'YYYY-MM-DD') as day
    from time.change_request c join time.week w on w.id = c.week_id join time.entry e on e.id = c.entry_id where ${where} order by c.created_at desc limit 200 ${lock ? sql`for update of c` : sql``}`);
  return rows.map(toRequest);
}

/** Whether the viewer reviews this request: anyone in its week's approval chain, never its owner (070 AC-32). */
export const reviews = async (tx: Tx, v: Viewer, r: Pick<ChangeRequest, "userId" | "weekId">) => chainFor(v, r.userId, await weekProjectIds(tx, r.weekId)) !== null;

export type RequestFilter = { id?: string; status?: RequestStatus; week?: string; mine?: boolean };

/** 070 AC-33: the viewer's own requests and those they review; nothing else, whatever the filter. */
export const listRequests = (v: Viewer, f: RequestFilter = {}) => read(v, async (tx) => {
  const rows = await requestRows(tx, sql`true ${f.id ? sql`and c.id = ${f.id}` : sql``} ${f.status ? sql`and c.status = ${f.status}` : sql``}`);
  const out: ChangeRequest[] = [];
  for (const r of rows) if ((!f.week || r.week === f.week) && (r.userId === v.userId ? f.mine !== false : !f.mine && (await reviews(tx, v, r)))) out.push(r);
  return out;
});

export const openToReview = async (v: Viewer) => (await listRequests(v, { mine: false })).filter((r) => OPEN.includes(r.status));
export const openOfMine = async (v: Viewer, week: string) => (await listRequests(v, { mine: true, week })).filter((r) => OPEN.includes(r.status));
