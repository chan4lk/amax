import { PinButton } from "@amax/ui";
import { pulsePin, reportPin } from "../pins";
import { hoursText } from "../server/lede";
import type { Pulse } from "../server/pulse-types";
import type { Report } from "../server/view";

export function Stats({ r, p }: { r: Report; p: Pulse }) {
  const timed = r.rows.filter((x) => !x.noTime).length;
  const over = new Set(p.allocation.months.flatMap((m) => m.over.map((o) => o.name))).size;
  const free = r.availability.rows.reduce((n, x) => n + (x.freeHours ?? 0), 0);
  const stats: { k: string; value: string; sub: string; bad?: boolean; pin: ReturnType<typeof reportPin> }[] = [
    { k: "People", value: String(r.rows.length), sub: timed === r.rows.length ? "all with time logged" : `${timed} with time logged`, pin: reportPin(`People, ${r.monthName}`, r.month) },
    { k: "Over-allocated", value: p.allocation.state === "off" ? "–" : String(over), sub: "next 6 months", bad: over > 0, pin: pulsePin("Over-allocated, next 6 months", "allocation") },
    { k: "Free hours left", value: r.availability.allocationsOn ? `${hoursText(Math.round(free * 10) / 10)} h` : "–", sub: `rest of ${r.monthName}`, pin: reportPin(`Free hours, rest of ${r.monthName}`, r.month) },
    { k: "Away soon", value: p.away.state === "off" ? "–" : String(p.away.rows.length), sub: "next 14 days", pin: pulsePin("Away soon", "away") },
  ];
  return (
    <div className="stats" role="list" aria-label={`${r.monthName} figures`}>
      {stats.map((s) => (
        <div className={s.bad ? "card pinnable bad" : "card pinnable"} role="listitem" key={s.k}>
          <PinButton pin={s.pin} />
          <div className="k">{s.k}</div>
          <div className="big">{s.value}</div>
          <div className="sub">{s.sub}</div>
        </div>
      ))}
    </div>
  );
}
