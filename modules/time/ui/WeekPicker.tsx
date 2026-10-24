"use client";

import { useEffect, useRef, useState } from "react";
import { isoWeekOf, weekKey } from "../week";
import { WeekCalendar } from "./WeekCalendar";
import "./week-picker.css";

const at = (d: string) => new Date(`${d}T00:00:00Z`);
const fmt = (d: string, o: Intl.DateTimeFormatOptions) => at(d).toLocaleDateString("en-US", { timeZone: "UTC", ...o });
const localToday = () => new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

/** 073 AC-21: beside the week arrows, the shown week as a button that opens a calendar; a day opens its week. Navigation only. */
export function WeekPicker({ base, monday }: { base: "" | "/my"; monday: string }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const sunday = at(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  const end = sunday.toISOString().slice(0, 10);
  const label = `${fmt(monday, { month: "short", day: "numeric" })} – ${fmt(end, { month: "short", day: "numeric" })}, ${end.slice(0, 4)}`;
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  const pick = (day: string) => window.location.assign(`/time${base}/${base ? "" : "w/"}${weekKey(isoWeekOf(at(day)))}`);
  return (
    <div className="wkwrap" ref={wrap}>
      <button ref={trigger} type="button" className="btn sm wkpick" aria-haspopup="dialog" aria-expanded={open} aria-label={`Week of ${label}. Choose a week`}
        onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
        {label}
      </button>
      {open && <WeekCalendar selected={monday} today={localToday()} onPick={pick} onClose={close} />}
    </div>
  );
}
