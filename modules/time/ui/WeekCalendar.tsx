"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { isoWeekOf } from "../week";

// 073 AC-21: the week picker's calendar. Weeks run Monday to Sunday; the shown week is highlighted as a range and the
// week under the pointer or focus is shaded. Arrows move a day or a week, Page Up/Down a month, Enter picks.
const DAY = 86_400_000;
const at = (d: string) => Date.parse(`${d}T00:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const add = (d: string, n: number) => iso(at(d) + n * DAY);
const mondayOf = (d: string) => add(d, -((new Date(at(d)).getUTCDay() + 6) % 7));
const fmt = (d: string, o: Intl.DateTimeFormatOptions) => new Date(at(d)).toLocaleDateString("en-US", { timeZone: "UTC", ...o });
function shiftMonth(d: string, n: number) {
  const x = new Date(at(d));
  const last = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + n + 1, 0)).getUTCDate();
  return iso(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + n, Math.min(x.getUTCDate(), last)));
}
function weeksOf(day: string) {
  const first = `${day.slice(0, 7)}-01`;
  const last = add(shiftMonth(first, 1), -1);
  const rows: string[][] = [];
  for (let m = mondayOf(first); m <= last; m = add(m, 7)) rows.push([0, 1, 2, 3, 4, 5, 6].map((i) => add(m, i)));
  return rows;
}
const MOVES: Record<string, (d: string) => string> = {
  ArrowLeft: (d) => add(d, -1), ArrowRight: (d) => add(d, 1), ArrowUp: (d) => add(d, -7), ArrowDown: (d) => add(d, 7),
  PageUp: (d) => shiftMonth(d, -1), PageDown: (d) => shiftMonth(d, 1), Home: (d) => mondayOf(d), End: (d) => add(mondayOf(d), 6),
};

type Props = { selected: string; today: string; onPick: (day: string) => void; onClose: () => void };

export function WeekCalendar({ selected, today, onPick, onClose }: Props) {
  const [active, setActive] = useState(selected);
  const [hover, setHover] = useState<string | null>(null);
  const grid = useRef<HTMLTableElement>(null);
  useEffect(() => { grid.current?.querySelector<HTMLButtonElement>(`button[data-day="${active}"]`)?.focus(); }, [active]);
  const key = (e: KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
    const move = MOVES[e.key];
    if (move) { e.preventDefault(); setActive(move(active)); }
  };
  const month = active.slice(0, 7);
  return (
    <div className="wkcal" role="dialog" aria-label="Choose a week" onKeyDown={key}>
      <div className="bar">
        <button type="button" aria-label="Previous month" onClick={() => setActive(shiftMonth(active, -1))}>‹</button>
        <b aria-live="polite">{fmt(active, { month: "long", year: "numeric" })}</b>
        <button type="button" aria-label="Next month" onClick={() => setActive(shiftMonth(active, 1))}>›</button>
      </div>
      <table ref={grid} role="grid" onMouseLeave={() => setHover(null)}>
        <thead><tr><th className="wn" scope="col"><abbr title="Week">Wk</abbr></th>{["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => <th key={d} scope="col">{d}</th>)}</tr></thead>
        <tbody>
          {weeksOf(active).map((days) => {
            const sel = days[0] === mondayOf(selected);
            return (
              <tr key={days[0]} className={`${sel ? "sel" : ""}${hover === days[0] ? " hov" : ""}`} onMouseEnter={() => setHover(days[0])}>
                <th scope="row" className="wn">{isoWeekOf(new Date(at(days[0]))).week}</th>
                {days.map((d) => (
                  <td key={d} role="gridcell" aria-selected={sel} className={`d${d.slice(0, 7) !== month ? " out" : ""}${d === today ? " today" : ""}`}>
                    <button type="button" data-day={d} tabIndex={d === active ? 0 : -1} aria-current={d === today ? "date" : undefined}
                      aria-label={fmt(d, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                      onFocus={() => setHover(days[0])} onClick={() => onPick(d)}>{Number(d.slice(8))}</button>
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="foot"><span>Picking a day opens its week</span><button type="button" onClick={() => onPick(today)}>This week</button></div>
    </div>
  );
}
