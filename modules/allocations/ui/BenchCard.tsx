"use client";

import { useState } from "react";
import { PinButton } from "@amax/ui";
import { AskButton } from "./AskButton";
import type { BenchMonth } from "./benchData";
import { avatarClass } from "./look";
import "./side.css";

export const SKILL_COLOR: Record<string, string> = { ".NET": "#7B61FF", React: "#5CC8F0", QA: "#F48B9B", Data: "#F2A93B", Mobile: "#2FCB8C", Delivery: "#B3A1FF" };
export const skillColor = (s: string) => SKILL_COLOR[s] ?? "#C3B5FF";

export function BenchCard({ months, start }: { months: BenchMonth[]; start: number }) {
  const [at, setAt] = useState(start);
  const current = months[at];
  const before = months[at - 1];
  const step = (by: number) => setAt((n) => Math.min(months.length - 1, Math.max(0, n + by)));
  const change = before ? current.count - before.count : null;
  return (
    <section className="card pinnable ad-bench" aria-label="Bench">
      <PinButton pin={{ label: `Bench by skill, ${current.label}`, tool: "get_capacity_forecast", args: {} }} />
      <div className="ad-bhd">
        <h2>Bench</h2>
        <div className="ad-mpick" role="group" aria-label="Month">
          <button type="button" aria-label="Previous month" disabled={at === 0} onClick={() => step(-1)}>‹</button>
          <b aria-live="polite">{current.label}</b>
          <button type="button" aria-label="Next month" disabled={at === months.length - 1} onClick={() => step(1)}>›</button>
        </div>
      </div>
      <div className="ad-bnum">
        <b>{current.count}</b>
        <span>on the bench<small>{change === null ? "first month in view" : change === 0 ? `same as ${before.label}` : `${change > 0 ? "+" : "−"}${Math.abs(change)} vs ${before.label}`}</small></span>
      </div>
      <div className="ad-sbar" role="img" aria-label={current.count ? current.skills.map(([s, n]) => `${s} ${n}`).join(", ") : "Nobody on the bench"}>
        {current.skills.map(([s, n]) => <i key={s} style={{ flexGrow: n, background: skillColor(s) }} />)}
      </div>
      <ul className="ad-slab">{current.count ? current.skills.map(([s, n]) => <li key={s} style={{ ["--c" as string]: skillColor(s) }}>{s} {n}</li>) : <li className="none">Nobody on the bench this month</li>}</ul>
      <div className="ad-bfoot">
        <div className="ad-stack" aria-hidden="true">
          {current.people.slice(0, 5).map((p) => <i key={p.id} className={avatarClass(p.name)} title={`${p.name} · ${p.skill}`}>{p.initials}</i>)}
          {current.count > 5 && <i className="more">+{current.count - 5}</i>}
          {current.count === 0 && <i className="more">0</i>}
        </div>
        <AskButton label="Who are they?" className="ad-chip" name={`Ask amax who is on the bench in ${current.label}`}
          pin={{ label: `Bench by skill, ${current.label}`, tool: "get_capacity_forecast", args: {} }} prompt={`Who is on the bench in ${current.label}?`} />
      </div>
    </section>
  );
}
