"use client";

import { useLayoutEffect, useRef } from "react";
import { PinButton } from "@amax/ui";
import { pulsePin } from "../pins";
import type { Group } from "../server/roster";
import type { ComingItem, ViewData } from "./data";
import { calm } from "./Glide";

export function ComingLine({ d, group }: { d: ViewData; group: Group }) {
  const cur = d.sides[group].coming, other = d.sides[group === "everyone" ? "mine" : "everyone"].coming;
  const ids = new Set(cur.items.map((x) => x.id));
  const all: ComingItem[] = [...cur.items, ...other.items.filter((x) => !ids.has(x.id))];
  all.sort((a, b) => a.sort.localeCompare(b.sort));
  const box = useRef<HTMLDivElement>(null);
  const firstIds = useRef(ids).current;
  const first = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const visible = (el: HTMLElement) => ids.has(el.dataset.id!);
  useLayoutEffect(() => {
    const els = [...(box.current?.querySelectorAll<HTMLElement>(".tn") ?? [])];
    clearTimeout(timer.current);
    els.forEach((e) => e.classList.remove("leaving", "pre"));
    if (first.current || calm()) { first.current = false; els.forEach((e) => { e.hidden = !visible(e); }); return; }
    const before = new Map(els.filter((e) => !e.hidden).map((e) => [e, e.getBoundingClientRect()]));
    const leaving = els.filter((e) => !e.hidden && !visible(e)), entering = els.filter((e) => e.hidden && visible(e));
    leaving.forEach((e) => e.classList.add("leaving"));
    timer.current = setTimeout(() => {
      leaving.forEach((e) => { e.hidden = true; e.classList.remove("leaving"); });
      entering.forEach((e) => { e.hidden = false; e.classList.add("pre"); });
      els.filter((e) => !e.hidden && before.has(e) && !entering.includes(e)).forEach((e) => {
        const a = before.get(e)!, b = e.getBoundingClientRect(), dx = a.left - b.left, dy = a.top - b.top;
        if (dx || dy) e.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: "none" }], { duration: 480, easing: "cubic-bezier(.2,.8,.2,1)" });
      });
      requestAnimationFrame(() => requestAnimationFrame(() => entering.forEach((e) => e.classList.remove("pre"))));
    }, leaving.length ? 230 : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group]);
  useLayoutEffect(() => () => clearTimeout(timer.current), []);
  return (
    <section className="card b-coming pinnable">
      <PinButton pin={pulsePin("Coming up", "capacity")} />
      <h2>Coming up</h2>
      <span className="muted">the next two weeks and the next months</span>
      {cur.state === "off" ? <p className="none2">Leave and Allocations are not installed.</p> : !cur.items.length && <p className="none2">Nothing coming up: nobody away, nobody over, nobody on the bench.</p>}
      <div className="tl" ref={box}>
        {all.map((x) => (
          <div key={x.id} data-id={x.id} className={`tn ${x.cls}`} hidden={!firstIds.has(x.id)}>
            <span className="when">{x.when} <em>· {x.soon}</em></span>
            <div className="tc pinnable">
              <PinButton pin={x.pin} />
              <span className={`av ${x.av}`} aria-hidden="true">{x.mark}</span>
              <div><b>{x.name}</b><small>{x.sub}</small></div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
