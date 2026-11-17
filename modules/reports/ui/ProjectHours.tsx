"use client";

import { PinButton } from "@amax/ui";
import { pulsePin } from "../pins";
import type { Group } from "../server/roster";
import type { ProjectRow, ViewData } from "./data";

export function ProjectHours({ d, group }: { d: ViewData; group: Group }) {
  const cur = d.sides[group].projects, other = d.sides[group === "everyone" ? "mine" : "everyone"].projects;
  const ids = new Set(cur.rows.map((r) => r.id));
  const all = [...cur.rows, ...other.rows.filter((r) => !ids.has(r.id))];
  const order = d.sides.everyone.projects.rows.map((r) => r.id);
  all.sort((a, b) => (order.indexOf(a.id) + 1 || 999) - (order.indexOf(b.id) + 1 || 999));
  return (
    <section className="card b-hrs pinnable">
      <PinButton pin={pulsePin(`Hours against the plan, ${d.monthName}`, "hours")} />
      <h2>Hours against the plan</h2>
      <span className="muted">by project, {d.monthName} to date</span>
      <div className="r-proj">
        {cur.state !== "ok" && <p className="none2">{cur.state === "off" ? "Allocations or Time is not installed." : "No planned or logged project hours yet."}</p>}
        {all.map((r) => <Project key={r.id} r={cur.rows.find((x) => x.id === r.id) ?? r} gone={!ids.has(r.id)} />)}
      </div>
    </section>
  );
}

function Project({ r, gone }: { r: ProjectRow; gone: boolean }) {
  const dd = r.drift ?? 0, max = Math.max(r.planned, r.logged, 1) * 1.15;
  const tone = r.flag === "over" ? "bad" : r.flag === "behind" ? "warnc" : "muted";
  const fill = r.flag === "over" ? "#C2412D" : r.flag === "behind" ? "#F2A93B" : "#9C88FF";
  return (
    <div className={gone ? "pr gone pinnable" : "pr pinnable"} inert={gone || undefined} aria-hidden={gone || undefined}>
      <PinButton pin={r.pin} />
      <b>{r.name}</b>
      <span className={`d2 ${tone}`}>{r.drift === null ? "–" : `${dd > 0 ? "+" : dd < 0 ? "−" : ""}${Math.abs(dd)}%`}</span>
      <div className="mini" aria-hidden="true"><i style={{ width: `${(r.logged / max) * 100}%`, background: fill }} /><b style={{ left: `${(r.planned / max) * 100}%` }} /></div>
      <small>{r.logged} h logged · {r.planned} h planned{r.flag ? ` · ${r.flag} plan` : ""}</small>
    </div>
  );
}
