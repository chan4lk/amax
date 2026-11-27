"use client";
import { useEffect, useState } from "react";

// 116 AC-5: a nudge's "Not now" is a read-only, per-browser preference (rule 1: no server write), kept in localStorage.
// Review round 1: keyed by the person, so on a shared browser one person's "Not now" doesn't hide it from another.
const keyOf = (viewerId: string) => `amax-snoozed:${viewerId}`;

export function useSnoozed(viewerId: string) {
  const KEY = keyOf(viewerId);
  const read = (): Record<string, number> => { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, number>; } catch { return {}; } };
  const [until, setUntil] = useState<Record<string, number>>({});
  useEffect(() => setUntil(read()), [KEY]);
  const snooze = (id: string, days: number) => {
    const next = { ...read(), [id]: Date.now() + days * 86_400_000 };
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked: hidden for this visit only */ }
    setUntil(next);
  };
  return { hidden: (id: string) => (until[id] ?? 0) > Date.now(), snooze };
}
