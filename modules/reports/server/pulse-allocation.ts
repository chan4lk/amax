import { monthOutlook, windowMonths, type MonthOutlook } from "@amax/allocations/contracts";
import type { Tx } from "@amax/db";
import type { Viewer } from "@amax/auth";
import { hasModule } from "@amax/core/server";
import { monthName } from "./days";
import { installed } from "./read";
import type { AllocationMonth, CapacityMonth, Pulse } from "./pulse-types";

const SPAN = 6;

const skillsOf = (bench: MonthOutlook["bench"]) => {
  const counts = new Map<string, number>();
  for (const b of bench) counts.set(b.skill, (counts.get(b.skill) ?? 0) + 1);
  return [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([skill, n]) => `${skill} ${n}`).join(", ");
};

const capacityOf = (m: MonthOutlook): CapacityMonth => ({
  month: m.month, label: monthName(m.month.slice(0, 7), "short"), capacity: m.capacity, demand: m.demand,
  over: Math.max(0, Math.round((m.demand - m.capacity) * 10) / 10),
});

const allocationOf = (m: MonthOutlook): AllocationMonth => ({
  month: m.month, label: monthName(m.month.slice(0, 7)), over: m.over.map((o) => ({ name: o.name, percent: o.percent })),
  bench: m.bench.length, skills: skillsOf(m.bench),
});

export async function allocationCards(tx: Tx, v: Viewer, month: string, today: string, mine: Set<string> | null): Promise<Pick<Pulse, "capacity" | "allocation">> {
  if (!hasModule("allocations", await installed(tx, "allocations.allocation"))) {
    return { capacity: { state: "off", months: [] }, allocation: { state: "off", months: [] } };
  }
  const now = new Date();
  const months = windowMonths(now, SPAN);
  const outlook = await monthOutlook(tx, v, months, now);
  const capacity = outlook.map(capacityOf);
  const allocation = outlook.map((m) => allocationOf({ ...m, bench: m.demand > 0 ? m.bench : [], over: mine ? m.over.filter((o) => mine.has(o.personId)) : m.over }));
  return {
    capacity: { state: capacity.some((c) => c.capacity > 0) ? "ok" : "empty", months: capacity },
    allocation: { state: allocation.some((a) => a.over.length || a.bench) ? "ok" : "empty", months: allocation },
  };
}
