import type { Viewer } from "@amax/auth";
import type { WeekStatus } from "../contracts";
import { isWeekend, type IsoWeek } from "../week";
import { gridContext } from "./grid-context";
import { entriesOf, notStarted } from "./grid-rows";
import { projectNames, read, round1 } from "./read";
import { lastReminders, teamWeek, type TeamRow, type TeamWeek } from "./team";

export type CellState = "missing" | "low" | "on_target" | "over" | "not_yet" | "leave" | "weekend";
export type Cell = { day: string; hours: number; state: CellState; projects: { id: string; name: string; hours: number }[] };
export type GridStatus = WeekStatus | "not_started";
export type GridRow = Omit<TeamRow, "weekId" | "status" | "days"> & { weekId: string | null; status: GridStatus; cells: Cell[]; target: number; utilisation: number; overtime: boolean; department: string | null };
export type GridQuery = { project?: string; team?: string; status?: string; sort?: string; dir?: string };
export type TeamGrid = TeamWeek & { grid: GridRow[]; footer: number[]; summary: { hours: number; utilisation: number | null; missingPeople: number; awaiting: number };
  /** 075: people with no timesheet this week, whatever the filters (the status band counts them). */
  notStarted: number; options: { projects: string[]; teams: string[] | null }; query: GridQuery };

/** 073 AC-13 (D8): a day's state against the person's daily target (weekly ÷ 5): 6 h and 9 h at 40 h. */
export function stateOf(day: string, hours: number, daily: number, today: string, onLeave: boolean): CellState {
  if (isWeekend(day)) return "weekend";
  if (onLeave) return "leave";
  if (hours === 0) return day < today ? "missing" : "not_yet";
  if (hours < daily * 0.75) return "low";
  return hours <= daily * 1.125 ? "on_target" : "over";
}

const NOT_SUBMITTED = new Set(["draft", "not_started"]);
const keep = (q: GridQuery) => (r: GridRow) => (!q.team || r.department === q.team)
  && (!q.status || (q.status === "not_submitted" ? NOT_SUBMITTED.has(r.status) : r.status === q.status));
const SORTS: Record<string, (r: GridRow) => number | string> = { name: (r) => r.personName, total: (r) => r.total, utilisation: (r) => r.utilisation };

/**
 * 073 amendment 1: Team time's grid for a week, from one teamWeek read plus a few batched ones: each person's cells
 * with their state and project breakdown, utilisation against their target, "Not started" rows for expected people
 * (D9), filters (a project filter recalculates every figure from that project's hours), sort, footer and summary.
 */
export async function teamGrid(v: Viewer, wanted: IsoWeek | undefined, q: GridQuery): Promise<TeamGrid> {
  const team = await teamWeek(v, wanted);
  return read(v, async (tx) => {
    const names = await projectNames(tx);
    const projectId = q.project ? [...names].find(([, n]) => n === q.project)?.[0] ?? "none" : null;
    const entries = await entriesOf(tx, team, projectId);
    const extra = await notStarted(tx, v, team);
    // 073: a Not started row shows its last reminder too (a day reminder reaches people with no timesheet).
    const reminded = await lastReminders(tx, extra.map((p) => p.userId));
    const ctx = await gridContext(tx, v, [...team.rows.map((r) => r.userId), ...extra.map((p) => p.userId)], team.days);
    const build = (base: Omit<GridRow, "cells" | "total" | "target" | "utilisation" | "overtime" | "department">, mine: Map<string, Map<string, number>>): GridRow => {
      const target = ctx.targets.get(base.userId) ?? 40;
      const cells = team.days.map((day) => {
        const byProject = [...(mine.get(day) ?? new Map<string, number>())].map(([id, hours]) => ({ id, name: names.get(id) ?? "Closed project", hours: round1(hours) }));
        const hours = round1(byProject.reduce((n, p) => n + p.hours, 0));
        return { day, hours, state: stateOf(day, hours, target / 5, ctx.today.get(base.userId) ?? "9999-12-31", ctx.onLeave(base.userId, day)), projects: byProject };
      });
      const exact = [...mine.values()].reduce((n, m) => n + [...m.values()].reduce((a, b) => a + b, 0), 0);
      const utilisation = Math.round(((base.status === "rejected" ? 0 : exact) / target) * 100);
      return { ...base, cells, total: round1(exact), target, utilisation, overtime: utilisation > 100, department: ctx.departments.get(base.userId) ?? null };
    };
    let grid = [
      ...team.rows.map((r) => build({ ...r }, entries.get(r.weekId) ?? new Map())),
      ...(projectId ? [] : extra.map((p) => build({ weekId: null, userId: p.userId, personName: p.name, note: null, status: "not_started", rejectComment: null, agentHours: 0, canApprove: false, lastReminder: reminded.get(p.userId) ?? null, anomalies: [] }, new Map()))),
    ];
    if (projectId) grid = grid.filter((r) => r.total > 0);
    grid = grid.filter(keep(q));
    const by = SORTS[q.sort ?? "name"] ?? SORTS.name;
    const sign = q.dir === "desc" ? -1 : 1;
    grid.sort((a, b) => { const x = by(a), y = by(b); return (x < y ? -1 : x > y ? 1 : a.personName.localeCompare(b.personName)) * sign; });
    const footer = team.days.map((_, i) => round1(grid.reduce((n, r) => n + r.cells[i].hours, 0)));
    const summary = { hours: round1(grid.reduce((n, r) => n + r.total, 0)), utilisation: grid.length ? Math.round(grid.reduce((n, r) => n + r.utilisation, 0) / grid.length) : null,
      missingPeople: grid.filter((r) => r.cells.some((c) => c.state === "missing")).length, awaiting: grid.filter((r) => r.status === "submitted" && r.canApprove).length };
    return { ...team, grid, footer, summary, notStarted: extra.length, options: { projects: team.projects.map((p) => p.name), teams: ctx.teams }, query: q };
  });
}
