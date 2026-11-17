import type { Known } from "./attention";
import type { MonthPoint } from "./forecast";
import type { Grid, GridPerson } from "./grid";

export type Move = { person: string; employeeNo: string; projectKey: string; project: string; month: string; from: number; to: number };
export type Fix = { found: true; reason: string; moves: Move[] } | { found: false; note: string };
type Skills = Map<string, string>;
type Helper = { name: string; employeeNo: string; skill: string };

const overAt = (p: GridPerson, i: number) => p.capacity[i] > 0 && p.totals[i] > p.capacity[i];
const freeAt = (p: GridPerson, i: number) => p.capacity[i] > 0 && p.totals[i] === 0;
const prefer = <T>(list: T[], same: (x: T) => boolean) => list.find(same) ?? list[0];

function build(grid: Grid, over: GridPerson, i: number, helper: Helper, skills: Skills): Fix {
  const line = over.lines.filter((l) => l.projectKey && !l.manages && (l.percents[i] ?? 0) > 0).at(-1);
  const excess = over.totals[i] - over.capacity[i];
  if (!line) return { found: false, note: `${over.name} is ${excess} points over, but has no project I can reduce.` };
  const base = { project: line.label, projectKey: line.projectKey!, month: grid.months[i].month };
  const from = line.percents[i] ?? 0;
  const same = skills.get(over.personId) === helper.skill ? ` and has the same skill (${helper.skill})` : "";
  return {
    found: true,
    reason: `${helper.name} is free in that month${same}.`,
    moves: [{ ...base, person: over.name, employeeNo: over.employeeNo, from, to: from - excess }, { ...base, person: helper.name, employeeNo: helper.employeeNo, from: 0, to: excess }],
  };
}

export function fixFor(grid: Grid, points: MonthPoint[], known: Map<string, Known>, skills: Skills, name: string): Fix {
  const needle = name.trim().toLowerCase();
  const person = grid.people.find((p) => p.name.toLowerCase().startsWith(needle) || p.employeeNo.toLowerCase() === needle);
  if (!person) return { found: false, note: `Nobody called ${name} in the people you can see.` };
  const over = person.totals.findIndex((_, i) => overAt(person, i));
  if (over >= 0) {
    const bench = (points.find((p) => p.month === grid.months[over].month)?.bench ?? []).flatMap((b) => (known.has(b.personId) ? [{ ...known.get(b.personId)!, skill: b.skill }] : []));
    const helper = prefer(bench, (b) => b.skill === skills.get(person.personId));
    return helper ? build(grid, person, over, helper, skills) : { found: false, note: `${person.name} is over, and nobody on the bench can take it.` };
  }
  const free = person.totals.findIndex((_, i) => freeAt(person, i));
  const skill = skills.get(person.personId) ?? "Other";
  const giver = free >= 0 && prefer(grid.people.filter((p) => overAt(p, free)), (p) => skills.get(p.personId) === skill);
  if (!giver) return { found: false, note: `${person.name} has nothing planned, and nobody has work to hand over.` };
  return build(grid, giver, free, { name: person.name, employeeNo: person.employeeNo, skill }, skills);
}
