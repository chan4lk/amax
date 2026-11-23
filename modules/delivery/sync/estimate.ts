// 104 AC-3: hours from commit times, one person on one proposal. Pure, so the sync and its table test share one rule.
// A person's commits less than GAP apart are one session; a session counts from LEAD before its first commit to its
// last (a lone commit is LEAD). Days are the person's own (review round 1: their legal entity's zone, Time's day rule).
// A session that crosses their midnight is split by day. Review round 2: each day names the commits made on it, its
// count and ids from that one set, and time on a day with none of the session's commits (a lead-in before midnight) goes
// to the day of the session's first commit. Each day's sessions are summed, rounded to a quarter hour and capped at CAP.
// The result is an estimate for the person to accept or correct, never a logged entry (AC-4).

export const GAP_MS = 90 * 60_000;
export const LEAD_MS = 30 * 60_000;
export const CAP_HOURS = 8;

export type Stamped = { id: string; at: string };
export type DayEstimate = { day: string; hours: number; commits: number; ids: string[] };

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

type Point = { id: string; ms: number };
type Session = { from: number; to: number; points: Point[] };

function sessionsOf(points: Point[]): Session[] {
  const out: Session[] = [];
  for (const p of [...points].sort((a, b) => a.ms - b.ms)) {
    const last = out.at(-1);
    if (last && p.ms - last.to < GAP_MS) { last.to = p.ms; last.points.push(p); } else out.push({ from: p.ms - LEAD_MS, to: p.ms, points: [p] });
  }
  return out;
}

/** The session's time by day: each piece between midnights, a piece with no commit of its own moved to the first commit's day. */
function slices(s: Session, dayOf: (ms: number) => string) {
  const pieces: { day: string; ms: number }[] = [];
  for (let from = s.from; ; ) {
    const end = dayOf(from) === dayOf(s.to) ? s.to : nextMidnight(from, dayOf);
    pieces.push({ day: dayOf(from), ms: end - from });
    if (end === s.to) break;
    from = end;
  }
  const own = new Set(s.points.map((p) => dayOf(p.ms)));
  const first = dayOf(s.points[0].ms);
  return pieces.map((p) => (own.has(p.day) ? p : { ...p, day: first }));
}

/** Hours per local day (in `zone`) for one person's commits on one proposal; days with nothing are left out. */
export function estimateDays(commits: Stamped[], zone = "UTC"): DayEstimate[] {
  const dayOf = dayIn(zone);
  const points = commits.map((c) => ({ id: c.id, ms: Date.parse(c.at) })).filter((p) => Number.isFinite(p.ms));
  const byDay = new Map<string, { ms: number; ids: string[] }>();
  for (const s of sessionsOf(points)) {
    for (const p of slices(s, dayOf)) {
      const d = byDay.get(p.day) ?? { ms: 0, ids: [] };
      byDay.set(p.day, { ms: d.ms + p.ms, ids: d.ids });
    }
    for (const p of s.points) byDay.get(dayOf(p.ms))!.ids.push(p.id);
  }
  return [...byDay].sort(([a], [b]) => a.localeCompare(b))
    .map(([day, d]) => ({ day, hours: Math.min(CAP_HOURS, quarter(d.ms / 3_600_000)), commits: d.ids.length, ids: d.ids }))
    .filter((d) => d.hours > 0);
}
