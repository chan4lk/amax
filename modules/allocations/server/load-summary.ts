import type { MonthPoint } from "./forecast";
import type { Grid } from "./grid";
import { monthWords } from "./load";

const r1 = (n: number) => Math.round(n * 10) / 10;
const fte = (n: number) => `${r1(n).toFixed(1)}`;

export type MonthLoad = {
  month: string;
  forecast: boolean;
  people: number;
  capacityFte: number;
  plannedFte: number;
  spareFte: number;
  loadPercent: number;
  over: { name: string; total: number; capacity: number }[];
  free: { name: string; freePercent: number }[];
  notPlanned: string[];
  sentence: string;
  team: { capacityFte: number; demandFte: number; spareFte: number } | null;
};

export function loadSummary(grid: Grid, team: MonthPoint[], scope: string): MonthLoad[] {
  return grid.months.map(({ month, forecast }, i) => {
    const cap = grid.people.reduce((n, p) => n + p.capacity[i] / 100, 0);
    const planned = grid.people.reduce((n, p) => n + p.totals[i] / 100, 0);
    const spare = r1(cap - planned);
    const over = grid.people.filter((p) => p.totals[i] > p.capacity[i]).map((p) => ({ name: p.name, total: p.totals[i], capacity: p.capacity[i] }));
    const free = grid.people.filter((p) => p.capacity[i] > 0 && p.totals[i] > 0 && p.totals[i] < p.capacity[i]).map((p) => ({ name: p.name, freePercent: p.capacity[i] - p.totals[i] }));
    const notPlanned = grid.people.filter((p) => p.capacity[i] > 0 && p.totals[i] === 0).map((p) => p.name);
    const t = team.find((x) => x.month === month);
    const gap = spare >= 0 ? `${fte(spare)} FTE spare` : `${fte(-spare)} FTE short`;
    const flags = [over.length ? `${over.length} over 100%` : "", notPlanned.length ? `${notPlanned.length} not planned` : ""].filter(Boolean).join(", ");
    return {
      month, forecast, people: grid.people.length, capacityFte: r1(cap), plannedFte: r1(planned), spareFte: spare,
      loadPercent: cap ? Math.round((planned / cap) * 100) : 0, over, free, notPlanned,
      sentence: `${monthWords(month)}, ${scope}: ${fte(planned)} FTE planned of ${fte(cap)} FTE capacity, ${gap}${flags ? ` (${flags})` : ""}.`,
      team: t ? { capacityFte: t.capacity, demandFte: t.demand, spareFte: r1(t.capacity - t.demand) } : null,
    };
  });
}
