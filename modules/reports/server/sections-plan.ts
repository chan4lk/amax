import { h, names, type Section } from "./export-blocks";

const share = (logged: number, planned: number) => (planned ? `${Math.round((logged / planned) * 100)}%` : "—");

export const projects: Section = {
  summary: (d) => {
    const rows = d.pulse.hours.rows, planned = rows.reduce((n, r) => n + r.planned, 0), logged = rows.reduce((n, r) => n + r.logged, 0), off = rows.filter((r) => r.flag);
    return `${rows.length} ${rows.length === 1 ? "project" : "projects"} logged ${h(logged)} against ${h(planned)} planned (${share(logged, planned)} of plan)${off.length ? `; ${names(off.map((r) => r.name))} ${off.length === 1 ? "is" : "are"} more than ${d.pulse.hours.limit}% off plan` : ""}.`;
  },
  figures: (d) => {
    const rows = d.pulse.hours.rows;
    return [["Planned hours", h(rows.reduce((n, r) => n + r.planned, 0)), "to date"], ["Logged hours", h(rows.reduce((n, r) => n + r.logged, 0)), "submitted and approved"], ["Projects off plan", String(rows.filter((r) => r.flag).length), `beyond ${d.pulse.hours.limit}%`]];
  },
  findings: (d) => d.pulse.hours.rows.filter((r) => r.flag).map((r) => `${r.name} logged ${h(r.logged)} of ${h(r.planned)} planned, ${Math.abs(r.drift ?? 0)}% ${r.flag} plan.`),
  body: (doc, d) => doc.heading("Hours against plan, by project").table(`Hours against plan, ${d.period}`, ["Project", "Planned", "Logged", "Difference", "Share of plan", "Status"],
    d.pulse.hours.rows.map((r) => [r.name, h(r.planned), h(r.logged), `${r.logged - r.planned > 0 ? "+" : ""}${r.logged - r.planned} h`, share(r.logged, r.planned), r.flag ? `${r.flag} plan` : "on plan"]), [false, true, true, true, true, false]),
  method: ["Planned hours are each person's allocation percent times their available hours so far this month."],
};

export const allocation: Section = {
  summary: (d) => {
    const over = [...new Set(d.pulse.allocation.months.flatMap((m) => m.over.map((o) => o.name)))];
    const bench = d.pulse.allocation.months.filter((m) => m.bench > 0);
    return `${over.length ? `${names(over)} ${over.length === 1 ? "is" : "are"} planned above 100% in the next six months` : "Nobody is planned above 100% in the next three months"}${bench.length ? `; ${names(bench.map((m) => `${m.bench} in ${m.label}`))} on the bench` : ""}.`;
  },
  figures: (d) => [["Over-allocated people", String(new Set(d.pulse.allocation.months.flatMap((m) => m.over.map((o) => o.name))).size), "next three months"]],
  findings: (d) => [
    ...d.pulse.allocation.months.flatMap((m) => m.over.map((o) => `${o.name} is planned at ${o.percent}% in ${m.label}.`)),
    ...d.pulse.allocation.months.filter((m) => m.bench > 0).map((m) => `${m.bench} on the bench in ${m.label} (${m.skills}).`),
  ],
  body: (doc, d) => doc.heading("Over-allocated and bench").table("By month, next six months", ["Month", "Over 100%", "On the bench"],
    d.pulse.allocation.months.map((m) => [m.label, m.over.map((o) => `${o.name} ${o.percent}%`).join(", ") || "Nobody", m.bench ? `${m.bench} (${m.skills})` : "Nobody"]), [false, false, false]),
};

export const plan: Section = {
  summary: (d) => {
    if (!d.plan) return null;
    if (!d.plan.on) return "Allocations isn't installed, so there is no project plan to show.";
    if (!d.plan.lines.length) return `No planned allocation you can see for ${d.scope} in ${d.plan.label}.`;
    const people = [...new Set(d.plan.lines.map((l) => l.person))];
    return people.slice(0, 3).map((p) => {
      const mine = d.plan!.lines.filter((l) => l.person === p);
      return `${p} is planned on ${mine.length} ${mine.length === 1 ? "project" : "projects"} in ${d.plan!.label}: ${mine.map((l) => `${l.project} ${l.percent}%`).join(", ")} (${mine.reduce((n, l) => n + l.percent, 0)}% in total).`;
    }).join(" ") + (people.length > 3 ? ` And ${people.length - 3} more in the table.` : "");
  },
  figures: () => [],
  findings: (d) => {
    const totals = new Map<string, number>();
    for (const l of d.plan?.lines ?? []) totals.set(l.person, (totals.get(l.person) ?? 0) + l.percent);
    return [...totals].filter(([, n]) => n > 100).map(([p, n]) => `${p} is planned at ${n}% in ${d.plan!.label}.`);
  },
  body: (doc, d) => {
    if (!d.plan?.on || !d.plan.lines.length) return doc;
    const rows: string[][] = [];
    for (const p of [...new Set(d.plan.lines.map((l) => l.person))]) {
      const mine = d.plan.lines.filter((l) => l.person === p);
      mine.forEach((l, i) => rows.push([i === 0 ? p : "", l.project, `${l.percent}%`]));
      if (mine.length > 1) rows.push(["", "Total", `${mine.reduce((n, l) => n + l.percent, 0)}%`]);
    }
    return doc.heading("Planned allocation by project").table(`Planned allocation, ${d.plan.label}`, ["Person", "Project", "Planned"], rows, [false, false, true]);
  },
  method: ["Planned allocation is the percent of each person's time that Allocations has planned on the project for the month, not hours worked."],
};

export const capacity: Section = {
  summary: (d) => {
    const m = d.pulse.capacity.months, tight = m.filter((x) => x.over > 0);
    return m.length ? (tight.length ? `Demand is above capacity in ${names(tight.map((x) => `${x.label} (by ${x.over} FTE)`))}.` : `Capacity covers demand every month from ${m[0].label} to ${m[m.length - 1].label}.`) : null;
  },
  figures: (d) => [["Months over capacity", String(d.pulse.capacity.months.filter((x) => x.over > 0).length), `of the next ${d.pulse.capacity.months.length}`]],
  findings: (d) => d.pulse.capacity.months.filter((x) => x.over > 0).map((x) => `${x.label}: demand ${x.demand} FTE against capacity ${x.capacity} FTE.`),
  body: (doc, d) => doc.heading("Capacity and demand").table("Capacity and demand in FTE", ["Month", "Capacity", "Demand", "Gap"],
    d.pulse.capacity.months.map((x) => [x.label, String(x.capacity), String(x.demand), x.over ? `over by ${x.over}` : `${Math.round((x.capacity - x.demand) * 10) / 10} spare`]), [false, true, true, true]),
};
