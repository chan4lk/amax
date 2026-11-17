"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import type { Group } from "../server/roster";
import type { ViewData } from "./data";
import { useSwap } from "./Glide";
import { bandOfPct, first } from "./look";

function ledeOf(d: ViewData, g: Group): ReactNode {
  const s = d.sides[g];
  if (s.pct === null) return <><b>{s.label}: no utilisation figure yet.</b> No logged hours you can see for {d.monthName} so far.</>;
  const under = s.rows.filter((p) => bandOfPct(p.pct, d.target) === "under"), behind = s.projects.rows.filter((r) => r.flag), none = s.rows.filter((p) => p.none).length;
  const names = under.map((p) => first(p.name));
  return (
    <>
      <b>{s.label}: {s.pct >= d.target ? "on track at " : "below target at "}{s.pct}%</b> against the {d.target}% target.{" "}
      {under.length > 0 && <>{names.slice(0, 3).join(", ")}{under.length > 3 ? ` and ${under.length - 3} more are` : under.length === 1 ? " is" : " are"} under target. </>}
      {behind.length > 0 && <>{behind.map((r) => r.name).join(" and ")}{behind.length === 1 ? " is" : " are"} more than {s.projects.limit}% off plan. </>}
      {none > 0 && <>{none} {none === 1 ? "person has" : "people have"} no time logged yet.</>}
    </>
  );
}

export function Lede({ d, group }: { d: ViewData; group: Group }) {
  const [g, dim] = useSwap(group);
  const ref = useRef<HTMLParagraphElement>(null);
  const h0 = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && dim) { h0.current = el.getBoundingClientRect().height; el.style.height = `${h0.current}px`; }
  }, [dim]);
  useLayoutEffect(() => {
    const el = ref.current, from = h0.current;
    if (!el || from === null) return;
    h0.current = null;
    el.style.height = "auto";
    const to = el.getBoundingClientRect().height;
    el.style.height = `${from}px`;
    void el.offsetWidth;
    el.style.height = `${to}px`;
    const t = setTimeout(() => { el.style.height = ""; }, 420);
    return () => clearTimeout(t);
  }, [g]);
  return <p ref={ref} className="lede" style={{ opacity: dim ? 0.35 : 1 }}>{ledeOf(d, g)}</p>;
}
