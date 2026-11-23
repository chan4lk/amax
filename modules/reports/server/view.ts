import type { Viewer } from "@amax/auth";
import type { PersonUtilisation, TeamUtilisation } from "../contracts";
import { availabilityOf, type Availability } from "./availability";
import { HOURS_PER_DAY, monthEnd, monthName, monthOfDay, MONTH, rangeOf, shiftMonth, shortDay, weekdays, type Range } from "./days";
import { utilisationOf } from "./figures";
import { loadInputs, type Inputs } from "./inputs";
import { read, settingsOf } from "./read";
import { ledeOf } from "./lede";
import { groupOf, rosterOf, type Group } from "./roster";
import { heatOf, type Heat } from "./heat";

export type Trend = { month: string; label: string; utilisation: number | null }[];
export type Report = {
  group: Group; month: string; monthName: string; range: Range; span: string; workingDays: number; target: number; lede: string; notes: string[];
  trend: Trend; rows: PersonUtilisation[]; team: TeamUtilisation; availability: Availability; heat: Heat;
  titles: Record<string, string>;
};

const span = (r: Range) => (r.from.slice(0, 7) === r.to.slice(0, 7) ? `${shortDay(r.from)}–${Number(r.to.slice(8))}` : `${shortDay(r.from)}–${shortDay(r.to)}`);

function workingDaysOf(rows: PersonUtilisation[], inputs: Inputs, range: Range) {
  const entities = new Set(rows.map((r) => r.legalEntityId));
  const off = entities.size === 1 ? (inputs.holidays.get([...entities][0]) ?? new Set<string>()) : new Set<string>();
  return weekdays(range.from, range.to).filter((d) => !off.has(d)).length;
}

const trendOf = (inputs: Inputs, month: string, today: string): Trend =>
  Array.from({ length: 12 }, (_, i) => shiftMonth(month, i - 11)).map((m) => {
    const r = rangeOf(m, today);
    return { month: m, label: monthName(m, "short"), utilisation: r ? utilisationOf(inputs, r).team.utilisation : null };
  });

export type ReportParts = { trend?: boolean; heat?: boolean; availability?: boolean };

export async function getReport(v: Viewer, month?: string, asked?: string, opts: { only?: Set<string>; parts?: ReportParts } = {}): Promise<Report> {
  const parts = { trend: true, heat: true, availability: true, ...opts.parts };
  const group = groupOf(v, asked);
  if (month && !MONTH.test(month)) throw new Error("give the month as YYYY-MM");
  return read(v, async (tx) => {
    const { target, today } = await settingsOf(tx);
    const m = month ?? monthOfDay(today);
    const range = rangeOf(m, today);
    if (!range) throw new Error(`${monthName(m)} ${m.slice(0, 4)} hasn't started yet`);
    const back = parts.trend ? 11 : parts.heat ? 5 : 0;
    const inputs = await loadInputs(tx, v, { from: `${shiftMonth(m, -back)}-01`, to: monthEnd(m) }, await rosterOf(tx, v, m, group), opts.only);
    const { rows, team } = utilisationOf(inputs, range);
    const workingDays = workingDaysOf(rows, inputs, range);
    const name = monthName(m);
    const notes = [
      ...(inputs.leaveOn ? [] : ["Leave isn't installed, so available hours don't take leave off."]),
      // 072 review round 4: each reason a person is left out of the team figure, said apart.
      ...(team.leaveHidden ? [`${team.leaveHidden} ${team.leaveHidden === 1 ? "person is" : "people are"} left out of the team figure: their leave isn't visible to you.`] : []),
      ...(team.statusUnknown ? [`${team.statusUnknown} ${team.statusUnknown === 1 ? "person is" : "people are"} left out of the team figure: some of their hours' timesheet status couldn't be read.`] : []),
    ];
    return {
      group, month: m, monthName: name, range, span: span(range), workingDays, target, notes,
      lede: ledeOf({ name, span: span(range), workingDays, perPerson: workingDays * HOURS_PER_DAY, team, target, toDate: range.to < monthEnd(m) }),
      titles: Object.fromEntries(inputs.people.filter((p) => rows.some((r) => r.userId === p.userId)).map((p) => [p.userId, p.title])),
      trend: parts.trend ? trendOf(inputs, m, today) : [], heat: parts.heat ? heatOf(inputs, rows, m, today) : { months: [], rows: [] }, rows, team,
      availability: parts.availability ? await availabilityOf(tx, v, inputs, rows, m, today) : { range: null, allocationsOn: false, rows: [] },
    };
  });
}
