import { approvedLeave } from "@amax/leave/contracts";
import type { Tx } from "@amax/db";
import type { Viewer } from "@amax/auth";
import { hasModule } from "@amax/core/server";
import { addDays } from "./days";
import { installed } from "./read";
import type { Pulse } from "./pulse-types";
import type { Report } from "./view";

const WINDOW_DAYS = 14;

export async function awayCard(tx: Tx, v: Viewer, report: Report, today: string): Promise<Pulse["away"]> {
  if (!hasModule("leave", await installed(tx, "leave.request"))) return { state: "off", rows: [] };
  const who = new Map(report.rows.map((r) => [r.personId, r]));
  const leave = await approvedLeave(tx, v, { from: today, to: addDays(today, WINDOW_DAYS), personIds: [...who.keys()] });
  const rows = leave.filter((l) => l.startsOn >= today && who.has(l.personId)).sort((a, b) => a.startsOn.localeCompare(b.startsOn))
    .map((l) => ({ name: who.get(l.personId)!.name, initials: who.get(l.personId)!.initials, startsOn: l.startsOn, endsOn: l.endsOn, type: l.type, half: l.halfDay }));
  return { state: rows.length ? "ok" : "empty", rows };
}
