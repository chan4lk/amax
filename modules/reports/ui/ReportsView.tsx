"use client";

import { useDeferredValue, useEffect, useState, type MouseEvent, type ReactNode } from "react";
import type { Group } from "../server/roster";
import { Attention } from "./Attention";
import { ComingLine } from "./ComingLine";
import type { ViewData } from "./data";
import { groupHref } from "./href";
import { Lede } from "./Lede";
import type { Band } from "./look";
import { PeopleRace } from "./PeopleRace";
import { ProjectHours } from "./ProjectHours";
import { RingCard } from "./RingCard";
import { TrendCard } from "./TrendCard";
import { Waterfall } from "./Waterfall";

type Props = { d: ViewData; initial: Group; params: Record<string, string | undefined>; band?: Band; find?: string; tables: Record<Group, ReactNode> };

export function ReportsView({ d, initial, params, band, find, tables }: Props) {
  const [selected, setSelected] = useState<Group>(initial);
  const group = useDeferredValue(selected);
  const [ready, setReady] = useState(false);
  useEffect(() => { let b = 0; const a = requestAnimationFrame(() => { b = requestAnimationFrame(() => setReady(true)); }); return () => { cancelAnimationFrame(a); cancelAnimationFrame(b); }; }, []);
  const pick = (g: Group) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    if (g === selected) return;
    setSelected(g);
    window.history.replaceState(window.history.state, "", groupHref(g, params));
  };
  const notes = d.sides[group].notes;
  return (
    <div className="reports rep-look">
      <header className="head">
        <div><div className="eyebrow">{d.span} · {d.workingDays} working days</div><h1>Utilisation in {d.monthName}</h1></div>
        <nav className="view" aria-label="Whose people to show">
          {(["mine", "everyone"] as const).map((g) => (
            <a key={g} href={groupHref(g, params)} onClick={pick(g)} className={g === selected ? "on" : undefined} aria-current={g === selected ? "page" : undefined}>{d.sides[g].label}</a>
          ))}
        </nav>
      </header>
      <Lede d={d} group={group} />
      {notes.map((n) => <p className="note" key={n}>{n}</p>)}
      <div className="bento">
        <RingCard d={d} group={group} ready={ready} />
        <TrendCard d={d} group={group} />
        <Attention d={d} group={group} />
        <Waterfall d={d} group={group} ready={ready} />
        <ProjectHours d={d} group={group} />
        <PeopleRace d={d} group={group} ready={ready} band={band} find={find} />
        <ComingLine d={d} group={group} />
        {(["mine", "everyone"] as const).map((g) => <div key={g} className="b-tables" hidden={g !== group}>{tables[g]}</div>)}
      </div>
    </div>
  );
}
