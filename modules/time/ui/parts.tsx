import type { Viewer } from "@amax/auth";
import { Card, EmptyState } from "@amax/ui";
import type { WeekStatus } from "../contracts";
import { notFound } from "next/navigation";
import { wantedWeek } from "../server/weeks";
import { isWeekend, shiftWeek, weekKey, weekPill, workDays, type IsoWeek } from "../week";
import { WeekPicker } from "./WeekPicker";
import "./time.css";

export const hrs = (n: number) => (n ? n.toFixed(1) : "–");
/** 073 AC-1: a column's name from its date, so a week with weekend hours shows Sat and Sun too. */
/** A day cell's label in the stacked phone layout, where the column heads are hidden. */
export const dayLabelFor = (day: string, mark: DayMark) => `${dayName(day)}${mark === "missing" ? " · Missing" : mark === "leave" ? " · On leave" : ""}`;
export const dayName = (day: string) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(`${day}T00:00:00Z`).getUTCDay()];
export type DayMark = "missing" | "leave" | undefined;
/** A day column head: Sat and Sun say "weekend"; My timesheet also marks Missing and On leave days (073). */
export function DayHead({ day, mark }: { day: string; mark?: DayMark }) {
  const end = isWeekend(day);
  return <th className={`num day${mark === "missing" ? " missing" : ""}`}>{dayName(day)}{end && <small className="weekend"> weekend</small>}{mark === "missing" && <small className="missing-tag"> Missing</small>}{mark === "leave" && <small className="weekend"> On leave</small>}</th>;
}
export const COLORS = ["var(--violet)", "var(--amber)", "var(--pink)", "var(--mint)"];
export const STATUS: Record<WeekStatus, [string, string]> = { draft: ["draft", "Draft"], submitted: ["good", "Submitted"], approved: ["good", "Approved"], rejected: ["bad", "Rejected"] };
export const initials = (name: string) => name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
export const avatar = (name: string) => `a${([...name].reduce((n, c) => n + c.charCodeAt(0), 0) % 4) + 1}`;

/** The week in a screen URL: absent is the latest week, anything wantedWeek refuses is a 404. */
export function weekParam(key: string | undefined): IsoWeek | undefined {
  try {
    return wantedWeek(key);
  } catch {
    notFound();
  }
}

export const weekHref = (base: "" | "/my", w: IsoWeek) => `/time${base || "/w"}/${weekKey(w)}`;

export const viewerOrNull = (viewer: unknown) => (viewer as Viewer | null) ?? null;

export const SignInFirst = () => (
  <Card><EmptyState icon="clock" title="Sign in to see timesheets" hint="Hours, approvals and your own timesheet come from the database once you're signed in." /></Card>
);

/** Time's three views. 077: Requests sits beside Team and My timesheet; from it, the other two open the current week. */
export function Views({ current, week }: { current: "team" | "my" | "requests"; week?: IsoWeek }) {
  const at = (v: typeof current) => (current === v ? "page" : undefined);
  return (
    <div className="seg" role="group" aria-label="View">
      <a href={week ? weekHref("", week) : "/time"} aria-current={at("team")}>Team</a>
      <a href={week ? weekHref("/my", week) : "/time/my"} aria-current={at("my")}>My timesheet</a>
      <a href="/time/requests" aria-current={at("requests")}>Requests</a>
    </div>
  );
}

/** 075 amendment 1: which week this is, beside the title: "Week 42 · Last week". */
function WeekPill({ week }: { week: IsoWeek }) {
  const p = weekPill(week, new Date());
  return <span className={`wk${p.now ? " now" : ""}`}><b>{p.name}</b><span aria-hidden="true"> · </span><span>{p.when}</span></span>;
}

export function Head({ title, lede, week, days, base }: { title: string; lede: string; week: IsoWeek; days: string[]; base: "" | "/my" }) {
  return (
    <div className="row head">
      <div><div className="title"><h1>{title}</h1><WeekPill week={week} /></div>{lede && <p className="lede">{lede}</p>}</div>
      <div className="actions">
        <Views current={base === "" ? "team" : "my"} week={week} />
        <a className="btn sm" aria-label="Previous week" href={weekHref(base, shiftWeek(week, -1))}>‹</a>
        <WeekPicker base={base} monday={workDays(week)[0]} last={days[days.length - 1]} />
        <a className="btn sm" aria-label="Next week" href={weekHref(base, shiftWeek(week, 1))}>›</a>
      </div>
    </div>
  );
}

/** Utilisation as a bar and its figure on one line, so the % sits on the row's text line (the footer's average lines up under it). */
export const Util = ({ pct }: { pct: number }) => <span className="util"><span className="ubar" aria-hidden="true"><i style={{ width: `${Math.min(100, pct)}%` }} /></span>{pct}%</span>;
