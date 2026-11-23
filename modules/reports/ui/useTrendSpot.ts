"use client";

import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent as ReactMouse, type PointerEvent } from "react";

export type Spot = { k: number; left: number; top: number };

export function useTrendSpot(group: string) {
  const [spot, setSpot] = useState<Spot | null>(null);
  const pinned = useRef<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const close = () => setSpot(null);
  const open = (k: number, el: Element) => {
    const r = wrap.current!.getBoundingClientRect(), b = el.getBoundingClientRect();
    let left = b.right - r.left + 14;
    if (left + 262 > r.width) left = b.left - r.left - 262 - 14;
    setSpot({ k, left: Math.max(0, left), top: Math.max(4, b.top - r.top - 26) });
  };
  useEffect(() => {
    const out = (e: MouseEvent) => { if (pinned.current !== null && !wrap.current?.contains(e.target as Node)) { pinned.current = null; close(); } };
    const esc = (e: KeyboardEvent | globalThis.KeyboardEvent) => { if (e.key === "Escape" && pinned.current !== null) { pinned.current = null; close(); } };
    document.addEventListener("click", out);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("click", out); document.removeEventListener("keydown", esc); };
  }, []);
  useEffect(() => { pinned.current = null; close(); }, [group]);
  const bind = (k: number) => ({
    onPointerEnter: (e: PointerEvent<SVGCircleElement>) => { if (pinned.current === null) open(k, e.currentTarget); },
    onPointerLeave: () => { if (pinned.current === null) close(); },
    onFocus: (e: FocusEvent<SVGCircleElement>) => { if (pinned.current === null) open(k, e.currentTarget); },
    onBlur: () => { if (pinned.current === null) close(); },
    onClick: (e: ReactMouse<SVGCircleElement>) => { e.stopPropagation(); if (pinned.current === k) { pinned.current = null; close(); } else { pinned.current = k; open(k, e.currentTarget); } },
    onKeyDown: (e: KeyboardEvent<SVGCircleElement>) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.currentTarget.dispatchEvent(new MouseEvent("click", { bubbles: true })); } },
  });
  return { spot, wrap, bind };
}
