import { shortDay } from "./days";
import { h, names, pct, type Section } from "./export-blocks";
import { overAvailable } from "./overtime";

export const utilisation: Section = {
  summary: (d) => `Between ${d.period}, ${h(d.team.billableHours)} of ${h(d.team.availableHours)} available was billable: utilisation of ${pct(d.team.utilisation)} against a ${d.target}% target.`,
  figures: (d) => [["Utilisation", pct(d.team.utilisation), `target ${d.target}%`], ["Billable hours", h(d.team.billableHours), `of ${h(d.team.availableHours)} available`]],
  findings: (d) => [
    ...d.rows.filter((r) => r.utilisation !== null && r.utilisation < d.target).map((r) => `${r.name} is at ${pct(r.utilisation)}, ${d.target - r.utilisation!} points under target (${h(r.billableHours)} billable of ${h(r.availableHours)}).`),
    ...d.rows.flatMap((r) => { const over = overAvailable(r.loggedHours, r.availableHours); return over === null ? [] : [`${r.name} logged ${h(r.loggedHours)}, ${h(over)} more than the ${h(r.availableHours)} available.`]; }),
  ],
  body: (doc, d) => doc.heading("Utilisation by person").table(`Utilisation, ${d.period}`, ["Person", "Available", "Logged", "Billable", "Utilisation", "vs target", "Note"],
    d.rows.map((r) => [r.name, h(r.availableHours), h(r.loggedHours), h(r.billableHours), pct(r.utilisation), r.utilisation === null ? "—" : `${r.utilisation >= d.target ? "+" : ""}${r.utilisation - d.target} pts`, [r.leaveLabel, r.noTime ? "no submitted time" : null, (() => { const o = overAvailable(r.loggedHours, r.availableHours); return o === null ? null : `${h(o)} more than available`; })()].filter(Boolean).join(", ")]),
    [false, true, true, true, true, true, false], d.rows.length > 1 ? ["Team", h(d.team.availableHours), h(d.team.loggedHours), h(d.team.billableHours), pct(d.team.utilisation), "", ""] : undefined),
  method: ["Utilisation is billable hours divided by available hours; available hours are 8 hours a working day times FTE, less holidays and approved leave. Only submitted or approved time counts."],
};

const whose = (d: { scope: string }) => (d.scope === "Everyone" || d.scope === "Your people" ? "team utilisation" : `utilisation of ${d.scope}`);

export const trend: Section = {
  summary: (d) => {
    const seen = d.trend.filter((t) => t.utilisation !== null);
    return seen.length > 1 ? `Over the last twelve months ${whose(d)} moved from ${pct(seen[0].utilisation)} in ${seen[0].label} to ${pct(seen[seen.length - 1].utilisation)} in ${seen[seen.length - 1].label}.` : null;
  },
  figures: () => [],
  findings: () => [],
  body: (doc, d) => doc.heading("Trend").chart(`${whose(d)} per month against the ${d.target}% target`, d)
    .table(`${whose(d)[0].toUpperCase()}${whose(d).slice(1)} per month`, ["Month", ...d.trend.map((x) => x.label)], [["Utilisation", ...d.trend.map((x) => pct(x.utilisation))]], [false, ...d.trend.map(() => true)]),
};

export const availability: Section = {
  summary: (d) => {
    const free = d.availability.reduce((n, x) => n + (x.freeHours ?? 0), 0), with_ = d.availability.filter((x) => (x.freeHours ?? 0) > 0);
    return `For ${d.window}, ${h(free)} is free across ${d.availability.length} ${d.availability.length === 1 ? "person" : "people"}${with_.length ? `, with ${names(with_.map((x) => `${x.name} (${h(x.freeHours)})`))}` : "; nobody has free time"}.`;
  },
  figures: (d) => [["Free hours", h(d.availability.reduce((n, x) => n + (x.freeHours ?? 0), 0)), d.window], ["Available hours", h(d.availability.reduce((n, x) => n + (x.availableHours ?? 0), 0)), "after holidays and leave"]],
  findings: (d) => d.availability.filter((x) => (x.allocated ?? 0) > 100).map((x) => `${x.name} is allocated at ${x.allocated}%, above capacity, with no free time.`),
  body: (doc, d) => doc.heading("Availability by person").table(`Availability for ${d.window}`, ["Person", "Working days left", "Available", "Allocated", "Free", "Leave"],
    d.availability.map((x) => [x.name, String(x.workdays ?? "—"), h(x.availableHours), x.allocated === null ? "—" : `${x.allocated}%`, h(x.freeHours), x.leaveLabel ?? ""]), [false, true, true, true, true, false]),
  method: ["Free hours are available hours for the rest of the month less the share already allocated."],
};

export const leave: Section = {
  summary: (d) => (d.pulse.away.rows.length ? `${names([...new Set(d.pulse.away.rows.map((r) => r.name))])} ${new Set(d.pulse.away.rows.map((r) => r.name)).size === 1 ? "has" : "have"} approved leave starting in the next 14 days.` : "Nobody has approved leave starting in the next 14 days."),
  figures: (d) => [["Leave bookings", String(d.pulse.away.rows.length), "starting in the next 14 days"]],
  findings: () => [],
  body: (doc, d) => doc.heading("Leave in the next 14 days").table("Approved leave", ["Person", "Dates", "Type"],
    d.pulse.away.rows.map((r) => [r.name, r.startsOn === r.endsOn ? shortDay(r.startsOn) : `${shortDay(r.startsOn)} – ${shortDay(r.endsOn)}`, `${r.type}${r.half ? `, half day (${r.half})` : ""}`]), [false, false, false]),
};
