import { attention, type Flag, type Known } from "./attention";
import type { MonthPoint } from "./forecast";
import type { Grid } from "./grid";
import { monthLabel } from "./months";

const months = (list: string[]) => list.map((m) => monthLabel(m, "long")).join(", ");

function gapSentence(points: MonthPoint[]) {
  const gaps = points.map((p) => ({ month: p.month, gap: Math.round(p.demand - p.capacity) }));
  const worst = gaps.reduce((a, b) => (b.gap > a.gap ? b : a), gaps[0]);
  if (worst.gap > 0) return `Demand is ${worst.gap} above capacity in ${monthLabel(worst.month, "long")}.`;
  const spare = gaps.reduce((a, b) => (b.gap < a.gap ? b : a), gaps[0]);
  return `Demand stays within capacity. Most spare: ${-spare.gap} in ${monthLabel(spare.month, "long")}.`;
}

const lineOf = (f: Flag) =>
  f.kind === "over"
    ? `${f.name} is over-allocated in ${months(f.months)} (${f.total}% of ${f.capacity}%).`
    : `${f.name} has nothing planned in ${months(f.months)}.`;

export function summaryOf(grid: Grid, points: MonthPoint[], known: Map<string, Known>) {
  const flags = attention(grid, points, known);
  const lines = flags.map(lineOf);
  const text = [...(lines.length ? lines : ["Nobody is over-allocated, and everyone has work planned."]), gapSentence(points)].join(" ");
  return {
    over: flags.filter((f) => f.kind === "over").map((f) => ({ name: f.name, months: f.months, total: f.total, capacity: f.capacity })),
    unplanned: flags.filter((f) => f.kind === "free").map((f) => ({ name: f.name, months: f.months })),
    text,
  };
}
