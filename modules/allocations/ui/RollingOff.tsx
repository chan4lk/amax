"use client";

import { PinButton } from "@amax/ui";
import type { Grid } from "../server/grid";
import { monthLabel } from "../server/months";
import { rollingOffOf } from "./derive";
import { avatarClass } from "./look";
import type { Group } from "./types";
import "./side.css";

const SHOWN = 8;

export function RollingOff({ grid, group }: { grid: Grid; group: Group }) {
  const rows = rollingOffOf(grid).sort((a, b) => a.month.localeCompare(b.month) || a.person.name.localeCompare(b.person.name));
  return (
    <section className="card ad-roll" aria-label="Rolling off soon">
      <h2>Rolling off soon</h2>
      <p className="muted">your people with no work planned from</p>
      {rows.length === 0 ? <p className="ad-clear">Nobody rolls off in this window.</p> : (
        <ul className="ad-free">
          {rows.slice(0, SHOWN).map(({ person, month }) => (
            <li key={person.personId} className="pinnable">
              <PinButton pin={{ label: `${person.name}, totals`, tool: "get_allocation", args: { person: person.employeeNo } }} />
              <span className="rn"><i className={`av ${avatarClass(person.name)}`} aria-hidden="true">{person.initials}</i>{person.name}</span>
              <span className="a-pill warn">{monthLabel(month, "long")}</span>
            </li>
          ))}
        </ul>
      )}
      {rows.length > SHOWN && <p className="muted ad-more">{rows.length - SHOWN} more, ask amax for the full list.</p>}
    </section>
  );
}
