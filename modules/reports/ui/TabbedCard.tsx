"use client";

import { useState, type MouseEvent, type ReactNode } from "react";

export type Panel = { key: string; label: string; href: string; name: string; sub: ReactNode; actions: ReactNode; pin: ReactNode; body: ReactNode };

export function TabbedCard({ initial, panels }: { initial: string; panels: Panel[] }) {
  const [current, setCurrent] = useState(initial);
  const open = panels.find((p) => p.key === current) ?? panels[0];
  const pick = (p: Panel) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    setCurrent(p.key);
    window.history.replaceState(window.history.state, "", p.href);
  };
  return (
    <section className="card flush pinnable people-card" aria-label={open.name}>
      <div className="card-head">
        <nav className="seg" aria-label="Report">
          {panels.map((p) => <a key={p.key} href={p.href} onClick={pick(p)} aria-current={p.key === open.key ? "page" : undefined}>{p.label}</a>)}
        </nav>
        <span className="head-sub">{open.sub}</span>
        <div className="actions">{open.actions}</div>
        {open.pin}
      </div>
      <div className="panel" key={open.key}>{open.body}</div>
    </section>
  );
}
