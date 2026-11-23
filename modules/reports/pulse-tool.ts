import { z } from "zod";
import type { Viewer } from "@amax/auth";
import { getDeliveryPulse } from "./server/pulse";
import { getReport } from "./server/view";
import type { Pulse } from "./server/pulse-types";

const CARDS = ["briefing", "utilisation", "capacity", "allocation", "hours", "away"] as const;

export const pulseInput = z.object({
  card: z.enum(CARDS).optional().describe("One card only; the whole pulse when left out"),
  group: z.enum(["mine", "everyone"]).optional().describe("mine = the people on the projects you manage, everyone = everyone you may see; an Admin gets everyone and anyone else gets mine when left out"),
  key: z.string().optional().describe("A month (allocation), a project id (hours) or 'name:date' (away) to narrow the card to one row"),
});

export const pulseDescription = "The delivery pulse for this month: a plain briefing, utilisation against the target, capacity vs demand for the next six months, who is over-allocated and the bench for the same six, hours logged against the allocation plan per project (red beyond 20%), and who is away in the next 14 days. Only people you may see are counted. card narrows it to one card; key to one row.";

const slice = (p: Pulse, card: (typeof CARDS)[number]) => {
  if (card === "briefing") return { briefing: p.briefing };
  if (card === "utilisation") return { monthName: p.monthName, utilisation: p.utilisation, target: p.target, billableHours: p.billableHours, availableHours: p.availableHours };
  return p[card];
};

const narrow = (data: unknown, key?: string) => {
  const rows = (data as { months?: { month: string }[]; rows?: { projectId?: string; name?: string; startsOn?: string }[] }) ?? {};
  if (!key) return data;
  const hit = rows.months?.find((m) => m.month === key) ?? rows.rows?.find((r) => r.projectId === key || `${r.name}:${r.startsOn}` === key);
  return hit ?? data;
};

export async function pulseTool(v: Viewer, a: z.infer<typeof pulseInput>) {
  const pulse = await getDeliveryPulse(v, await getReport(v, undefined, a.group));
  return a.card ? narrow(slice(pulse, a.card), a.key) : pulse;
}
