import { sql } from "drizzle-orm";
import type { OverviewPart, OverviewQuery } from "@amax/core";
import type { Viewer } from "@amax/auth";
import { projectHours, weekTotals, weeklyHours } from "../contracts";
import { projectNames, read, round1 } from "./read";
import { currentWeek } from "./rules";
import { teamWeek } from "./team";
import { weekKey, weekStart, workDays, type IsoWeek } from "../week";

const PERIODS = [{ value: "12", label: "Last 12 weeks" }, { value: "26", label: "Last 26 weeks" }];
const pct = (part: number, all: number) => (all ? Math.round((part / all) * 100) : 0);

/** 068 AC-2: the hours trend, also the get_hours_trend tool behind the chart's pin. */
export const hoursTrend = (v: Viewer, a: { weeks?: number; projectId?: string }) =>
  read(v, async (tx) => weeklyHours(tx, v, { last: await currentWeek(tx, v.userId), weeks: a.weeks ?? 12, projectId: a.projectId }));

// 104 AC-15: submitted weeks wait whatever week they're from, so the Overview lists the newest WAITING_WEEKS weeks that
// hold a timesheet this viewer can approve. Review round 1: the limit applies after the approver check, so weeks waiting
// on other approvers can't push this viewer's out; SCAN_WEEKS bounds how far back it looks.
const WAITING_WEEKS = 8;
const SCAN_WEEKS = 52;
async function waiting(v: Viewer) {
  const weeks = await read(v, async (tx) => (await tx.execute(sql`select distinct iso_year, iso_week from time.week where status = 'submitted' order by iso_year desc, iso_week desc limit ${SCAN_WEEKS}`))
    .map((r) => ({ year: Number(r.iso_year), week: Number(r.iso_week) })));
  const out = [];
  for (const w of weeks) {
    if (out.length === WAITING_WEEKS) break;
    const team = await teamWeek(v, w);
    const rows = team.rows.filter((r) => r.status === "submitted" && r.canApprove);
    if (!rows.length) continue;
    const hours = round1(rows.reduce((t, r) => t + r.total, 0));
    out.push({ id: `time:${team.key}`, title: `${team.key.replace(/^\d{4}-/, "")} timesheets`, detail: `${rows.length} submitted, ${hours} h, ${pct(rows.reduce((t, r) => t + r.agentHours, 0), hours)}% from agents`,
      context: `${rows.length} ${rows.length === 1 ? "person" : "people"}`, raisedBy: "Time", agent: false, since: weekStart(w).toISOString(), action: "Review",
      prompt: `Review the ${team.key} timesheets waiting for my approval`, pin: { label: `${team.key} timesheets`, tool: "get_team_week", args: { week: team.key } } });
  }
  return out;
}

// 068: the Hours ticket, the trend and by-project panels, and timesheets waiting on the viewer.
export const timeOverview = async (v: Viewer, q: OverviewQuery): Promise<OverviewPart> => {
  const part = await read(v, async (tx): Promise<OverviewPart & { week: IsoWeek }> => {
    // 104 AC-15: "this week" is the viewer's current week, the same week Team time opens on.
    const w = await currentWeek(tx, v.userId);
    const key = weekKey(w);
    const names = await projectNames(tx);
    const people = await weekTotals(tx, v, w);
    const total = round1(people.reduce((t, p) => t + p.hours, 0));
    const agents = round1(people.reduce((t, p) => t + p.agentHours, 0));
    const weeks = PERIODS.some((p) => p.value === q.hw) ? Number(q.hw) : 12;
    const projectId = q.hp && names.has(q.hp) ? q.hp : undefined;
    const trend = await weeklyHours(tx, v, { last: w, weeks, projectId });
    const days = workDays(w);
    const split = await projectHours(tx, v, { from: days[0], to: days[4] });
    const teamPin = { label: `Team time ${key}`, tool: "get_team_week", args: { week: key } };
    return {
      lede: total ? `Agents logged ${agents} h of the team's ${total} h this week.` : undefined,
      tickets: [{ key: "time.hours", order: 10, tone: "info", label: "Hours this week", value: `${total}`, note: `${pct(agents, total)}% of ${total} h logged by agents`, percent: pct(agents, total), pin: teamPin }],
      week: w,
      panels: [
        { kind: "series", key: "time.trend", title: "Hours logged", slot: "main", order: 10, labels: trend.map((t) => t.week.replace(/^\d{4}-/, "")),
          series: [{ name: "Logged by agents", data: trend.map((t) => t.agentHours) }, { name: "Logged by people", data: trend.map((t) => t.personHours) }],
          filters: [{ param: "hw", label: "Period", value: String(weeks), options: PERIODS },
            { param: "hp", label: "Project", value: projectId ?? "", options: [{ value: "", label: "All projects" }, ...[...names].map(([id, name]) => ({ value: id, label: name }))] }],
          pin: { label: "Hours logged", tool: "get_hours_trend", args: { weeks, ...(projectId ? { projectId } : {}) } } },
        { kind: "share", key: "time.split", title: "Where time went", slot: "aside", order: 30, total: `${round1(split.reduce((t, p) => t + p.hours, 0))} h`, caption: "this week",
          parts: split.map((p) => ({ label: names.get(p.projectId) ?? "Other", value: round1(p.hours), pin: { label: `${names.get(p.projectId) ?? "Project"} hours ${key}`, tool: "get_team_week", args: { week: key } } })),
          pin: teamPin },
      ],
    };
  });
  const { week: _week, ...rest } = part;
  return { ...rest, waiting: await waiting(v) };
};
