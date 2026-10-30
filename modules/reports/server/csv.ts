import type { Availability } from "./availability";
import type { Report } from "./view";

// A cell that opens with a formula trigger (= + - @, tab, CR) is prefixed with a quote, so Excel and
// Sheets show it as text instead of running it; every cell is quoted and inner quotes doubled.
const TRIGGER = /^[=+\-@\t\r]/;
export const csvCell = (value: string) => `"${(TRIGGER.test(value) ? `'${value}` : value).replace(/"/g, '""')}"`;
export const csvText = (rows: string[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\r\n");

const n = (v: number | null) => (v === null ? "" : String(v));

export const utilisationCsv = (r: Report) => csvText([
  ["Person", "Available h", "Leave", "Logged h", "Billable h", "Utilisation %"],
  ...r.rows.map((x) => [x.name, n(x.availableHours), [x.leaveHidden ? "Not visible to you" : (x.leaveLabel ?? ""), x.hoursIncomplete ? "Timesheet status unknown" : ""].filter(Boolean).join("; "), n(x.loggedHours), n(x.billableHours), n(x.utilisation)]),
  ["Team", n(r.team.availableHours), [r.team.leaveHidden ? `${r.team.leaveHidden} left out: leave not visible` : "", r.team.statusUnknown ? `${r.team.statusUnknown} left out: timesheet status unknown` : ""].filter(Boolean).join("; "), n(r.team.loggedHours), n(r.team.billableHours), n(r.team.utilisation)],
]);

export const availabilityCsv = (a: Availability) => csvText([
  ["Person", "Working days left", "Leave", "Available h", "Allocated %", "Free h"],
  ...a.rows.map((x) => [x.name, n(x.workdays), x.leaveLabel ?? "", n(x.availableHours), n(x.allocated), n(x.freeHours)]),
]);
