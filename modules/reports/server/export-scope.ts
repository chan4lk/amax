import { listAllocations } from "@amax/allocations/contracts";
import { listProjectRefs } from "@amax/delivery/contracts";
import { listPeople } from "@amax/hr/contracts";
import type { Viewer } from "@amax/auth";
import type { PersonUtilisation, TeamUtilisation } from "../contracts";
import { briefingOf } from "./briefing";
import { ExportRefused } from "./export-types";
import type { Pulse } from "./pulse-types";
import { read } from "./read";

export const teamOf = (rows: PersonUtilisation[], base: TeamUtilisation): TeamUtilisation => {
  const counted = rows.filter((r) => r.availableHours !== null && !r.hoursIncomplete && !r.noTime);
  const sum = (f: (r: PersonUtilisation) => number) => Math.round(counted.reduce((n, r) => n + f(r), 0) * 100) / 100;
  const availableHours = sum((r) => r.availableHours ?? 0), billableHours = sum((r) => r.billableHours);
  return { ...base, people: counted.length, leftOut: rows.length - counted.length, availableHours, billableHours, loggedHours: sum((r) => r.loggedHours),
    utilisation: availableHours > 0 ? Math.round((billableHours / availableHours) * 100) : null };
};

export function narrow(p: Pulse, rows: PersonUtilisation[], team: TeamUtilisation, projectId: string | null): Pulse {
  const names = new Set(rows.map((r) => r.name));
  const allocation = { ...p.allocation, months: p.allocation.months.map((m) => ({ ...m, over: m.over.filter((o) => names.has(o.name)), bench: 0, skills: "" })) };
  const hours = { ...p.hours, rows: projectId ? p.hours.rows.filter((r) => r.projectId === projectId) : p.hours.rows };
  const away = { ...p.away, rows: p.away.rows.filter((r) => names.has(r.name)) };
  const narrowed = { ...p, utilisation: team.utilisation, billableHours: team.billableHours, availableHours: team.availableHours, allocation, hours, away };
  return { ...narrowed, briefing: briefingOf(narrowed) };
}

export async function projectOf(v: Viewer, month: string, wanted: string) {
  return read(v, async (tx) => {
    const ref = (await listProjectRefs(tx)).find((x) => [x.id, x.key.toLowerCase(), x.name.toLowerCase()].includes(wanted.toLowerCase()));
    if (!ref) throw new ExportRefused(`There's no project called "${wanted}".`);
    const { rows } = await listAllocations(tx, v, { from: `${month}-01`, to: `${month}-01`, projectIds: [ref.id] });
    return { ref, people: new Set(rows.map((a) => a.personId)) };
  });
}

export async function peopleNamed(v: Viewer, names: string[]) {
  const everyone = await read(v, (tx) => listPeople(tx, v));
  return names.map((name) => {
    const want = name.toLowerCase();
    const hit = everyone.filter((p) => p.id === name || p.userId === name || p.name.toLowerCase() === want || p.name.toLowerCase().startsWith(`${want} `));
    return { name, id: hit.length === 1 ? hit[0].id : null };
  });
}

export const joined = (who: string[]) => (who.length <= 3 ? `${who.slice(0, -1).join(", ")}${who.length > 1 ? " and " : ""}${who[who.length - 1]}` : `${who.length} people`);
