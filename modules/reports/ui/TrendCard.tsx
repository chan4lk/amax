"use client";

import { PinButton } from "@amax/ui";
import { reportPin } from "../pins";
import type { Group } from "../server/roster";
import type { ViewData } from "./data";
import { TrendBox } from "./TrendBox";
import { TrendPlot } from "./TrendPlot";
import { GROUPS, LINE, pctText, tinsOf } from "./trendMath";
import { useTrendSpot } from "./useTrendSpot";

export function TrendCard({ d, group }: { d: ViewData; group: Group }) {
  const target = d.target, other: Group = group === "everyone" ? "mine" : "everyone";
  const { spot, wrap, bind } = useTrendSpot(group);
  const label = (g: Group) => d.sides[g].label;
  const last = (g: Group) => d.sides[g].trend[d.months.length - 1];
  const pin = reportPin(`Utilisation, 12 months to ${d.monthName}, ${label(group).toLowerCase()}`, d.month, group);
  return (
    <section className="card b-trend pinnable">
      <PinButton pin={pin} />
      <h2>Utilisation, last 12 months</h2>
      <span className="muted">{label(group)} {pctText(last(group))} · {label(other)} {pctText(last(other))} · target {target}%</span>
      <div className="rw" ref={wrap}>
        <TrendPlot d={d} group={group} spot={spot} bind={bind} />
        <TrendBox d={d} group={group} spot={spot} />
      </div>
      <div className="legend">
        {GROUPS.map((g) => <span key={g} className={g === group ? "r-on" : undefined}><i style={{ background: LINE[g].c, height: g === group ? 4 : 3 }} />{label(g)}<em>{g === group ? " (selected)" : ""}</em></span>)}
        <span><i style={{ background: "#F2A93B", height: 4 }} />Target</span>
      </div>
      <div className="tins">{tinsOf(d, group).map((t) => <div key={t.s} className="pinnable"><PinButton pin={reportPin(`${label(group)}: ${t.s}, 12 months to ${d.monthName}`, d.month, group)} /><b>{t.b}</b><small>{t.s}</small></div>)}</div>
      <table className="sr" id="r-trend-data"><caption>Utilisation per month against the {target}% target</caption>
        <thead><tr><th scope="col">Month</th>{GROUPS.map((g) => <th scope="col" key={g}>{label(g)}</th>)}<th scope="col">Target</th></tr></thead>
        <tbody>{d.months.map((m, i) => <tr key={`${m}${i}`}><th scope="row">{m}</th>{GROUPS.map((g) => <td key={g}>{d.sides[g].trend[i] === null ? "No hours" : `${d.sides[g].trend[i]}%`}</td>)}<td>{target}%</td></tr>)}</tbody>
      </table>
    </section>
  );
}
