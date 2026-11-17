import type { Group } from "../server/roster";
import type { ViewData } from "./data";

export const GROUPS = ["mine", "everyone"] as const;
export const LINE: Record<Group, { c: string; d: string; fill: string }> = { mine: { c: "#7B61FF", d: "#5B44D6", fill: "r-fam" }, everyone: { c: "#3FB8E0", d: "#0B7C99", fill: "r-fae" } };
export const X = (i: number) => 70 + i * 67.27;
export const B0 = 336;
const T0 = 30;

type Seg = { i: number; v: number }[];
export const segmentsOf = (a: (number | null)[]) => a.reduce<Seg[]>((out, v, i) => {
  if (v === null) return out;
  if (i > 0 && a[i - 1] !== null && out.length) out[out.length - 1].push({ i, v });
  else out.push([{ i, v }]);
  return out;
}, []);

export const pctText = (v: number | null) => (v === null ? "no figure" : `${v}%`);

export function scaleOf(d: ViewData) {
  const all = GROUPS.flatMap((g) => d.sides[g].trend).filter((v): v is number => v !== null);
  const lo = Math.min(50, Math.floor(Math.min(...all, d.target) / 10) * 10), hi = Math.max(100, Math.ceil(Math.max(...all, d.target) / 10) * 10);
  return { Y: (v: number) => T0 + ((hi - v) / (hi - lo)) * (B0 - T0), ticks: Array.from({ length: (hi - lo) / 10 + 1 }, (_, k) => lo + k * 10) };
}

export function tinsOf(d: ViewData, group: Group) {
  const known = d.sides[group].trend.map((v, i) => ({ v, i })).filter((x): x is { v: number; i: number } => x.v !== null);
  const best = known.reduce((m, x) => (x.v > m.v ? x : m), known[0] ?? { v: 0, i: 0 });
  const low = known.reduce((m, x) => (x.v < m.v ? x : m), known[0] ?? { v: 0, i: 0 });
  const since = known.length > 1 ? known[known.length - 1].v - known[0].v : 0;
  return [
    { b: `${known.filter((x) => x.v >= d.target).length} of ${known.length}`, s: "months at or above target" },
    { b: known.length ? `${d.months[best.i]} · ${best.v}%` : "–", s: "best month" },
    { b: known.length ? `${d.months[low.i]} · ${low.v}%` : "–", s: "lowest month" },
    { b: `${since >= 0 ? "+" : "−"}${Math.abs(since)} pts`, s: `since ${known.length ? d.months[known[0].i] : d.months[0]}` },
  ];
}
