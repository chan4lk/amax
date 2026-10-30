import type { PersonUtilisation, TeamUtilisation } from "../contracts";
import { HOURS_PER_DAY, weekdays, type Range } from "./days";
import type { Inputs, Person } from "./inputs";

const tidy = (n: number) => Math.round(n * 100) / 100;
const pct = (billable: number, available: number | null) => (available && available > 0 ? Math.round((billable / available) * 100) : null);

/** The person's working days in the range with their FTE: weekdays they were employed, less their entity's holidays. */
export function workdays(p: Person, inputs: Inputs, range: Range): { day: string; fte: number }[] {
  const off = inputs.holidays.get(p.legalEntityId) ?? new Set<string>();
  const periods = inputs.periods.get(p.personId) ?? [];
  const fteOn = (day: string) => (periods.length ? periods.find((e) => e.startsOn <= day && (!e.endsOn || e.endsOn >= day))?.fte ?? 0 : 1);
  return weekdays(range.from, range.to).filter((d) => !off.has(d)).map((day) => ({ day, fte: fteOn(day) })).filter((d) => d.fte > 0);
}

/** Approved leave on the person's working days: days, hours and a label such as "2 days medical". */
export function leaveOn(p: Person, inputs: Inputs, days: { day: string; fte: number }[]) {
  let count = 0, hours = 0;
  const types = new Set<string>();
  for (const l of inputs.leave.get(p.personId) ?? []) {
    for (const d of days.filter((x) => x.day >= l.startsOn && x.day <= l.endsOn)) {
      const share = l.halfDay ? 0.5 : 1;
      count += share; hours += share * HOURS_PER_DAY * d.fte; types.add(l.type);
    }
  }
  const kind = types.size === 1 ? [...types][0] : "leave";
  return { days: count, hours, label: count ? `${count} ${count === 1 ? "day" : "days"} ${kind}` : null };
}

export function personFigures(p: Person, inputs: Inputs, range: Range): PersonUtilisation {
  const days = workdays(p, inputs, range);
  const contracted = days.reduce((n, d) => n + HOURS_PER_DAY * d.fte, 0);
  const leave = leaveOn(p, inputs, days);
  const logged = (inputs.hours.get(p.userId) ?? []).filter((h) => h.day >= range.from && h.day <= range.to);
  const loggedHours = tidy(logged.reduce((n, h) => n + h.hours, 0));
  const billableHours = tidy(logged.filter((h) => h.billable).reduce((n, h) => n + h.hours, 0));
  const leaveHidden = inputs.leaveOn && !p.leaveSeen;
  const availableHours = leaveHidden ? null : tidy(contracted - leave.hours);
  const hoursIncomplete = inputs.hoursUnknown.has(p.userId);
  return {
    userId: p.userId, personId: p.personId, name: p.name, initials: p.initials, legalEntityId: p.legalEntityId,
    contractedHours: tidy(contracted), leaveDays: leaveHidden ? null : leave.days, leaveLabel: leaveHidden ? null : leave.label, leaveHidden,
    availableHours, loggedHours, billableHours, utilisation: hoursIncomplete ? null : pct(billableHours, availableHours),
    ...(hoursIncomplete ? { hoursIncomplete: true } : {}),
  };
}

/** Per person with logged hours in the range, and the team: sums over the people whose available hours are known. */
export function utilisationOf(inputs: Inputs, range: Range): { rows: PersonUtilisation[]; team: TeamUtilisation } {
  const rows = inputs.people
    .filter((p) => inputs.hoursUnknown.has(p.userId) || (inputs.hours.get(p.userId) ?? []).some((h) => h.day >= range.from && h.day <= range.to))
    .map((p) => personFigures(p, inputs, range))
    .sort((a, b) => (b.utilisation ?? -1) - (a.utilisation ?? -1) || a.name.localeCompare(b.name));
  const counted = rows.filter((r) => r.availableHours !== null && !r.hoursIncomplete);
  const sum = (f: (r: PersonUtilisation) => number) => tidy(counted.reduce((n, r) => n + f(r), 0));
  const availableHours = sum((r) => r.availableHours ?? 0), billableHours = sum((r) => r.billableHours);
  return {
    rows,
    team: { from: range.from, to: range.to, people: counted.length, leftOut: rows.length - counted.length,
      leaveHidden: rows.filter((r) => r.availableHours === null).length, statusUnknown: rows.filter((r) => r.hoursIncomplete).length, availableHours, loggedHours: sum((r) => r.loggedHours), billableHours, utilisation: pct(billableHours, availableHours) },
  };
}
