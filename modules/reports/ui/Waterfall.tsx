"use client";

import { PinButton } from "@amax/ui";
import { reportPin } from "../pins";
import type { Group } from "../server/roster";
import type { ViewData } from "./data";
import { Glide } from "./Glide";
import { COL } from "./look";

const COLS: [string, string][] = [["Contracted", "working days × 8 h × FTE"], ["Leave", "approved, taken off"], ["Available", "what they could bill"], ["Logged", "everything entered"], ["Billable", "flagged billable"]];

export function Waterfall({ d, group, ready }: { d: ViewData; group: Group; ready: boolean }) {
  const s = d.sides[group], cc = COL[group];
  const max = Math.max(s.contracted, s.available, s.logged, 1);
  const vals = [s.contracted, s.leave, s.available, s.logged, s.billable];
  const colr = ["#DAD6EC", "#F2C27A", cc.soft, cc.mid, cc.c];
  return (
    <section className="card b-wf pinnable">
      <PinButton pin={reportPin(`How the percentage is made, ${s.label.toLowerCase()}, ${d.monthName}`, d.month, group)} />
      <h2>How the percentage is made</h2>
      <span className="muted">{s.label} · {s.counted} {s.counted === 1 ? "person" : "people"} with time</span>
      <div className="wf">
        {COLS.map(([name, note], i) => {
          const h = ready ? (vals[i] / max) * 84 : 0, bottom = i === 1 && ready ? (s.available / max) * 84 : 0;
          return (
            <div className="wc pinnable" key={name}>
              <PinButton pin={reportPin(`${s.label}, ${name.toLowerCase()} hours in ${d.monthName}`, d.month, group)} />
              <div className="wbar">
                <Glide className="wv" style={{ bottom: `calc(${bottom + h}% + 5px)` }} value={Math.round(vals[i])} format={(x) => `${i === 1 ? "−" : ""}${x} h`} />
                <div className="wfill" style={{ height: `${h}%`, bottom: `${bottom}%`, background: colr[i] }} />
              </div>
              <div className="wn">{name}<small>{note}</small></div>
            </div>
          );
        })}
      </div>
      <div className="wcap">Billable <b>{Math.round(s.billable)} h</b> ÷ available <b>{Math.round(s.available)} h</b> = <b style={{ color: cc.d }}>{s.pct === null ? "–" : `${s.pct}%`}</b></div>
    </section>
  );
}
