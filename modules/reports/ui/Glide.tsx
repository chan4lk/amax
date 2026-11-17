"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

export const calm = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function Glide({ value, format, className, style }: { value: number; format: (n: number) => string; className?: string; style?: CSSProperties }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);
  const fmt = useRef(format);
  fmt.current = format;
  useEffect(() => {
    const el = ref.current;
    const from = shown.current;
    if (!el || from === value || calm()) { shown.current = value; if (el) el.textContent = fmt.current(value); return; }
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 420), e = 1 - Math.pow(1 - k, 3);
      shown.current = Math.round(from + (value - from) * e);
      el.textContent = fmt.current(shown.current);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); shown.current = value; };
  }, [value]);
  return <span ref={ref} className={className} style={style} suppressHydrationWarning>{format(value)}</span>;
}

export function useSwap<T>(value: T): [T, boolean] {
  const [shown, setShown] = useState(value);
  const [dim, setDim] = useState(false);
  useEffect(() => {
    if (Object.is(value, shown)) return;
    if (calm()) { setShown(value); return; }
    setDim(true);
    const t = setTimeout(() => { setShown(value); setDim(false); }, 140);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return [shown, dim];
}
