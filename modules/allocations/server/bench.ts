import type { Viewer } from "@amax/auth";
import { listPeople } from "@amax/hr/contracts";
import type { Known } from "./attention";
import type { MonthPoint } from "./forecast";
import { readAlloc } from "./read";

export async function knownBench(viewer: Viewer, months: MonthPoint[]) {
  const ids = [...new Set(months.flatMap((m) => m.bench.map((b) => b.personId)))];
  const people = ids.length ? await readAlloc(viewer, (tx) => listPeople(tx, viewer, { ids })) : [];
  return new Map<string, Known>(people.map((p) => [p.id, { employeeNo: p.employeeNo, name: p.name, initials: p.initials }]));
}

export function benchMonths(months: MonthPoint[], known: Map<string, Known>, wanted: string[], inAll: boolean) {
  const picked = wanted.length ? months.filter((m) => wanted.includes(m.month.slice(0, 7))) : months;
  const byPerson = new Map<string, { skill: string; months: string[] }>();
  for (const m of picked) for (const b of m.bench) byPerson.set(b.personId, { skill: b.skill, months: [...(byPerson.get(b.personId)?.months ?? []), m.month] });
  return [...byPerson].flatMap(([personId, found]) => {
    const who = known.get(personId);
    return who && (!inAll || found.months.length === picked.length) ? [{ ...who, personId, ...found }] : [];
  });
}
