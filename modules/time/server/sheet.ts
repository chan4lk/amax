import { sql } from "drizzle-orm";
import { can, type Viewer } from "@amax/auth";
import { myWeek } from "./my";
import { notStartedIn } from "./not-started";
import { projectNames, read, round1, weekEntries } from "./read";
import { teamWeek } from "./team";
import { weekKey } from "../week";
import { wantedWeek } from "./weeks";

export type SheetRef = { weekId?: string; week?: string; userId?: string; project?: string; projectId?: string };

// 073: a Not started person's week on Team time (no timesheet yet): who, which week, nothing logged. Only for someone the
// viewer expects to log, as Team time shows them; anyone else is "no such timesheet".
async function notStartedWeek(v: Viewer, week: string, userId: string) {
  const [p] = await read(v, (tx) => notStartedIn(tx, v, week, [userId]));
  return p?.ok ? { week, person: p.name, personName: p.name, userId, status: "not_started", total: 0 } : null;
}

// One project row, named by id (what a pin passes; 073 review rounds 1 and 2) or by name (what chat passes).
type Pick = { projectId?: string; project?: string };
const picks = (p: Pick, id: string, name: string) => (p.projectId ? id === p.projectId : name === p.project);
const picking = (p: Pick) => Boolean(p.projectId || p.project);

async function own(v: Viewer, week: string | undefined, p: Pick = {}) {
  const m = await myWeek(v, wantedWeek(week));
  const rows = picking(p) ? m.rows.filter((r) => picks(p, r.projectId, r.projectName)) : m.rows;
  // A row pin whose project is no longer on the week is gone, not "0 h logged".
  if (picking(p) && !rows.length) return null;
  const entries = picking(p) ? m.entries.filter((e) => picks(p, e.projectId, e.projectName)) : m.entries;
  return { week: m.key, dates: m.days, person: "you", status: m.status, rows, entries, total: rows.reduce((n, r) => n + r.total, 0), agentHours: picking(p) ? undefined : m.agentHours };
}

export async function getTimesheet(v: Viewer, ref: SheetRef) {
  // 073 review round 2: a pin's projectId is matched as an id end to end, never turned back into a name, so a renamed,
  // closed or same-named project resolves to exactly its own row.
  const p: Pick = { projectId: ref.projectId, project: ref.project };
  if (!ref.weekId && ref.userId && ref.userId !== v.userId) return ref.week ? notStartedWeek(v, ref.week, ref.userId) : null;
  if (!ref.weekId) return own(v, ref.week, p);
  const [w] = await read(v, (tx) => tx.execute(sql`select user_id, iso_year, iso_week from time.week where id = ${ref.weekId}`));
  if (!w) return null;
  const key = weekKey({ year: Number(w.iso_year), week: Number(w.iso_week) });
  if (w.user_id === v.userId) return own(v, key, p);
  const t = await teamWeek(v, wantedWeek(key));
  const row = t.rows.find((r) => r.weekId === ref.weekId);
  if (!row) return null;
  // Whoever may fix the week's entries (070 AC-14: its approvers, Admins included) sees their ids; others see the totals only.
  const allowed = row.canApprove || can(v, "time:admin");
  if (picking(p)) return projectRow(v, row, t.key, t.days, p, allowed);
  const entries = allowed ? await read(v, async (tx) => weekEntries(tx, row.weekId, await projectNames(tx))) : undefined;
  return { week: t.key, dates: t.days, ...row, ...(entries ? { entries } : {}) };
}

// 073: a row pin on a member's week (its project row), resolved to that row; gone if the project left the week.
async function projectRow(v: Viewer, row: { weekId: string; personName: string; status: string }, week: string, dates: string[], p: Pick, allowed: boolean) {
  const mine = (await read(v, async (tx) => weekEntries(tx, row.weekId, await projectNames(tx)))).filter((e) => picks(p, e.projectId, e.projectName));
  if (!mine.length) return null;
  const project = mine[0].projectName;
  const days = dates.map((d) => round1(mine.filter((e) => e.day === d).reduce((n, e) => n + e.hours, 0)));
  return { week, dates, person: row.personName, status: row.status, project, days, total: round1(days.reduce((a, b) => a + b, 0)), ...(allowed ? { entries: mine } : {}) };
}
