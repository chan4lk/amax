"use client";

import type { ReactNode } from "react";
import { PinButton } from "@amax/ui";
import { monthLabel } from "../server/months";
import { BoardKeys } from "./BoardKeys";
import { GroupSwitch } from "./GroupSwitch";
import { FOLD, MORE, useBoardRows } from "./useBoardRows";
import { Lane } from "./Lane";
import type { Group, ViewData } from "./types";
import "./board.css";

type Props = { data: ViewData; group: Group; selected: Group; onGroup: (g: Group) => void; empty: Record<Group, ReactNode>; visible: Record<Group, string[]> };

export function Board({ data, group, selected, onGroup, empty, visible }: Props) {
  const months = data.grids.all.months;
  const { byId, target, slots, shown, left, more, showMore } = useBoardRows(data, group, visible);
  const hidden = data.grids[group].hidden;
  return (
    <section className="card ad-board" aria-label="People by month">
      <div className="ad-bhead">
        <h2>Who is on what, month by month</h2>
        <PinButton inline pin={{ label: "People by month", tool: "list_allocations", args: { everyone: group === "all" } }} />
        <span className="muted">each cell is that month&apos;s %</span>
        <GroupSwitch group={selected} onChange={onGroup} />
      </div>
      {target.length === 0 && shown.length === 0 ? empty[group] : (
        <div className="ad-inner">
          <div className="ad-mhead" style={{ ["--n" as string]: months.length }}>
            <span>Person</span>
            <div>{months.map((m) => <span key={m.month} className={m.forecast ? "fc" : undefined}>{monthLabel(m.month)}{m.forecast && <small>forecast</small>}</span>)}</div>
          </div>
          <div className="ad-lanes">
            {shown.map((id, i) => (
              <div key={id} className={`${slots[id] === "open" ? "ad-slot" : "ad-slot shut"}${i >= FOLD ? " quiet" : ""}`} inert={slots[id] !== "open"}>
                <div className="ad-slot-in"><Lane person={byId.get(id)!} months={months} order={Math.min(i, 4)} /></div>
              </div>
            ))}
          </div>
          {left > 0 && (
            <div ref={more} className="ad-people-more">
              <button type="button" className="btn" onClick={showMore}>Show {Math.min(MORE, left)} more</button>
              <span className="muted">{left} more {left === 1 ? "person" : "people"} load as you scroll</span>
            </div>
          )}
          <BoardKeys />
        </div>
      )}
      {shown.length > 0 && hidden > 0 && <p className="muted ad-note">{hidden} more {hidden === 1 ? "person is" : "people are"} outside your HR access and not shown.</p>}
    </section>
  );
}
