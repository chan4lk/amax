"use client";

import type { Forecast } from "../server/forecast";
import { monthLabel } from "../server/months";
import { BOTTOM, LEFT, RIGHT, points, scaleOf } from "./runwayScale";
import { RunwayLabels } from "./RunwayLabels";
import "./runway.css";

type Open = (index: number, el: SVGCircleElement) => void;
type Props = { f: Forecast; onHover: Open; onLeave: () => void; onPress: Open };

export function RunwayChart({ f, onHover, onLeave, onPress }: Props) {
  const s = scaleOf(f);
  const first = f.months.findIndex((m) => m.forecast);
  const demand = points(f, s, "demand");
  const peak = f.months.reduce((best, m, i) => (m.demand > f.months[best].demand ? i : best), 0);
  const hit = (i: number, key: "demand" | "capacity") => (
    <circle key={`${key}${i}`} className="a-hit" cx={s.x(i)} cy={s.y(f.months[i][key])} r={13} tabIndex={0} role="button"
      aria-label={`${monthLabel(f.months[i].month, "long")} ${key} ${f.months[i][key]} FTE. Press for the month summary.`}
      onPointerEnter={(e) => onHover(i, e.currentTarget)} onFocus={(e) => onHover(i, e.currentTarget)} onPointerLeave={onLeave} onBlur={onLeave}
      onClick={(e) => { e.stopPropagation(); onPress(i, e.currentTarget); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPress(i, e.currentTarget); } }} />
  );
  return (
    <svg className="a-chart" viewBox="0 0 860 336" role="img" aria-label="Capacity against demand in FTE, by month">
      <defs>
        <pattern id="a-fc" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="8" className="a-fc-stripe" /></pattern>
        <linearGradient id="a-dem" x1="0" y1="0" x2="0" y2="1"><stop offset="0" className="a-dem-top" /><stop offset="1" className="a-dem-bottom" /></linearGradient>
        <linearGradient id="a-gapfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" className="a-gap-top" /><stop offset="1" className="a-gap-bottom" /></linearGradient>
      </defs>
      {s.ticks.map((t) => <g key={t}><line className="a-grid" x1={44} x2={830} y1={s.y(t)} y2={s.y(t)} /><text className="a-ax" x={36} y={s.y(t) + 4} textAnchor="end">{t}</text></g>)}
      {first >= 0 && <><rect x={s.x(first) - 20} y={20} width={850 - s.x(first)} height={BOTTOM - 20} fill="url(#a-fc)" /><text className="a-ax" x={s.x(first) - 10} y={36}>forecast</text></>}
      <polygon fill="url(#a-gapfill)" points={`${points(f, s, "capacity")} ${demand.split(" ").reverse().join(" ")}`} />
      <polygon fill="url(#a-dem)" points={`${demand} ${RIGHT},${BOTTOM} ${LEFT},${BOTTOM}`} />
      <polyline className="a-cap-line" points={points(f, s, "capacity")} />
      <polyline className="a-draw a-demand-line" pathLength={1} points={demand} />
      {f.months.map((m, i) => <g key={m.month}><circle className="a-dot cap" cx={s.x(i)} cy={s.y(m.capacity)} r={3.5} /><circle className="a-dot demand" cx={s.x(i)} cy={s.y(m.demand)} r={i === peak ? 7 : 5} /></g>)}
      <RunwayLabels f={f} s={s} />
      {f.months.flatMap((_, i) => [hit(i, "demand"), hit(i, "capacity")])}
    </svg>
  );
}
