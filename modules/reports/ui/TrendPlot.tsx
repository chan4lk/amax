"use client";

import type { Group } from "../server/roster";
import type { ViewData } from "./data";
import { B0, GROUPS, LINE, X, pctText, scaleOf, segmentsOf } from "./trendMath";
import type { Spot } from "./useTrendSpot";

type Props = { d: ViewData; group: Group; spot: Spot | null; bind: (k: number) => object };

export function TrendPlot({ d, group, spot, bind }: Props) {
  const target = d.target, other: Group = group === "everyone" ? "mine" : "everyone";
  const { Y, ticks } = scaleOf(d);
  const label = (g: Group) => d.sides[g].label;
  const order = [other, group] as const;
  const hits = (g: Group, r: number) => d.sides[g].trend.map((v, k) => v === null ? null : (
    <circle key={`${g}${k}`} className="ph" cx={X(k)} cy={Y(v)} r={r} tabIndex={0} role="button" {...bind(k)}
      aria-label={`${d.months[k]}: ${label(g)} ${v}%, ${label(g === "mine" ? "everyone" : "mine")} ${pctText(d.sides[g === "mine" ? "everyone" : "mine"].trend[k])}. Press for the summary.`} />
  ));
  return (
    <svg viewBox="0 0 860 386" width="100%" role="img" aria-label={`Utilisation per month for ${label("mine")} and ${label("everyone")} against the target`} aria-describedby="r-trend-data">
      <defs>
        {GROUPS.map((g) => (
          <linearGradient key={g} id={LINE[g].fill} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={LINE[g].c} stopOpacity=".30" /><stop offset="1" stopColor={LINE[g].c} stopOpacity=".02" /></linearGradient>
        ))}
      </defs>
      <g className="r-grid">{ticks.map((t) => <line key={t} x1="50" x2="830" y1={Y(t)} y2={Y(t)} />)}</g>
      <g className="ax" textAnchor="end">{ticks.map((t) => <text key={t} x="42" y={Y(t) + 4}>{t}</text>)}</g>
      <line x1="50" x2="830" y1={Y(target)} y2={Y(target)} stroke="#F2A93B" strokeWidth="2" strokeDasharray="6 6" />
      <text x="56" y={Y(target) - 7} fontSize="11" fontWeight="700" className="r-tlab">target {target}%</text>
      {order.map((g) => segmentsOf(d.sides[g].trend).map((s) => (
        <polygon key={`a${g}${s[0].i}`} className={g === group ? "area sel" : "area"} fill={`url(#${LINE[g].fill})`}
          points={`${s.map((p) => `${X(p.i).toFixed(1)},${Y(p.v).toFixed(1)}`).join(" ")} ${X(s[s.length - 1].i)},${B0} ${X(s[0].i)},${B0}`} />
      )))}
      {order.map((g) => segmentsOf(d.sides[g].trend).map((s) => (
        <polyline key={`l${g}${s[0].i}`} className={g === group ? "ln sel" : "ln"} points={s.map((p) => `${X(p.i).toFixed(1)},${Y(p.v).toFixed(1)}`).join(" ")} stroke={LINE[g].c} />
      )))}
      {order.map((g) => {
        const lastK = d.sides[g].trend.findLastIndex((v) => v !== null);
        return (
          <g key={`d${g}`} className={g === group ? "dots sel" : "dots"} fill="var(--r-dot)" stroke={LINE[g].c} strokeWidth={g === "mine" ? 3 : 2.5}>
            {d.sides[g].trend.map((v, k) => v === null ? null : <circle key={k} className={`pt${k === lastK ? " last" : ""}${spot?.k === k ? " hot" : ""}`} cx={X(k)} cy={Y(v)} />)}
          </g>
        );
      })}
      {order.map((g) => (
        <g key={`v${g}`} className={g === group ? "vals sel" : "vals"} fontSize="12" fontWeight="700" fill={LINE[g].d} textAnchor="middle" aria-hidden="true">
          {d.sides[g].trend.map((v, k) => v === null ? null : <text key={k} x={X(k)} y={g === "mine" ? Y(v) - 14 : Y(v) + 24}>{v}</text>)}
        </g>
      ))}
      <g className="ax m" textAnchor="middle" fontSize="12">{d.months.map((m, i) => <text key={`${m}${i}`} x={X(i)} y="364">{m}</text>)}</g>
      {hits("mine", 13)}
      {hits("everyone", 11)}
    </svg>
  );
}
