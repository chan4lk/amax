"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GridPerson } from "../server/grid";
import type { Group, ViewData } from "./types";

type Slot = "open" | "shut";

export const FOLD = 14, FIRST = 20, MORE = 24, SWEEP = 12;

export function useBoardRows(data: ViewData, group: Group, visible: Record<Group, string[]>) {
  const byId = useMemo(() => new Map<string, GridPerson>([...data.grids.all.people, ...data.grids.mine.people].map((p) => [p.personId, p])), [data]);
  const target = useMemo(() => visible[group].filter((id) => byId.has(id)).sort((a, b) => byId.get(a)!.name.localeCompare(byId.get(b)!.name)), [visible, group, byId]);
  const [slots, setSlots] = useState<Record<string, Slot>>(() => Object.fromEntries(target.slice(0, FOLD).map((id) => [id, "open"])));
  const [limit, setLimit] = useState(FIRST);
  const latest = useRef(slots);
  latest.current = slots;
  useEffect(() => {
    setLimit(FIRST);
    const wanted = new Set(target);
    setSlots((prev) => Object.fromEntries(Object.entries(prev).map(([id, s]) => [id, wanted.has(id) ? s : "shut"])));
    let gone = 0;
    const sweep = () => {
      const leaving = Object.keys(latest.current).filter((id) => !wanted.has(id));
      if (!leaving.length) return;
      const drop = new Set(leaving.slice(0, SWEEP));
      setSlots((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => !drop.has(id))));
      gone = window.setTimeout(sweep, 30);
    };
    gone = window.setTimeout(sweep, 750);
    const first = target.slice(0, FOLD);
    setSlots((prev) => ({ ...prev, ...Object.fromEntries(first.filter((id) => !(id in prev) || prev[id] === "shut").map((id) => [id, "shut" as Slot])) }));
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setSlots((prev) => ({ ...prev, ...Object.fromEntries(first.map((id) => [id, "open" as Slot])) }))));
    return () => { clearTimeout(gone); cancelAnimationFrame(raf); };
  }, [target]);
  const seen = useRef(target);
  useEffect(() => {
    const n = seen.current === target ? limit : FIRST;
    seen.current = target;
    setSlots((prev) => {
      const add = target.slice(0, n).filter((id) => !(id in prev) || prev[id] === "shut");
      return add.length ? { ...prev, ...Object.fromEntries(add.map((id) => [id, "open" as Slot])) } : prev;
    });
  }, [limit, target]);
  const more = useRef<HTMLDivElement>(null);
  const left = Math.max(0, target.length - limit);
  const shown = Object.keys(slots).filter((id) => byId.has(id)).sort((a, b) => byId.get(a)!.name.localeCompare(byId.get(b)!.name));
  const built = shown.length;
  useEffect(() => {
    const el = more.current;
    if (!el || !left) return;
    let armed = false;
    const check = () => {
      if (armed && el.getBoundingClientRect().top < window.innerHeight + 500) { armed = false; setLimit((l) => l + MORE); }
    };
    const arm = window.setTimeout(() => { armed = true; check(); }, 150);
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => { clearTimeout(arm); window.removeEventListener("scroll", check); window.removeEventListener("resize", check); };
  }, [left, built]);
  return { byId, target, slots, shown, left, more, showMore: () => setLimit((l) => l + MORE) };
}
