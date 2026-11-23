"use client";

import { useDeferredValue, useEffect, useState, type ReactNode } from "react";
import { BenchCard } from "./BenchCard";
import { Board } from "./Board";
import { Conflicts } from "./Conflicts";
import { Header } from "./Header";
import { RollingOff } from "./RollingOff";
import { Runway } from "./Runway";
import type { Group, ViewData } from "./types";
import "./look.css";

type Props = { data: ViewData; empty: Record<Group, ReactNode>; visible: Record<Group, string[]> };

export function AllocationsView({ data, empty, visible }: Props) {
  const [selected, setSelected] = useState<Group>(data.start);
  const group = useDeferredValue(selected);
  const [dip, setDip] = useState(false);
  useEffect(() => {
    setDip(true);
    const t = setTimeout(() => setDip(false), 260);
    return () => clearTimeout(t);
  }, [selected]);
  const grid = data.grids[group];
  const count = grid.people.length;
  const who = group === "all" ? "Everyone on the board" : `Your ${count === 1 ? "1 person" : `${count} people`}`;
  return (
    <div className="alloc-look">
      <Header f={data.f} grid={grid} group={group} line={data.line} canAllocate={data.canAllocate} dip={dip} />
      <div className="a-cols">
        <div className="a-left">
          <Runway f={data.f} people={grid.people} who={who} />
          <Board data={data} group={group} selected={selected} onGroup={setSelected} empty={empty} visible={visible} />
        </div>
        <div className="a-side">
          <Conflicts grid={grid} dip={dip} />
          <BenchCard months={data.bench} start={data.benchStart} />
          <RollingOff grid={grid} group={group} />
        </div>
      </div>
    </div>
  );
}
