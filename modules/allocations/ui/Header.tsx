import { Fragment } from "react";
import { IntentButton } from "@amax/ui";
import type { Forecast } from "../server/forecast";
import type { Grid } from "../server/grid";
import { monthLabel } from "../server/months";
import { conflictsOf, ledeParts } from "./derive";
import type { Group } from "./types";
import "./header.css";

type Props = { f: Forecast; grid: Grid; group: Group; line: string | null; canAllocate: boolean; dip?: boolean };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const peopleCount = (n: number) => (n === 1 ? "1 person" : `${n} people`);

export function Header({ f, grid, group, line, canAllocate, dip = false }: Props) {
  const fade = dip ? " a-dipper a-dip" : " a-dipper";
  const last = f.months.length - 1;
  const conflicts = conflictsOf(grid);
  const months = [...new Set(conflicts.map((c) => monthLabel(c.month)))].join(", ");
  const parts = ledeParts(grid);
  return (
    <header className="a-head">
      <div className="a-title">
        <h1>Allocations and forecast</h1>
        <span className={`a-pill${fade}`}><b>{monthLabel(f.months[0].month)} → {monthLabel(f.months[last].month)}</b></span>
        <span className={`a-pill${fade}`}>{group === "all" ? "Everyone" : "My projects"} · {peopleCount(grid.people.length)}</span>
        <span className={`${conflicts.length ? "a-pill bad" : "a-pill ok"}${fade}`}>{conflicts.length ? `${plural(conflicts.length, "conflict")} · ${months}` : "No conflicts"}</span>
        {canAllocate && <span className="a-head-actions"><IntentButton intent="allocations.allocate" label="Allocate" primary={false} /></span>}
      </div>
      {grid.scope !== "none" && (
        <p className="a-lede">
          {parts.length ? parts.map((s, k) => (s.bold ? <b key={k}>{s.text}</b> : <Fragment key={k}>{s.text}</Fragment>)) : "Nobody is over-allocated, and everyone has work planned."}
        </p>
      )}
      {line && <p className="muted a-line" role="status">{line}. Ask amax to change what is shown.</p>}
    </header>
  );
}
