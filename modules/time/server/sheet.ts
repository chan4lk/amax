import { sql } from "drizzle-orm";
import { can, type Viewer } from "@amax/auth";
import { myWeek } from "./my";
import { projectNames, read, round1, weekEntries } from "./read";
import { teamWeek } from "./team";
import { weekKey } from "../week";
import { wantedWeek } from "./weeks";

export type SheetRef = { weekId?: string; week?: string; project?: string };

async function own(v: Viewer, week: string | undefined, project?: string) {
  const m = await myWeek(v, wantedWeek(week));
  const rows = project ? m.rows.filter((r) => r.projectName === project) : m.rows;
  // A row pin whose project is no longer on the week is gone, not "0 h logged".
  if (project && !rows.length) return null;
  const entries = project ? m.entries.filter((e) => e.projectName === project) : m.entries;
  return { week: m.key, dates: m.days, person: "you", status: m.status, rows, entries, total: rows.reduce((n, r) => n + r.total, 0), agentHours: project ? undefined : m.agentHours };
}

export async function getTimesheet(v: Viewer, ref: SheetRef) {
  if (!ref.weekId) return own(v, ref.week, ref.project);
  const [w] = await read(v, (tx) => tx.execute(sql`select user_id, iso_year, iso_week from time.week where id = ${ref.weekId}`));
  if (!w) return null;
  const key = weekKey({ year: Number(w.iso_year), week: Number(w.iso_week) });
  if (w.user_id === v.userId) return own(v, key, ref.project);
  const t = await teamWeek(v, wantedWeek(key));
  const row = t.rows.find((r) => r.weekId === ref.weekId);
  if (!row) return null;
  // Whoever may fix the week's entries (070 AC-14: its approvers, Admins included) sees their ids; others see the totals only.
  const allowed = row.canApprove || can(v, "time:admin");
  if (ref.project) return projectRow(v, row, t.key, t.days, ref.project, allowed);
  const entries = allowed ? await read(v, async (tx) => weekEntries(tx, row.weekId, await projectNames(tx))) : undefined;
  return { week: t.key, dates: t.days, ...row, ...(entries ? { entries } : {}) };
}

// 073: a row pin on a member's week (its project row), resolved to that row; gone if the project left the week.
async function projectRow(v: Viewer, row: { weekId: string; personName: string; status: string }, week: string, dates: string[], project: string, allowed: boolean) {
  const mine = (await read(v, async (tx) => weekEntries(tx, row.weekId, await projectNames(tx)))).filter((e) => e.projectName === project);
  if (!mine.length) return null;
  const days = dates.map((d) => round1(mine.filter((e) => e.day === d).reduce((n, e) => n + e.hours, 0)));
  return { week, dates, person: row.personName, status: row.status, project, days, total: round1(days.reduce((a, b) => a + b, 0)), ...(allowed ? { entries: mine } : {}) };
}
