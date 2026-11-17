import type { Tx } from "@amax/db";
import { can, type Viewer } from "@amax/auth";
import { listProjectRefs } from "@amax/delivery/contracts";
import { listEmploymentPeriods, listPeople } from "@amax/hr/contracts";
import { contextFor } from "@amax/core/server";
import { listAllocations } from "../contracts";
import { fteIn, isForecast, windowMonths } from "./months";
import { readAlloc } from "./read";

export type GridLine = { projectId: string | null; projectKey: string | null; label: string; manages: boolean; editable: boolean; percents: (number | null)[] };
export type GridPerson = { personId: string; employeeNo: string; name: string; initials: string; title: string; lines: GridLine[]; totals: number[]; capacity: number[] };
/** `hidden`: people in this view the viewer's hr access doesn't reach; their rows are left out, and the screen says so. */
export type Grid = { months: { month: string; forecast: boolean }[]; people: GridPerson[]; scope: "managed" | "none" | "everyone"; hidden: number };

async function peopleIn(tx: Tx, v: Viewer, months: string[], everyone: boolean) {
  // Whose rows belong in the view is decided on every allocation; gridIn then shows only the people the viewer may see.
  const { rows: all } = await listAllocations(tx, contextFor.job(v.tenantId, "allocations.grid"), { from: months[0], to: months[months.length - 1] });
  const managed = all.filter((a) => a.projectId && v.managedProjects.includes(a.projectId));
  const scope: Grid["scope"] = everyone ? "everyone" : managed.length ? "managed" : "none";
  const pick = scope === "everyone" ? all : scope === "managed" ? managed : [];
  const ids = [...new Set(pick.map((a) => a.personId))];
  return { scope, ids, rows: all.filter((a) => ids.includes(a.personId)) };
}

export async function gridIn(tx: Tx, v: Viewer, months: string[], today: Date, everyone = false): Promise<Grid> {
  const { scope, ids, rows } = await peopleIn(tx, v, months, everyone);
  const [people, inHr, periods, projects] = await Promise.all([listPeople(tx, v, { ids }), listPeople(tx, contextFor.job(v.tenantId, "allocations.grid"), { ids }), listEmploymentPeriods(tx, v, ids), listProjectRefs(tx)]);
  return {
    scope, hidden: inHr.length - people.length, months: months.map((month) => ({ month, forecast: isForecast(month, today) })),
    people: people.map((p): GridPerson => {
      const mine = rows.filter((a) => a.personId === p.id);
      const keys = [...new Set(mine.map((a) => a.projectId ?? `work:${a.work}`))];
      const lines = keys.map((key): GridLine => {
        const project = projects.find((x) => x.id === key);
        return {
          projectId: project?.id ?? null, projectKey: project?.key ?? null, label: project?.name ?? key.replace(/^work:/, ""), manages: !!project && !!p.userId && project.managerUserId === p.userId, editable: can(v, "allocations:allocate", project ? { projectId: project.id } : {}),
          percents: months.map((m) => mine.find((a) => (a.projectId ?? `work:${a.work}`) === key && a.month === m)?.percent ?? null),
        };
      }).sort((a, b) => a.label.localeCompare(b.label));
      return {
        personId: p.id, employeeNo: p.employeeNo, name: p.name, initials: p.initials, title: p.title, lines,
        totals: months.map((_, i) => lines.reduce((n, l) => n + (l.percents[i] ?? 0), 0)),
        capacity: months.map((m) => Math.round(fteIn(periods.filter((x) => x.personId === p.id), m) * 100)),
      };
    }),
  };
}

export const gridFor = (v: Viewer, opts: { today?: Date; months?: number; everyone?: boolean } = {}) => {
  const today = opts.today ?? new Date();
  return readAlloc(v, (tx) => gridIn(tx, v, windowMonths(today, opts.months ?? 6), today, opts.everyone));
};

/** The lede: who is over their capacity first, and who has nothing planned from some month on. */
export function headlines(grid: Grid) {
  const over = grid.people.flatMap((p) => { const i = p.totals.findIndex((t, k) => t > p.capacity[k]); return i >= 0 ? [{ name: p.name, month: grid.months[i].month }] : []; });
  const idle = grid.people.flatMap((p) => {
    const from = p.totals.findIndex((t, k) => k > 0 && p.totals.slice(k).every((x) => x === 0));
    return p.totals[0] > 0 && from > 0 ? [{ name: p.name, month: grid.months[from].month }] : [];
  });
  return { over, idle };
}
