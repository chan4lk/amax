// 104 AC-3: hours from commit times, one person on one proposal. Pure, so the sync and its table test share one rule.
// A person's commits less than GAP apart are one session; a session counts from LEAD before its first commit to its
// last (a lone commit is LEAD). Days are the person's own (review round 1: their legal entity's zone, Time's day rule),
// so a session that crosses their midnight is split by day, and every day it touches names the session's commits.
// Each day's sessions are summed, rounded to a quarter hour and capped at CAP. The result is an estimate for the person
// to accept or correct, never a logged entry (AC-4).

export const GAP_MS = 90 * 60_000;
export const LEAD_MS = 30 * 60_000;
export const CAP_HOURS = 8;

export type DayEstimate = { day: string; hours: number; commits: number };

/** The calendar day of `ms` in `zone` (YYYY-MM-DD). */
export const dayIn = (zone: string) => {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" });
  return (ms: number) => f.format(new Date(ms));
};

/** The first instant after `ms` that falls on the next day in the zone (found by halving, so DST shifts are handled). */
function nextMidnight(ms: number, dayOf: (ms: number) => string) {
  const today = dayOf(ms);
  let lo = ms, hi = ms + 26 * 3_600_000;
  while (hi - lo > 1000) {
    const mid = Math.floor((lo + hi) / 2);
    if (dayOf(mid) === today) lo = mid; else hi = mid;
  }
  return hi;
}

const quarter = (h: number) => Math.round(h * 4) / 4;

type Session = { from: number; to: number; commits: number };

function sessionsOf(times: number[]): Session[] {
  const out: Session[] = [];
  for (const t of [...times].sort((a, b) => a - b)) {
    const last = out.at(-1);
    if (last && t - last.to < GAP_MS) { last.to = t; last.commits++; } else out.push({ from: t - LEAD_MS, to: t, commits: 1 });
  }
  return out;
}

/** Hours per local day (in `zone`) for one person's commits on one proposal; days with nothing are left out. */
export function estimateDays(commitTimes: string[], zone = "UTC"): DayEstimate[] {
  const dayOf = dayIn(zone);
  const byDay = new Map<string, { ms: number; commits: number }>();
  const add = (day: string, ms: number, commits: number) => {
    const d = byDay.get(day) ?? { ms: 0, commits: 0 };
    byDay.set(day, { ms: d.ms + ms, commits: d.commits + commits });
  };
  for (const s of sessionsOf(commitTimes.map((t) => Date.parse(t)).filter(Number.isFinite))) {
    let from = s.from;
    while (dayOf(from) !== dayOf(s.to)) {
      const midnight = nextMidnight(from, dayOf);
      add(dayOf(from), midnight - from, s.commits);
      from = midnight;
    }
    add(dayOf(from), s.to - from, s.commits);
  }
  return [...byDay].sort(([a], [b]) => a.localeCompare(b))
    .map(([day, d]) => ({ day, hours: Math.min(CAP_HOURS, quarter(d.ms / 3_600_000)), commits: d.commits }))
    .filter((d) => d.hours > 0);
}
