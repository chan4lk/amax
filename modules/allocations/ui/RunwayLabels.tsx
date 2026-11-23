import type { Forecast } from "../server/forecast";
import { monthLabel } from "../server/months";
import { round1 } from "./look";
import type { Scale } from "./runwayScale";

export function RunwayLabels({ f, s }: { f: Forecast; s: Scale }) {
  const last = f.months.length - 1;
  return (
    <>
      {f.months.map((m, i) => {
        const gap = round1(m.capacity - m.demand);
        return (
          <g key={m.month}>
            <text className="a-ax m" x={s.x(i)} y={288} textAnchor="middle">{monthLabel(m.month)}</text>
            <text className={gap >= 0 ? "a-spare ok" : "a-spare bad"} x={s.x(i)} y={312} textAnchor="middle">{gap >= 0 ? "+" : "−"}{Math.abs(gap)}{gap >= 0 ? " spare" : " short"}</text>
            {i < last && <text className="a-val" x={s.x(i)} y={s.y(m.demand) + (m.demand < m.capacity - 3 ? 24 : -14)} textAnchor="middle">{m.demand}</text>}
          </g>
        );
      })}
      <text className="a-end demand" x={826} y={s.y(f.months[last].demand) - 12} textAnchor="end">Demand {f.months[last].demand}</text>
      <text className="a-end cap" x={826} y={s.y(f.months[last].capacity) - 12} textAnchor="end">Capacity {f.months[last].capacity}</text>
    </>
  );
}
