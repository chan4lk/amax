import { z } from "zod";
import type { McpToolDef } from "@amax/core";
import type { Viewer } from "@amax/auth";
import { isoWeek, read, tool } from "./mcp-kit";
import { bulkTools } from "./mcp-bulk";
import { settingsTools } from "./mcp-settings";
import { utilisationTools } from "./mcp-utilisation";
import { reminderTools } from "./mcp-reminders";
import { requestTools } from "./mcp-requests";
import { ctxFor } from "./server/context";
import { cardFields, checkCard, type CardInput } from "./server/card";
import { correctEntry, deleteEntry } from "./server/correct";
import { correctCard, deleteCard, logCard, proposeLog } from "./server/entry-card";
import { proposeWeek, weekCard } from "./server/week-card";
import { approveWeek, rejectWeek, remindWeek } from "./server/decide";
import { logTime } from "./server/log";
import { logOnce } from "./server/replay";
import { myWeek } from "./server/my";
import { hoursTrend } from "./server/overview";
import { reopenWeek } from "./server/reopen";
import { getTimesheet } from "./server/sheet";
import { submitWeek } from "./server/submit";
import { submitCard } from "./server/submit-card";
import { teamWeek } from "./server/team";
import { wantedWeek } from "./server/weeks";

const week = isoWeek.optional().describe("ISO week such as 2026-W42; the latest week if left out");
// 070 AC-9: a write never falls back to a week picked by the server's clock.
const ref = z.object({ weekId: z.string().uuid().optional(), person: z.string().optional().describe("Name or email"),
  week: isoWeek.optional().describe("ISO week such as 2026-W42; required when naming a person") });

export const mcpTools: McpToolDef[] = [
  tool({ ...read, pin: "view", name: "get_team_week", description: "Team timesheets for a week: hours per day, share logged by agents, status, and who you can approve. With `project` (a name from the week's projects), just that project's hours (073: ThisWeek's project rows pin to this).", input: z.object({ week, project: z.string().optional() }),
    run: async (v, a) => {
      const t = await teamWeek(v, wantedWeek(a.week));
      if (!a.project) return t;
      const p = t.projects.find((x) => x.name.toLowerCase() === a.project!.toLowerCase());
      return p ? { week: t.key, project: p.name, hours: p.hours } : null;
    } }),
  tool({ ...read, pin: "view", name: "get_hours_trend", description: "Hours logged per ISO week up to the latest, by agents and by people, optionally for one project (the Overview chart).",
    input: z.object({ weeks: z.number().int().min(1).max(52).optional(), projectId: z.string().uuid().optional() }), run: (v, a) => hoursTrend(v, a) }),
  tool({ ...read, pin: "view", name: "get_my_week", description: "Your own timesheet for a week, by project and day, with its status.", input: z.object({ week }),
    run: (v, a) => myWeek(v, wantedWeek(a.week)) }),
  tool({ ...read, pin: "view", name: "get_timesheet", description: "One person-week: by weekId (a row on Team time), or your own week, optionally just one project's row.",
    input: z.object({ weekId: z.string().uuid().optional(), week, project: z.string().optional().describe("Project name, for one row of the week (yours, or by weekId)") }),
    run: (v, a) => getTimesheet(v, a) }),
  tool({ name: "log_time", description: "Log hours against a project for a day (YYYY-MM-DD in the person's own calendar; a Saturday or Sunday needs weekend: true, after the person confirms the weekend work). Time logged through MCP counts as agent time.", scope: "write", permission: "time:log",
    input: z.object({ projectKey: z.string(), hours: z.number().positive().max(24), day: z.string().describe("YYYY-MM-DD, the person's local date"), billable: z.boolean().optional(), note: z.string().optional(), agent: z.string().optional(),
      clientRef: z.string().min(1).max(100).optional().describe("Your own id for this entry; a retry with the same id and input logs nothing twice"),
      weekend: z.boolean().optional().describe("true to log a Saturday or Sunday, once the person confirms they worked it") }),
    propose: proposeLog, card: logCard, service: logTime, run: (v, a, s = "mcp") => logOnce(v, a, s) }),
  tool({ name: "correct_time_entry", description: "Fix one time entry of a DRAFT or REJECTED week (for a submitted or approved week of your own, use request_time_change). Copy its project, day and current hours (and the person, when it isn't yours) from get_my_week or get_timesheet, so the confirm card shows them; then give the new hours, billable flag, note or project. The day can't change; delete the entry and log it again instead. Someone else's entry needs a reason, which they are told.", scope: "write", permission: "time:log",
    input: z.object({ ...cardFields, hours: z.number().positive().max(24).optional(), billable: z.boolean().optional(), note: z.string().max(500).optional(), projectKey: z.string().optional(), reason: z.string().optional(), entryId: z.string().uuid() }),
    propose: (v: Viewer, a: CardInput) => checkCard(v, a), card: correctCard, service: correctEntry, run: (v, a, s = "mcp") => correctEntry(ctxFor(v, s), a) }),
  tool({ name: "delete_time_entry", description: "Remove one time entry from a draft or rejected week (for a submitted or approved week of your own, use request_time_change with remove: true). Copy its project, day and hours (and the person, when it isn't yours) from get_my_week or get_timesheet, so the confirm card shows them. Someone else's entry needs a reason, which they are told.", scope: "write", permission: "time:log",
    input: z.object({ ...cardFields, reason: z.string().optional(), entryId: z.string().uuid() }),
    propose: (v: Viewer, a: CardInput) => checkCard(v, a), card: deleteCard, service: deleteEntry, run: (v, a, s = "mcp") => deleteEntry(ctxFor(v, s), a) }),
  tool({ name: "submit_week", description: "Submit your timesheet for a week for approval. Missing working days are a warning on the card, not a refusal.", scope: "write", permission: "time:submit", input: z.object({ week: isoWeek.describe("ISO week such as 2026-W42") }),
    card: submitCard, service: submitWeek, run: (v, a, s = "mcp") => submitWeek(ctxFor(v, s), a) }),
  tool({ name: "approve_week", description: "Approve a submitted timesheet. Approved weeks are locked.", scope: "write", permission: "time:approve", input: ref,
    propose: proposeWeek("approve"), card: weekCard("approve"), service: approveWeek, run: (v, a, s = "mcp") => approveWeek(ctxFor(v, s), a) }),
  tool({ name: "reject_week", description: "Send a submitted timesheet back with a comment saying what to fix.", scope: "write", permission: "time:approve", input: ref.extend({ comment: z.string() }),
    propose: proposeWeek("reject"), card: weekCard("reject"), service: rejectWeek, run: (v, a, s = "mcp") => rejectWeek(ctxFor(v, s), a) }),
  tool({ name: "remind_week", description: "Remind someone to submit their timesheet. Notifications (030) delivers it through their bell and chosen channels; if notifications is switched off it is only recorded, so tell the person yourself if it is urgent. An optional message goes with it.", scope: "write", permission: "time:approve", input: ref.extend({ message: z.string().optional() }),
    propose: proposeWeek("remind"), card: weekCard("remind"), service: remindWeek, run: (v, a, s = "mcp") => remindWeek(ctxFor(v, s), a) }),
  tool({ name: "reopen_week", description: "Unlock an approved timesheet so it can change. Admin only; give a reason.", scope: "write", permission: "time:admin", input: ref.extend({ reason: z.string() }),
    propose: proposeWeek("reopen"), card: weekCard("reopen"), service: reopenWeek, run: (v, a, s = "mcp") => reopenWeek(ctxFor(v, s), a) }),
  ...requestTools,
  ...bulkTools,
  ...settingsTools,
  ...utilisationTools,
  ...reminderTools,
];
