"use client";

import { useEffect, useState, type ReactNode } from "react";

const still = () => typeof window !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export function Reveal({ text, render }: { text: string; render: (shown: string) => ReactNode }) {
  const [n, setN] = useState(() => (still() ? text.length : 0));
  useEffect(() => {
    if (n >= text.length) return;
    const step = Math.max(3, Math.ceil(text.length / 60));
    const id = requestAnimationFrame(() => setN((x) => Math.min(text.length, x + step)));
    return () => cancelAnimationFrame(id);
  }, [n, text.length]);
  if (n >= text.length) return <>{render(text)}</>;
  return <><span className="sr">{text}</span><div aria-hidden="true">{render(text.slice(0, n))}</div></>;
}

const WAIT = [[0, "Thinking…"], [2500, "Checking the numbers…"], [7000, "Almost there…"]] as const;

export function Thinking() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const ids = WAIT.slice(1).map(([ms], k) => window.setTimeout(() => setI(k + 1), ms));
    return () => ids.forEach(window.clearTimeout);
  }, []);
  return <div className="thinking" aria-label="amax is thinking"><div className="dots" aria-hidden="true"><i /><i /><i /></div><span>{WAIT[i][1]}</span></div>;
}
