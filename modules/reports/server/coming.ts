import { shortDay } from "./days";
import type { Pulse, PulseCard } from "./pulse-types";

export type Coming = { when: string; sort: string; text: string; tone: "bad" | "warn" | "plain"; card: PulseCard; key?: string };

export function comingOf(p: Pulse): Coming[] {
  const away = p.away.rows.map((r): Coming => ({
    when: r.startsOn === r.endsOn ? shortDay(r.startsOn) : `${shortDay(r.startsOn)} – ${shortDay(r.endsOn)}`, sort: r.startsOn,
    text: `${r.name} is away (${r.type}${r.half ? `, half day ${r.half}` : ""})`, tone: "plain", card: "away", key: `${r.name}:${r.startsOn}`,
  }));
  const over = p.allocation.months.flatMap((m) => m.over.map((o): Coming => ({ when: m.label, sort: m.month, text: `${o.name} is planned at ${o.percent}%`, tone: "bad", card: "allocation", key: m.month })));
  const bench = p.allocation.months.filter((m) => m.bench > 0).map((m): Coming => ({ when: m.label, sort: m.month, text: `${m.bench} on the bench (${m.skills})`, tone: "warn", card: "allocation", key: m.month }));
  const gap = p.capacity.months.filter((m) => m.over > 0).map((m): Coming => ({ when: m.label, sort: m.month, text: `Demand is ${m.over} FTE over capacity`, tone: "bad", card: "capacity", key: m.month }));
  return [...away, ...over, ...bench, ...gap].sort((a, b) => a.sort.localeCompare(b.sort));
}
