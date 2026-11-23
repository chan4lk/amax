import { PinButton } from "@amax/ui";
import { pulsePin } from "../pins";
import type { Pulse } from "../server/pulse-types";

const COLORS = ["var(--violet)", "var(--amber)", "var(--pink, #F48B9B)", "var(--mint)"];

export function ByProject({ p }: { p: Pulse }) {
  const rows = p.hours.rows;
  return (
    <section className="card pinnable by-project">
      <PinButton pin={pulsePin(`By project, ${p.monthName}`, "hours")} />
      <h2>By project</h2>
      {p.hours.state !== "ok" ? <p className="muted">{p.hours.state === "off" ? "Allocations or Time is not installed." : "No planned or logged project hours yet."}</p> : (
        <>
          <p className="muted lead">Hours logged against the plan, {p.monthName} to date. A bar turns red more than {p.hours.limit}% off plan.</p>
          {rows.map((x, i) => {
            const scale = Math.max(x.planned, x.logged, 1);
            return (
              <div className="proj pinnable" key={x.projectId}>
                <div className="proj-head">
                  <span><span className="dot" style={{ background: COLORS[i % COLORS.length] }} />{x.name}</span>
                  <b>{x.logged} <small>of {x.planned} h</small></b>
                </div>
                <div className="track" aria-hidden="true"><i className={x.flag ? "fill bad" : "fill"} style={{ width: `${(x.logged / scale) * 100}%` }} /><u className="plan" style={{ left: `${(x.planned / scale) * 100}%` }} /></div>
                {x.flag && <span className="chip bad">{Math.abs(x.drift ?? 0)}% {x.flag} plan</span>}
                <PinButton pin={pulsePin(`${x.name}, hours vs plan`, "hours", x.projectId)} />
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}
