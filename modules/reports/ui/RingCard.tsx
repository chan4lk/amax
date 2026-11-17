"use client";

import { PinButton } from "@amax/ui";
import { reportPin } from "../pins";
import type { Group } from "../server/roster";
import { AskButton } from "./AskButton";
import type { Side, ViewData } from "./data";
import { Glide } from "./Glide";
import { COL } from "./look";

const C = 2 * Math.PI * 70;
const h = (n: number) => `${n} h`;

export function RingCard({ d, group, ready }: { d: ViewData; group: Group; ready: boolean }) {
  const s = d.sides[group], target = d.target;
  const pct = s.pct ?? 0, diff = pct - target;
  const ang = ((-90 + (target / 100) * 360) * Math.PI) / 180;
  const at = (r: number) => ({ x: (90 + r * Math.cos(ang)).toFixed(1), y: (90 + r * Math.sin(ang)).toFixed(1) });
  const a = at(58), b = at(82);
  const fact = (value: number, label: string) => (
    <div className="pinnable"><PinButton pin={reportPin(`${s.label}, ${label} hours in ${d.monthName}`, d.month, group)} /><b><Glide value={Math.round(value)} format={h} /></b><small>{label}</small></div>
  );
  return (
    <section className="card b-ring pinnable">
      <PinButton pin={s.pin} />
      <h2>Billable against available</h2>
      <span className="muted">against the {target}% target</span>{" "}
      <AskButton className="r-tlink" label="Change target" name="Ask amax to change the utilisation target" prompt={`Change the utilisation target from ${target}% to `} pin={reportPin(`Utilisation target, ${d.monthName}`, d.month)} />
      <div className="ringwrap">
        <div className="gauge">
          <svg viewBox="0 0 180 180" role="img" aria-label={s.pct === null ? `${s.label}: no utilisation figure yet` : `${s.label} utilisation ${pct}% against a ${target}% target`}>
            <circle cx="90" cy="90" r="70" fill="none" stroke="var(--r-track)" strokeWidth="14" />
            <circle className="arc" cx="90" cy="90" r="70" fill="none" strokeWidth="14" strokeLinecap="round" transform="rotate(-90 90 90)"
              style={{ stroke: COL[group].arc, strokeDasharray: `${ready ? ((Math.min(pct, 100) / 100) * C).toFixed(1) : 0} ${C.toFixed(1)}` }} />
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#F2A93B" strokeWidth="3.5" strokeLinecap="round" />
          </svg>
          <div className="gc">
            <b>{s.pct === null ? "–" : <Glide value={pct} format={(n) => `${n}%`} />}</b>
            <span>target {target}%</span>
            {s.pct !== null && <em className={diff >= 0 ? undefined : "no"}>{diff >= 0 ? "+" : "−"}{Math.abs(diff)} pts</em>}
          </div>
        </div>
        <div className="facts">{fact(s.billable, "billable")}{fact(s.available, "available")}{fact(s.logged, "logged")}</div>
        <div className="cmp">
          {(["mine", "everyone"] as const).map((g) => <Compare key={g} s={d.sides[g]} g={g} on={g === group} target={target} ready={ready} />)}
        </div>
        <div className="pace">{s.pace === null ? <>{d.monthName} to date · {d.span}</> : <>On pace to finish {d.monthName} near <b>{s.pace}%</b></>}</div>
      </div>
    </section>
  );
}

function Compare({ s, g, on, target, ready }: { s: Side; g: Group; on: boolean; target: number; ready: boolean }) {
  return (
    <div className={on ? "r sel pinnable" : "r pinnable"}>
      <PinButton pin={s.pin} />
      <div className="rh"><span><u className="d" style={{ background: COL[g].c }} />{s.label}<i className="seltag"> · selected</i></span><span className="pc">{s.pct === null ? "–" : `${s.pct}%`}</span></div>
      <div className="b"><i style={{ background: COL[g].c, width: ready ? `${Math.min(100, s.pct ?? 0)}%` : 0 }} /><u style={{ left: `${target}%` }} /></div>
      <small>{s.counted} of {s.people} people have time · {Math.round(s.billable)} of {Math.round(s.available)} h billable</small>
    </div>
  );
}
