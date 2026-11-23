import { listAllocations } from "@amax/allocations/contracts";
import { listProjectRefs } from "@amax/delivery/contracts";
import { hasModule } from "@amax/core/server";
import type { Viewer } from "@amax/auth";
import type { PersonUtilisation } from "../contracts";
import { PRESETS } from "./export-compose";
import type { Plan, ReportKind } from "./export-types";
import { DRIFT_LIMIT } from "./pulse-hours";
import type { Pulse } from "./pulse-types";
import { installed, read } from "./read";
import type { Report, ReportParts } from "./view";

export function needs(kind: ReportKind, sections?: readonly string[]) {
  const keys = sections?.length ? sections : PRESETS[kind];
  return {
    parts: { trend: keys.includes("trend"), heat: false, availability: keys.includes("availability") } satisfies ReportParts,
    pulse: keys.some((k) => ["projects", "allocation", "capacity", "leave"].includes(k)),
    plan: keys.includes("plan"),
  };
}

export const noPulse = (r: Report): Pulse => ({
  month: r.month, monthName: r.monthName, target: r.target, utilisation: r.team.utilisation, billableHours: r.team.billableHours, availableHours: r.team.availableHours, briefing: "",
  capacity: { state: "empty", months: [] }, allocation: { state: "empty", months: [] }, hours: { state: "empty", limit: DRIFT_LIMIT, rows: [] }, away: { state: "empty", rows: [] },
});

export async function planOf(v: Viewer, r: Report, rows: PersonUtilisation[]): Promise<Plan> {
  const label = `${r.monthName} ${r.month.slice(0, 4)}`;
  return read(v, async (tx) => {
    if (!hasModule("allocations", await installed(tx, "allocations.allocation"))) return { label, on: false, lines: [] };
    const [{ rows: found }, refs] = await Promise.all([
      listAllocations(tx, v, { from: `${r.month}-01`, to: `${r.month}-01`, personIds: rows.map((x) => x.personId) }),
      hasModule("delivery", await installed(tx, "delivery.project")) ? listProjectRefs(tx) : Promise.resolve([]),
    ]);
    const lines = found.filter((a) => a.percent > 0).flatMap((a) => {
      const person = rows.find((x) => x.personId === a.personId)?.name;
      return person ? [{ person, project: a.projectId ? (refs.find((p) => p.id === a.projectId)?.name ?? "Another project") : (a.work ?? "Other work"), percent: a.percent }] : [];
    }).sort((x, y) => x.person.localeCompare(y.person) || y.percent - x.percent);
    return { label, on: true, lines };
  });
}
