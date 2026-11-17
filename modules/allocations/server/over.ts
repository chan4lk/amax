import type { Grid } from "./grid";

export type Over =
  | { found: true; personId: string; person: string; employeeNo: string; month: string; total: number; capacity: number; projectKey: string; project: string; percent: number; others: number; trimTo: number; projects: { project: string; percent: number }[] }
  | { found: false; note: string };

export function overLine(grid: Grid, name: string, may: (projectId: string) => boolean): Over {
  const needle = name.trim().toLowerCase();
  const p = grid.people.find((x) => x.name.toLowerCase().startsWith(needle) || x.employeeNo.toLowerCase() === needle);
  if (!p) return { found: false, note: `Nobody called ${name} in the people you can see.` };
  const isOver = (k: number) => p.capacity[k] > 0 && p.totals[k] > p.capacity[k];
  const ahead = p.totals.findIndex((_, k) => k > 0 && isOver(k));
  const i = ahead >= 0 ? ahead : isOver(0) ? 0 : -1;
  if (i < 0) return { found: false, note: `${p.name} isn't over-allocated in the months I can see.` };
  const pct = (l: { percents: (number | null)[] }) => l.percents[i] ?? 0;
  const line = p.lines.filter((l) => l.projectId && l.projectKey && pct(l) > 0 && may(l.projectId)).sort((a, b) => pct(b) - pct(a))[0];
  if (!line) return { found: false, note: `${p.name} is over-allocated, but none of their projects are ones you can change.` };
  const excess = p.totals[i] - p.capacity[i];
  return { found: true, personId: p.personId, person: p.name, employeeNo: p.employeeNo, month: grid.months[i].month.slice(0, 7), total: p.totals[i], capacity: p.capacity[i], projectKey: line.projectKey!, project: line.label, percent: pct(line), others: p.totals[i] - pct(line), trimTo: Math.max(0, pct(line) - excess), projects: p.lines.filter((l) => pct(l) > 0).map((l) => ({ project: l.label, percent: pct(l) })) };
}

export const allOver = (grid: Grid, may: (projectId: string) => boolean) =>
  grid.people.flatMap((p) => { const o = overLine(grid, p.employeeNo, may); return o.found ? [o] : []; });
