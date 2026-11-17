import type { Viewer } from "@amax/auth";
import { briefingOf } from "./briefing";
import { awayCard } from "./pulse-away";
import { allocationCards } from "./pulse-allocation";
import { hoursCard } from "./pulse-hours";
import type { Pulse } from "./pulse-types";
import { read, settingsOf } from "./read";
import { getReport, type Report } from "./view";

export type { Pulse, PulseCard } from "./pulse-types";

export async function getDeliveryPulse(v: Viewer, loaded?: Report): Promise<Pulse> {
  const report = loaded ?? (await getReport(v));
  return read(v, async (tx) => {
    const { today } = await settingsOf(tx);
    const everyone = report.group === "everyone";
    const mine = everyone ? null : new Set(report.rows.map((r) => r.personId));
    const [cards, hours, away] = await Promise.all([allocationCards(tx, v, report.month, today, mine), hoursCard(tx, v, report, everyone || !v.managedProjects.length ? null : v.managedProjects), awayCard(tx, v, report, today)]);
    const parts = { monthName: report.monthName, target: report.target, utilisation: report.team.utilisation, ...cards, hours };
    return {
      month: report.month, monthName: report.monthName, target: report.target, utilisation: report.team.utilisation,
      billableHours: report.team.billableHours, availableHours: report.team.availableHours,
      briefing: briefingOf(parts), ...cards, hours, away,
    };
  });
}
