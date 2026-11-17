import type { PinRef } from "@amax/ui";
import { personPin, pulsePin, reportPin } from "../pins";
import { comingOf } from "./comingItems";
import type { Pulse } from "../server/pulse-types";
import { groupLabel, type Group } from "../server/roster";
import type { Report } from "../server/view";
import { overAvailable } from "../server/overtime";
import { avatar } from "./parts";

export type PersonRow = { id: string; name: string; initials: string; av: string; title: string; available: number | null; billable: number; logged: number; pct: number | null; none: boolean; note: string | null; pin: PinRef };
export type ProjectRow = { id: string; name: string; planned: number; logged: number; drift: number | null; flag: "behind" | "over" | null; pin: PinRef };
export type ComingItem = { id: string; sort: string; cls: "away" | "bad" | "warn"; when: string; soon: string; name: string; sub: string; av: string; mark?: string; pin: PinRef };
export type Side = {
  group: Group; label: string; pct: number | null; billable: number; available: number; logged: number; contracted: number; leave: number;
  counted: number; people: number; pace: number | null; trend: (number | null)[]; rows: PersonRow[];
  projects: { state: Pulse["hours"]["state"]; limit: number; rows: ProjectRow[] }; coming: { state: "ok" | "off"; items: ComingItem[] };
  notes: string[]; pin: PinRef;
};
export type ViewData = { month: string; monthName: string; year: string; span: string; workingDays: number; target: number; months: string[]; sides: Record<Group, Side> };

const round = (n: number) => Math.round(n * 10) / 10;
function paceOf(r: Report) {
  const a = r.availability;
  if (!a.range || !a.allocationsOn || r.team.utilisation === null) return null;
  const counted = new Set(r.rows.filter((x) => x.availableHours !== null && !x.hoursIncomplete && !x.noTime).map((x) => x.userId));
  const rest = a.rows.filter((x) => counted.has(x.userId) && x.availableHours !== null);
  const more = rest.reduce((n, x) => n + (x.availableHours ?? 0), 0);
  const planned = rest.reduce((n, x) => n + ((x.allocated ?? 0) / 100) * (x.availableHours ?? 0), 0);
  const total = r.team.availableHours + more;
  return total ? Math.round(((r.team.billableHours + Math.min(planned, more)) / total) * 100) : null;
}

export function sideOf(r: Report, p: Pulse): Side {
  const t = r.team;
  const counted = r.rows.filter((x) => x.availableHours !== null && !x.hoursIncomplete && !x.noTime);
  const contracted = round(counted.reduce((n, x) => n + x.contractedHours, 0));
  const rows = r.rows.map((x): PersonRow => ({
    id: x.userId, name: x.name, initials: x.initials, av: avatar(x.name), title: r.titles[x.userId] ?? "",
    available: x.availableHours, billable: x.billableHours, logged: x.loggedHours, pct: x.utilisation, none: x.utilisation === null,
    note: x.leaveHidden ? "leave not visible" : x.hoursIncomplete ? "some hours' status unknown" : ([x.leaveLabel, (() => { const o = overAvailable(x.loggedHours, x.availableHours); return o === null ? null : `${o} h over available`; })()].filter(Boolean).join(" · ") || null), pin: personPin(x, r.month, r.monthName),
  }));
  return {
    group: r.group, label: groupLabel(r.group), pct: t.utilisation, billable: t.billableHours, available: t.availableHours, logged: t.loggedHours,
    contracted, leave: round(Math.max(0, contracted - t.availableHours)), counted: t.people, people: r.rows.length, pace: paceOf(r),
    trend: r.trend.map((x) => x.utilisation), rows,
    projects: { state: p.hours.state, limit: p.hours.limit, rows: p.hours.rows.map((x) => ({ id: x.projectId, name: x.name, planned: x.planned, logged: x.logged, drift: x.drift, flag: x.flag, pin: pulsePin(`${x.name}, hours vs plan`, "hours", x.projectId) })) },
    coming: { state: p.away.state === "off" && p.allocation.state === "off" ? "off" : "ok", items: comingOf(p, r.range.to) },
    notes: r.notes, pin: reportPin(`Utilisation in ${r.monthName}, ${groupLabel(r.group).toLowerCase()}`, r.month, r.group),
  };
}

export const viewDataOf = (mine: Report, mp: Pulse, everyone: Report, ep: Pulse): ViewData => ({
  month: everyone.month, monthName: everyone.monthName, year: everyone.month.slice(0, 4), span: everyone.span, workingDays: everyone.workingDays, target: everyone.target,
  months: everyone.trend.map((x) => x.label), sides: { mine: sideOf(mine, mp), everyone: sideOf(everyone, ep) },
});
