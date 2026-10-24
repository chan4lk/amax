"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CellState } from "../server/grid";

// 073 AC-13/AC-17: a day's hours, its state as an icon and a word as well as a colour, and its projects on hover,
// focus or tap. The button is only a disclosure; it changes nothing.
const LOOK: Record<CellState, [string, string]> = {
  missing: ["✕", "Missing"], low: ["▲", "Low"], on_target: ["✓", "On target"], over: ["●", "Over"], not_yet: ["–", "Not yet"], leave: ["–", "On leave"], weekend: ["–", "Weekend"],
};
const GAP = 6, EDGE = 8;

type Props = { who: string; dayLabel: string; hours: number; state: CellState; projects: { name: string; hours: number }[] };

export function DayCell({ who, dayLabel, hours, state, projects }: Props) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const cell = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLSpanElement>(null);
  const [icon, word] = LOOK[state];
  const shown = hours ? hours.toFixed(1) : state === "leave" ? "leave" : "–";
  const detail = projects.length ? projects.map((p) => `${p.name} ${p.hours.toFixed(1)} h`).join(", ") : "nothing logged";
  // The breakdown is placed against the window, not the table (whose scroll box would clip it on the last rows):
  // under the cell when it fits, above it when it doesn't, and always inside the window's edges.
  const place = () => {
    if (!cell.current || !pop.current) return;
    const c = cell.current.getBoundingClientRect(), p = pop.current.getBoundingClientRect();
    const below = c.bottom + GAP + p.height <= window.innerHeight - EDGE;
    setAt({ top: below ? c.bottom + GAP : Math.max(EDGE, c.top - GAP - p.height), left: Math.min(Math.max(EDGE, c.right - p.width), window.innerWidth - p.width - EDGE) });
  };
  useLayoutEffect(() => { if (open) place(); else setAt(null); }, [open]);
  // The box follows its cell when the page or the table scrolls (focus scrolls a cell into view), or the window resizes.
  useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => { window.removeEventListener("scroll", place, true); window.removeEventListener("resize", place); };
  }, [open]);
  return (
    <span className="cellwrap" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button ref={cell} type="button" className={`cell ${state}`} aria-expanded={open} aria-label={`${who}, ${dayLabel}: ${hours.toFixed(1)} h, ${word.toLowerCase()}. ${detail}`}
        onClick={() => setOpen((o) => !o)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}>
        <span aria-hidden="true" className="glyph">{icon}</span> {shown}
      </button>
      {open && (
        <span ref={pop} role="tooltip" className="pop" style={{ position: "fixed", top: at?.top ?? 0, left: at?.left ?? 0, right: "auto", visibility: at ? "visible" : "hidden" }}>
          <b>{who}, {dayLabel}</b>{projects.length ? projects.map((p) => <span key={p.name}>{p.name}: {p.hours.toFixed(1)} h</span>) : <span>Nothing logged</span>}<small>{word}</small>
        </span>
      )}
    </span>
  );
}
