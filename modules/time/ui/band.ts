import type { WeekStatus } from "../contracts";

// 075: the figures behind Team time's status band: who has submitted, and who logged the hours.
type Row = { status: WeekStatus; total: number; agentHours: number };
export type BandKey = WeekStatus | "not_started";

/** Each status in the band's order, with the grid filter it opens (its icon is BandIcon, so colour is never the only signal). */
export const STATUSES: { key: BandKey; label: string; filter: string }[] = [
  { key: "approved", label: "approved", filter: "approved" },
  { key: "submitted", label: "submitted", filter: "submitted" },
  { key: "rejected", label: "sent back", filter: "rejected" },
  { key: "draft", label: "draft", filter: "not_submitted" },
  { key: "not_started", label: "not started", filter: "not_submitted" },
];

const round1 = (n: number) => Math.round(n * 10) / 10;

export function bandOf(rows: Row[], notStarted: number) {
  const count = (key: BandKey) => (key === "not_started" ? notStarted : rows.filter((r) => r.status === key).length);
  const segments = STATUSES.map((s) => ({ ...s, count: count(s.key) })).filter((s) => s.count > 0);
  const hours = round1(rows.reduce((n, r) => n + r.total, 0));
  const agent = round1(rows.reduce((n, r) => n + r.agentHours, 0));
  const agentPct = hours ? Math.round((agent / hours) * 100) : 0;
  return {
    everyone: rows.length + notStarted,
    sent: count("approved") + count("submitted"),
    segments,
    hours,
    agent,
    people: round1(Math.max(0, hours - agent)),
    agentPct,
    peoplePct: hours ? 100 - agentPct : 0,
  };
}
export type Band = ReturnType<typeof bandOf>;

/** 075 amendment 2: My timesheet's slim band: the week's hours against the person's target, and who logged them. */
export function myBandOf(m: { total: number; agentHours: number; target: number }) {
  const hours = round1(m.total);
  const agent = round1(m.agentHours);
  const agentPct = hours ? Math.round((agent / hours) * 100) : 0;
  return { hours, target: m.target, pct: m.target ? Math.round((hours / m.target) * 100) : 0, agent, mine: round1(Math.max(0, hours - agent)), agentPct, minePct: hours ? 100 - agentPct : 0 };
}
