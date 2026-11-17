"use client";

import { useEffect, useRef, useState } from "react";
import { PinButton } from "@amax/ui";
import type { Forecast } from "../server/forecast";
import type { GridPerson } from "../server/grid";
import { SrTable } from "./charts";
import { runwayFacts } from "./derive";
import { RunwayBox } from "./RunwayBox";
import { RunwayChart } from "./RunwayChart";
import type { Spot } from "./types";
import "./runway.css";

const BOX = 262;

export function Runway({ f, people, who }: { f: Forecast; people: GridPerson[]; who: string }) {
  const frame = useRef<HTMLDivElement>(null);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [held, setHeld] = useState<number | null>(null);
  const place = (index: number, el: SVGCircleElement) => {
    const outer = frame.current!.getBoundingClientRect();
    const dot = el.getBoundingClientRect();
    const flip = dot.right - outer.left + 16 + BOX > outer.width;
    setSpot({ index, flip, left: flip ? dot.left - outer.left - BOX - 16 : dot.right - outer.left + 16, top: Math.max(4, dot.top - outer.top - 26) });
  };
  const release = () => { setHeld(null); setSpot(null); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") release(); };
    document.addEventListener("click", release);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("click", release); document.removeEventListener("keydown", onKey); };
  }, []);
  return (
    <section className="card pinnable a-runway" aria-label="Capacity runway">
      <div className="a-card-head">
        <div>
          <h2>Capacity runway<PinButton inline pin={{ label: "Capacity and demand", tool: "get_capacity_forecast", args: {} }} /></h2>
          <p className="muted">{f.team}, FTE · green gap = spare people · hatched = forecast</p>
        </div>
        <div className="a-chips">{runwayFacts(f).map((c) => <span key={c.text} className={`a-pill ${c.tone}`}>{c.text}</span>)}</div>
      </div>
      <div className="a-rw" ref={frame}>
        <RunwayChart f={f} onHover={(i, el) => held === null && place(i, el)} onLeave={() => held === null && setSpot(null)}
          onPress={(i, el) => { if (held === i) release(); else { setHeld(i); place(i, el); } }} />
        {spot && <RunwayBox f={f} people={people} who={who} spot={spot} />}
      </div>
      <SrTable caption="Capacity against demand" head={["Month", "Capacity", "Demand"]} rows={f.months.map((m) => [m.month, m.capacity, m.demand])} />
      <div className="a-legend"><span><i className="demand" />Demand</span><span><i className="cap" />Capacity</span>{!f.leaveAdjusted && <span className="muted">Booked leave isn&apos;t subtracted until the Leave module is installed.</span>}</div>
    </section>
  );
}
