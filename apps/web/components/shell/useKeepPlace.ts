"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

const atMiddle = () => {
  const main = document.getElementById("main")?.getBoundingClientRect();
  const hit = main && document.elementFromPoint(main.left + main.width / 3, window.innerHeight / 2);
  return hit instanceof HTMLElement ? (hit.closest<HTMLElement>("tr, .card, p, h1, h2") ?? hit) : null;
};

export function useKeepPlace(chatOpen: boolean) {
  const picked = useRef<HTMLElement | null>(null);
  const first = useRef(true);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target.closest<HTMLElement>(".pinnable") : null;
      if (el && !el.closest("#chat")) picked.current = el;
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  useLayoutEffect(() => {
    if (first.current) { first.current = false; return; }
    const target = chatOpen && picked.current?.isConnected ? picked.current : null;
    picked.current = null;
    const anchor = target ?? atMiddle();
    if (!anchor) return;
    const top = anchor.getBoundingClientRect().top;
    const end = performance.now() + 400;
    let raf = 0;
    const hold = () => {
      window.scrollBy({ top: anchor.getBoundingClientRect().top - top, behavior: "instant" });
      if (performance.now() < end) raf = requestAnimationFrame(hold);
      else if (target) target.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    };
    raf = requestAnimationFrame(hold);
    return () => cancelAnimationFrame(raf);
  }, [chatOpen]);
}
