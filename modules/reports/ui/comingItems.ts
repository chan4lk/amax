import { pulsePin } from "../pins";
import { shortDay } from "../server/days";
import type { Pulse } from "../server/pulse-types";
import type { ComingItem } from "./data";
import { avatar } from "./parts";

const DAY = 86_400_000;
const soonOf = (from: string, today: string) => {
  const n = Math.round((Date.parse(from) - Date.parse(today)) / DAY);
  return n <= 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`;
};

export function comingOf(p: Pulse, today: string): ComingItem[] {
  const away = p.away.rows.map((x): ComingItem => ({
    id: `away:${x.name}:${x.startsOn}`, sort: x.startsOn, cls: "away", name: x.name, av: avatar(x.name), mark: x.initials,
    when: x.startsOn === x.endsOn ? shortDay(x.startsOn) : `${shortDay(x.startsOn)} – ${shortDay(x.endsOn)}`, soon: soonOf(x.startsOn, today),
    sub: `away · ${x.type}${x.half ? `, half day ${x.half}` : ""}`, pin: pulsePin(`${x.name} is away`, "away", `${x.name}:${x.startsOn}`),
  }));
  const over = p.allocation.months.flatMap((m) => m.over.map((o): ComingItem => ({
    id: `over:${m.month}:${o.name}`, sort: `${m.month}-a`, cls: "bad", name: o.name, av: avatar(o.name), mark: o.name.split(" ").map((w) => w[0]).join("").slice(0, 2),
    when: m.label, soon: "over-allocated", sub: `planned at ${o.percent}%`, pin: pulsePin(`${m.label}: ${o.name} is planned at ${o.percent}%`, "allocation", m.month),
  })));
  const bench = p.allocation.months.filter((m) => m.bench > 0).map((m): ComingItem => ({
    id: `bench:${m.month}`, sort: `${m.month}-b`, cls: "warn", name: "On the bench", av: "bench", mark: String(m.bench),
    when: m.label, soon: "no work planned", sub: m.skills || `${m.bench} with no work planned`, pin: pulsePin(`${m.label}: ${m.bench} on the bench`, "allocation", m.month),
  }));
  const gap = p.capacity.months.filter((m) => m.over > 0).map((m): ComingItem => ({
    id: `gap:${m.month}`, sort: `${m.month}-c`, cls: "bad", name: "Demand over capacity", av: "gap", mark: "!",
    when: m.label, soon: "short of people", sub: `${m.over} FTE more work than people`, pin: pulsePin(`${m.label}: demand is ${m.over} FTE over capacity`, "capacity", m.month),
  }));
  return [...away, ...over, ...bench, ...gap].sort((a, b) => a.sort.localeCompare(b.sort));
}
