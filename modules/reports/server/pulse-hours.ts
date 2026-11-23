import { listAllocations } from "@amax/allocations/contracts";
import { listProjectRefs } from "@amax/delivery/contracts";
import { projectHours } from "@amax/time/contracts";
import type { Tx } from "@amax/db";
import type { Viewer } from "@amax/auth";
import { hasModule } from "@amax/core/server";
import { installed } from "./read";
import type { HoursRow, Pulse } from "./pulse-types";
import type { Report } from "./view";

export const DRIFT_LIMIT = 20;

const flagOf = (drift: number | null): HoursRow["flag"] => (drift === null ? null : drift < -DRIFT_LIMIT ? "behind" : drift > DRIFT_LIMIT ? "over" : null);

function plannedBy(allocations: { personId: string; projectId: string | null; percent: number }[], available: Map<string, number>) {
  const planned = new Map<string, number>();
  for (const a of allocations) {
    if (a.projectId) planned.set(a.projectId, (planned.get(a.projectId) ?? 0) + (a.percent / 100) * (available.get(a.personId) ?? 0));
  }
  return planned;
}

export async function hoursCard(tx: Tx, v: Viewer, report: Report, projects: string[] | null): Promise<Pulse["hours"]> {
  const on = hasModule("allocations", await installed(tx, "allocations.allocation")) && hasModule("time", await installed(tx, "time.entry"));
  if (!on) return { state: "off", limit: DRIFT_LIMIT, rows: [] };
  const deliveryOn = hasModule("delivery", await installed(tx, "delivery.project"));
  const [{ rows: allocations }, logged, refs] = await Promise.all([
    listAllocations(tx, v, { from: `${report.month}-01`, to: `${report.month}-01`, personIds: report.rows.map((r) => r.personId) }),
    projectHours(tx, v, report.range),
    deliveryOn ? listProjectRefs(tx) : Promise.resolve([]),
  ]);
  const planned = plannedBy(allocations, new Map(report.rows.filter((r) => !r.noTime).map((r) => [r.personId, r.availableHours ?? 0])));
  const loggedBy = new Map(logged.map((l) => [l.projectId, l.hours]));
  const rows = [...new Set([...planned.keys(), ...loggedBy.keys()])].map((projectId): HoursRow => {
    const plan = Math.round(planned.get(projectId) ?? 0);
    const done = Math.round(loggedBy.get(projectId) ?? 0);
    const drift = plan > 0 ? Math.round(((done - plan) / plan) * 100) : null;
    return { projectId, name: refs.find((r) => r.id === projectId)?.name ?? "Other project", planned: plan, logged: done, drift, flag: flagOf(drift) };
  }).filter((r) => (r.planned > 0 || r.logged > 0) && (!projects || projects.includes(r.projectId))).sort((a, b) => a.name.localeCompare(b.name));
  return { state: rows.length ? "ok" : "empty", limit: DRIFT_LIMIT, rows };
}
