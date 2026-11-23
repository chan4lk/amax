"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { openChat, PinButton, type PinRef } from "@amax/ui";
import type { Group } from "../server/roster";
import type { ViewData } from "./data";
import { useSwap } from "./Glide";
import { AttentionRow } from "./AttentionRow";
import { TABS, idOf, itemsOf, lbl, tab } from "./attentionItems";

export { itemsOf } from "./attentionItems";

export function Attention({ d, group }: { d: ViewData; group: Group }) {
  const [g, dim] = useSwap(group);
  const list = itemsOf(d, g);
  const [idx, setIdx] = useState(0);
  const [hold, setHold] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => setIdx(0), [g]);
  const i = idx < list.length ? idx : 0;
  const n = list.length;
  const key = (e: KeyboardEvent) => {
    if (n > 1 && (e.key === "ArrowRight" || e.key === "ArrowLeft")) { e.preventDefault(); setIdx((i + (e.key === "ArrowRight" ? 1 : n - 1)) % n); }
  };
  const act = (prompt: string, pin: PinRef) => { setHold(true); openChat({ pin, prompt }); };
  useEffect(() => {
    if (!hold) return;
    const t = setTimeout(() => setHold(false), 20_000);
    return () => clearTimeout(t);
  }, [hold]);
  const x = list[i];
  const start = Math.max(0, Math.min(i - 3, n - TABS));
  return (
    <section className="card attn b-attn pinnable" style={{ opacity: dim ? 0.35 : 1 }} aria-label="Needs attention">
      {x && <PinButton pin={x.k === "proj" ? x.r.pin : x.k === "nogroup" ? x.pin : x.p.pin} />}
      {!x ? <div className="r-allgood">Nothing needs attention</div> : (
        <>
          <div ref={wrap} className={hold ? "stk-wrap hold" : "stk-wrap"} tabIndex={0} role="group" aria-label="Needs attention, use the left and right arrow keys to browse" onKeyDown={key}>
            <div className="stk-tabs">
              {list.map((y, k) => ({ y, k })).slice(start, start + TABS).map(({ y, k }) => (
                <button key={`${y.k}${idOf(y)}`} type="button" tabIndex={-1} aria-hidden="true" className={k === i ? "on" : undefined} title={lbl(y)} onClick={() => setIdx(k)}
                  onAnimationEnd={(e) => { if (e.animationName.endsWith("stkfill") && !hold && n > 1) setIdx((i + 1) % n); }}>
                  <i /><b>{tab(y)}</b>{k === i && <span>{lbl(y)}</span>}
                </button>
              ))}
            </div>
            <div className="stk-meta"><b>Needs attention</b> · {i + 1} of {n}{n > 1 ? " · changes every few seconds" : ""}</div>
          </div>
          <div aria-live="polite"><AttentionRow key={`${g}${i}`} x={x} d={d} act={act} /></div>
        </>
      )}
    </section>
  );
}
