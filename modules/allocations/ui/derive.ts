import type { Forecast } from "../server/forecast";
import type { Grid, GridPerson } from "../server/grid";
import { monthLabel } from "../server/months";
import { firstName, round1 } from "./look";

export type Conflict = { person: GridPerson; month: string; index: number; total: number; capacity: number };

export const conflictsOf = (grid: Grid): Conflict[] =>
  grid.people
    .flatMap((person) => grid.months.flatMap((m, index) => (person.capacity[index] > 0 && person.totals[index] > person.capacity[index] ? [{ person, month: m.month, index, total: person.totals[index], capacity: person.capacity[index] }] : [])))
    .sort((a, b) => b.total - a.total || a.index - b.index);

export const rollingOffOf = (grid: Grid) =>
  grid.people.flatMap((person) => {
    const from = person.totals.findIndex((t, k) => k > 0 && person.totals.slice(k).every((x) => x === 0));
    return person.totals[0] > 0 && from > 0 ? [{ person, month: grid.months[from].month }] : [];
  });

export function runwayFacts(f: Forecast) {
  const first = f.months[0];
  const gap = round1(first.capacity - first.demand);
  const peak = f.months.reduce((best, m) => (m.demand > best.demand ? m : best), first);
  const steps = f.months.slice(1).flatMap((m, i) => (m.demand > 0 && f.months[i].demand > 0 ? [{ month: m.month, change: round1(m.demand - f.months[i].demand) }] : []));
  const big = steps.reduce((best, s) => (Math.abs(s.change) > Math.abs(best.change) ? s : best), { month: first.month, change: 0 });
  return [
    { text: `${Math.abs(gap)} ${gap >= 0 ? "spare" : "short"} in ${monthLabel(first.month)}`, tone: gap >= 0 ? "ok" : "bad" },
    { text: `Peak ${peak.demand} in ${monthLabel(peak.month)}`, tone: "agent" },
    ...(Math.abs(big.change) >= 3 ? [{ text: `${big.change > 0 ? "+" : "−"}${Math.abs(big.change)} FTE demand in ${monthLabel(big.month)}`, tone: "warn" }] : []),
  ];
}

export type Seg = { text: string; bold?: boolean };

const joinAnd = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

function nameSegs(people: GridPerson[]): Seg[] {
  const shown = people.slice(0, 3);
  const firsts = shown.map((p) => firstName(p.name));
  const labels = shown.map((p, k) => (firsts.filter((f) => f === firsts[k]).length > 1 ? p.name : firsts[k]));
  const more = people.length - shown.length;
  const out: Seg[] = [];
  labels.forEach((label, k) => {
    out.push({ text: label, bold: true });
    if (k < labels.length - 1) out.push({ text: k === labels.length - 2 && more === 0 ? " and " : ", " });
  });
  if (more) out.push({ text: ` and ${more} ${more === 1 ? "other" : "others"}` });
  return out;
}

export function ledeParts(grid: Grid): Seg[] {
  const over = grid.people.map((p) => ({ p, months: grid.months.filter((_, i) => p.capacity[i] > 0 && p.totals[i] > p.capacity[i]).map((m) => monthLabel(m.month, "long")) })).filter((o) => o.months.length);
  const idle = rollingOffOf(grid);
  const out: Seg[] = [];
  if (over.length <= 3) over.forEach(({ p, months }) => out.push({ text: firstName(p.name), bold: true }, { text: ` is over-allocated in ${joinAnd(months)}. ` }));
  else out.push(...nameSegs(over.map((o) => o.p)), { text: " are over-allocated. " });
  const groups = [...new Set(idle.map((r) => r.month))].map((month) => ({ month, people: idle.filter((r) => r.month === month).map((r) => r.person) })).sort((a, b) => b.people.length - a.people.length || a.month.localeCompare(b.month)).slice(0, 3);
  groups.forEach((g, k) => {
    out.push(...nameSegs(g.people));
    out.push({ text: `${k === 0 ? ` ${g.people.length === 1 ? "has" : "have"} no work planned` : ""} from ${monthLabel(g.month, "long")}${k === groups.length - 1 ? ". " : ", "}` });
  });
  return out;
}
