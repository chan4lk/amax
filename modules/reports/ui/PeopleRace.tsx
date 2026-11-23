"use client";

import { useLayoutEffect, useRef } from "react";
import { PinButton } from "@amax/ui";
import { reportPin } from "../pins";
import type { Group } from "../server/roster";
import type { PersonRow, ViewData } from "./data";
import { Glide } from "./Glide";
import { BAND_COLOR, bandOfPct, type Band } from "./look";

const ROW = 56, CAP = 15;
const BANDS: Record<Band, string> = { under: "people under target", on: "people on target", over: "people over 100%", none: "people with no time yet" };
const COUNTS: [Band, string][] = [["under", "under target"], ["on", "on target"], ["over", "over 100%"], ["none", "no time yet"]];

export function PeopleRace({ d, group, ready, band, find }: { d: ViewData; group: Group; ready: boolean; band?: Band; find?: string }) {
  const s = d.sides[group];
  const rank = (rows: PersonRow[]) => rows.slice().sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || a.name.localeCompare(b.name)).slice(0, CAP);
  const shown = rank(s.rows), rest = s.rows.length - shown.length;
  const byId = new Map<string, PersonRow>();
  for (const p of rank(d.sides[group === "everyone" ? "mine" : "everyone"].rows)) byId.set(p.id, p);
  for (const p of shown) byId.set(p.id, p);
  const pos = new Map(shown.map((p, i) => [p.id, i]));
  const bandOf = (p: PersonRow) => bandOfPct(p.pct, d.target);
  const dim = (p: PersonRow) => (band ? bandOf(p) !== band : false) || (find ? !p.name.toLowerCase().includes(find.toLowerCase()) : false);
  const was = useRef(new Set(shown.map((p) => p.id)));
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const prev = was.current;
    box.current?.querySelectorAll<HTMLElement>(".rr").forEach((el) => {
      const id = el.dataset.id!;
      if (pos.has(id) && !prev.has(id)) { el.style.transition = "none"; void el.offsetWidth; el.style.transition = ""; }
    });
    was.current = new Set(shown.map((p) => p.id));
  });
  const showing = band || find ? `${[band ? BANDS[band] : null, find ? `names with "${find}"` : null].filter(Boolean).join(", ")}` : null;
  return (
    <section className="card b-people pinnable" aria-label="People">
      <PinButton pin={reportPin(`People, ${d.monthName}, ${s.label.toLowerCase()}`, d.month, group)} />
      <div className="ph2">
        <h2>People</h2>
        <span className="muted">{s.label} · {s.rows.length} {s.rows.length === 1 ? "person" : "people"}, ranked by utilisation</span>
        <div className="showing" aria-live="polite">{showing ? <>Showing <b>{showing}</b> · ask amax to show everyone</> : "Showing everyone in this group · ask amax to filter"}</div>
      </div>
      <div className="pcounts">
        {COUNTS.map(([k, label]) => (
          <span key={k} className={`cc ${k} pinnable`}><PinButton pin={reportPin(`${s.label}: ${label}, ${d.monthName}`, d.month, group)} /><i /><Glide className="cb" value={s.rows.filter((p) => bandOf(p) === k).length} format={String} />&nbsp;{label}</span>
        ))}
      </div>
      <div className="race" ref={box} style={{ height: shown.length * ROW }}>
        {[...byId.values()].sort((a, b) => a.id.localeCompare(b.id)).map((p) => {
          const at = pos.get(p.id), inn = at !== undefined, b = bandOf(p), w = p.none ? 0 : Math.min(100, p.pct ?? 0);
          return (
            <div key={p.id} data-id={p.id} data-person={p.name} className={`rr pinnable${p.none ? " none" : ""}${inn ? "" : " gone"}${inn && dim(p) ? " dim" : ""}`}
              style={{ ["--bc" as string]: BAND_COLOR[b], ...(inn ? { transform: `translateY(${at * ROW}px)` } : {}) }} inert={!inn || undefined} aria-hidden={!inn || undefined}>
              <PinButton pin={p.pin} />
              <div className="who">
                <span className={`av ${p.av}`} aria-hidden="true">{p.initials}</span>
                <div><b>{p.name}{p.note && !p.none && <span className="nt">{p.note}</span>}</b><small>{p.title}</small></div>
              </div>
              <div className="trk">
                <i style={{ width: ready && inn ? `${w}%` : "0%" }} />
                <u style={{ left: `${d.target}%` }} />
                {p.none ? <em className="r-nt">no time yet</em> : <em className={b === "over" ? "bad" : b === "under" ? "warnc" : "good"} style={{ left: `calc(${w}% - 34px)` }}>{p.pct}%</em>}
              </div>
              <div className="hrs">{p.none ? (p.available === null ? "leave not visible" : `${p.available} h available`) : <>{p.billable} of {p.available} h<small>{p.logged} h logged</small></>}</div>
            </div>
          );
        })}
      </div>
      {rest > 0 && <p className="r-more">and <b>{rest} more</b>, lower in the ranking · every person is in the table below</p>}
    </section>
  );
}
