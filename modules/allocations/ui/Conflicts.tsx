"use client";

import { useState } from "react";
import { PinButton } from "@amax/ui";
import type { Grid } from "../server/grid";
import { monthLabel } from "../server/months";
import { AskButton } from "./AskButton";
import { conflictsOf } from "./derive";
import { avatarClass, firstName } from "./look";
import "./side.css";

export function Conflicts({ grid, dip = false }: { grid: Grid; dip?: boolean }) {
  const list = conflictsOf(grid);
  const [at, setAt] = useState(0);
  const index = list.length ? Math.min(at, list.length - 1) : 0;
  const current = list[index];
  const advance = () => setAt((index + 1) % list.length);
  return (
    <section className="card pinnable ad-conf" aria-label="Conflicts">
      <PinButton pin={{ label: "Conflicts", tool: "list_allocations", args: { everyone: grid.scope === "everyone" } }} />
      <h2>Conflicts</h2>
      <p className="muted">an agent suggests, a person decides</p>
      {!current ? <p className="ad-clear"><span className="a-pill ok">Clear</span> Nobody is over 100%.</p> : (
        <div className={dip ? "ad-wrap a-dipper a-dip" : "ad-wrap a-dipper"}>
          <div className="ad-tabs" role="tablist" aria-label="Conflicts">
            {list.map((c, k) => (
              <button key={`${c.person.personId}${c.month}`} type="button" role="tab" aria-selected={k === index} className={k === index ? "on" : undefined} onClick={() => setAt(k)} title={`${c.person.name}, ${monthLabel(c.month, "long")}, ${c.total}%`}>
                {k === index && <i onAnimationEnd={list.length > 1 ? advance : undefined} />}
                <b>{c.person.initials}</b>
                {k === index && <span>{firstName(c.person.name)} · {monthLabel(c.month)}</span>}
              </button>
            ))}
          </div>
          <div className="ad-meta"><span><b>{index + 1}</b> of {list.length}</span><span>{list.length > 1 ? "changes every few seconds" : ""}</span></div>
          <div className="ad-ccard" key={`${current.person.personId}${current.month}`}>
            <div className="who">
              <span className={`av ${avatarClass(current.person.name)}`} aria-hidden="true">{current.person.initials}</span>
              <div><b>{current.person.name}</b><small>{current.person.title}</small></div>
            </div>
            <div className="big">{current.total}%<small>in {monthLabel(current.month, "long")}</small></div>
            <div className="mini" aria-hidden="true">{grid.months.map((m) => <i key={m.month} className={m.month === current.month ? "r" : undefined} />)}</div>
            <div className="mm" aria-hidden="true">{grid.months.map((m) => <span key={m.month}>{monthLabel(m.month)}</span>)}</div>
            <AskButton label="Take action" className="btn" name={`Take action on ${current.person.name}'s over-allocation with amax`}
              pin={{ label: `${current.person.name}, total`, tool: "get_allocation", args: { person: current.person.employeeNo } }}
              prompt={`Fix ${current.person.name}'s over-allocation in ${monthLabel(current.month, "long")}`} />
          </div>
          <a className="ad-all" href="/suggestions">All suggestions →</a>
        </div>
      )}
    </section>
  );
}
