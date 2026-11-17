import type { Grid, GridPerson } from "./grid";
import type { MonthPoint } from "./forecast";

export type Known = { employeeNo: string; name: string; initials: string };
export type Flag = Known & { kind: "over" | "free"; personId: string; months: string[]; total: number; capacity: number };
export type Filter = "all" | "over" | "bench";

export const filterOf = (value?: string): Filter => (value === "over" || value === "bench" ? value : "all");

export function overFlags(grid: Grid): Flag[] {
  return grid.people.flatMap((p) => {
    const hits = grid.months.flatMap((_, i) => (p.capacity[i] > 0 && p.totals[i] > p.capacity[i] ? [i] : []));
    if (!hits.length) return [];
    const { employeeNo, name, initials, personId } = p;
    return [{ kind: "over" as const, personId, employeeNo, name, initials, months: hits.map((i) => grid.months[i].month), total: p.totals[hits[0]], capacity: p.capacity[hits[0]] }];
  });
}

export function freeFlags(months: MonthPoint[], known: Map<string, Known>): Flag[] {
  const byPerson = new Map<string, string[]>();
  for (const m of months) for (const b of m.bench) byPerson.set(b.personId, [...(byPerson.get(b.personId) ?? []), m.month]);
  return [...byPerson].flatMap(([personId, list]) => {
    const who = known.get(personId);
    return who ? [{ kind: "free" as const, personId, ...who, months: list, total: 0, capacity: 0 }] : [];
  });
}

const rank = (f: Flag) => (f.kind === "over" ? 0 : 1);

export const withinGrid = (grid: Grid, months: MonthPoint[]) => months.filter((m) => grid.months.some((g) => g.month === m.month));

export const attention = (grid: Grid, months: MonthPoint[], known: Map<string, Known>) =>
  [...overFlags(grid), ...freeFlags(withinGrid(grid, months), known)].sort((a, b) => rank(a) - rank(b) || a.months[0].localeCompare(b.months[0]) || a.name.localeCompare(b.name));

export const hiddenBench = (months: MonthPoint[], known: Map<string, Known>) =>
  new Set(months.flatMap((m) => m.bench.map((b) => b.personId)).filter((id) => !known.has(id))).size;

export const matching = (people: GridPerson[], text?: string) => {
  const needle = (text ?? "").trim().toLowerCase();
  return needle ? people.filter((p) => p.name.toLowerCase().startsWith(needle)) : people;
};

const kindsOf = (flags: Flag[], id: string) => flags.filter((f) => f.personId === id).map((f) => f.kind);

export function shown(people: GridPerson[], flags: Flag[], filter: Filter) {
  const keep = (p: GridPerson) => filter === "all" || kindsOf(flags, p.personId).includes(filter === "over" ? "over" : "free");
  return people.filter(keep).sort((a, b) => a.name.localeCompare(b.name));
}
