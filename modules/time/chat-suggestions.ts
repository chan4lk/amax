import type { ChatSuggestion } from "@amax/core";
import type { Viewer } from "@amax/auth";
import { myWeek } from "./server/my";
import { openToReview } from "./server/requests-read";
import { teamWeek } from "./server/team";
import { wantedWeek } from "./server/weeks";
import { parseWeekKey, weekStart } from "./week";

// 070 amendment 4: what chat offers on Time's pages, each only when the viewer can do it on the week shown.
const MY = ["my", "my/:week"];
const TEAM = ["", "w/:week"];
type P = Record<string, string>;
const mine = (v: Viewer, p: P) => myWeek(v, wantedWeek(p.week));
const team = async (v: Viewer, p: P) => (await teamWeek(v, wantedWeek(p.week))).rows.filter((r) => r.canApprove);
const open = (s: string | null) => s === "draft" || s === "rejected";
const when = (check: (v: Viewer, p: P) => Promise<boolean>) => check as ChatSuggestion["when"];

export const chatSuggestions: ChatSuggestion[] = [
  { routes: MY, label: "Fix an entry", prompt: "Fix an entry on this week's timesheet: ", tool: "correct_time_entry",
    when: when(async (v, p) => { const m = await mine(v, p); return open(m.status) && m.total > 0; }) },
  { routes: MY, label: "Ask for a change", prompt: "My week is locked; ask for a change to an entry: ", tool: "request_time_change",
    when: when(async (v, p) => { const m = await mine(v, p); return (m.status === "submitted" || m.status === "approved") && m.total > 0; }) },
  { routes: MY, label: "Submit my week", prompt: "Submit my timesheet for this week", tool: "submit_week",
    when: when(async (v, p) => { const m = await mine(v, p); return open(m.status) && m.total > 0; }) },
  { routes: MY, label: "What did I log this week?", prompt: "What did I log this week?", tool: "get_my_week" },
  { routes: TEAM, label: "Review change requests", prompt: "Show the change requests waiting for me", tool: "decide_change_request",
    when: when(async (v) => (await openToReview(v)).length > 0) },
  { routes: TEAM, label: "Approve submitted timesheets", prompt: "Approve the submitted timesheets for this week", tool: "approve_weeks",
    when: when(async (v, p) => (await team(v, p)).some((r) => r.status === "submitted")) },
  { routes: TEAM, label: "Remind everyone who hasn't submitted", prompt: "Remind everyone who hasn't submitted this week", tool: "remind_weeks",
    when: when(async (v, p) => (await team(v, p)).some((r) => open(r.status))) },
  { routes: TEAM, label: "Fix someone's hours", prompt: "Fix someone's hours this week: ", tool: "correct_time_entry",
    when: when(async (v, p) => (await team(v, p)).some((r) => open(r.status))) },
  { routes: TEAM, label: "Who hasn't submitted?", prompt: "Who hasn't submitted their timesheet this week?", tool: "get_team_week" },
];

const LABEL = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
/** "Week of Oct 12" for a week in the route; nothing when the page shows the latest week. */
export const pageLabel = (p: P) => { const w = parseWeekKey(p.week); return w ? `Week of ${LABEL.format(weekStart(w))}` : null; };
