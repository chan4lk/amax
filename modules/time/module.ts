import { declarePayload, defineModule } from "@amax/core";
import { chatIntents } from "./chat";
import { chatSuggestions, pageLabel } from "./chat-suggestions";
import { EVENTS, type ChangeCompleted, type ChangeDecided, type ChangeRequested, type EntryCorrected, type EntryDeleted, type EntryLogged, type WeekDecided, type WeekReminded, type WeekReopened, type WeekSubmitted } from "./contracts";
import { timeFixtures } from "./fixtures";
import { mcpTools } from "./mcp";
import { timeOverview } from "./server/overview";
import { commitDraft, commitTimeHandler } from "./suggestions";
import { MyPage } from "./ui/MyPage";
import { TeamPage } from "./ui/TeamPage";

const OWN = ["time:read", "time:log@own", "time:submit@own"];
const APPROVE = [...OWN, "time:approve@managed"];

export default defineModule({
  id: "time",
  title: "Time",
  icon: "clock",
  group: "Work",
  order: 20,
  dependsOn: ["delivery"],
  integratesWith: ["hr", "leave"],
  permissions: ["time:read", "time:log", "time:submit", "time:approve", "time:team", "time:admin"],
  grants: {
    Leadership: [...APPROVE, "time:team"],
    Finance: [...OWN, "time:team"],
    PM: APPROVE,
    Engineer: APPROVE,
    Sales: OWN,
    HR: OWN,
    Payroll: OWN,
    Employee: OWN,
  },
  routes: [
    { path: "", title: "Team time", component: TeamPage },
    { path: "w/:week", title: "Team time", component: TeamPage },
    { path: "my", title: "My timesheet", component: MyPage },
    { path: "my/:week", title: "My timesheet", component: MyPage },
  ],
  mcpTools,
  overview: timeOverview as never,
  retention: [
    { table: "time.week", label: "Timesheet weeks", subject: ["user_id", "decided_by"], subjectName: ["person_name"], fields: ["person_name", "note", "reject_comment", "decided_by"], class: "personal", period: "P7Y", start: { at: ["decided_at"], idle: "P1Y" }, action: "anonymise" },
    { table: "time.entry", label: "Time entries", subject: ["user_id", "project_id", "logged_by"], fields: ["note", "logged_by"], class: "personal", period: "P7Y", start: { at: ["created_at"] }, action: "anonymise" },
    { table: "time.change_request", label: "Timesheet change requests", subject: ["user_id", "decided_by"], fields: ["reason", "question", "answer", "decision_note", "decided_by"], class: "personal", period: "P7Y", start: { at: ["created_at"] }, action: "anonymise" },
    { table: "time.approval", label: "Timesheet approvals", subject: ["decided_by"], fields: ["comment", "decided_by"], class: "personal", period: "P7Y", start: { at: ["at"] }, action: "anonymise" },
  ],
  chatIntents,
  chatSuggestions,
  pageLabel,
  jobs: [],
  // 030: who hears about a week. Approvers see a submission; the person hears the decision and reminders.
  notifications: [
    { id: "time.week-submitted", event: EVENTS.weekSubmitted, category: "approvals", to: [{ approvers: "userId" }], permission: "time:approve", subject: "userId",
      title: "{userId|name} submitted {week}", body: "{hours} h to approve", href: "/time/w/{week}" },
    { id: "time.week-approved", event: EVENTS.weekApproved, category: "approvals", to: [{ owner: "userId" }], except: "by", subject: "userId",
      title: "Your timesheet for {week} was approved", href: "/time/my/{week}" },
    { id: "time.week-rejected", event: EVENTS.weekRejected, category: "approvals", to: [{ owner: "userId" }], except: "by", subject: "userId",
      title: "Your timesheet for {week} was sent back", body: "{comment}", href: "/time/my/{week}" },
    { id: "time.week-reminded", event: EVENTS.weekReminded, category: "reminders", to: [{ owner: "userId" }], except: "by", subject: "userId",
      title: "Reminder: submit your timesheet for {week}", href: "/time/my/{week}" },
    // 070 AC-15: someone else fixed or removed your hours; the reason comes with it.
    { id: "time.entry-corrected-by-other", event: EVENTS.entryCorrected, when: { byOther: true }, category: "approvals", to: [{ owner: "userId" }], except: "by", subject: "userId",
      title: "{by|name} changed your {projectName} hours for {dayLabel}", body: "{reason}", href: "/time/my/{week}" },
    { id: "time.entry-deleted-by-other", event: EVENTS.entryDeleted, when: { byOther: true }, category: "approvals", to: [{ owner: "userId" }], except: "by", subject: "userId",
      title: "{by|name} removed your {projectName} hours for {dayLabel}", body: "{reason}", href: "/time/my/{week}" },
    // 070 amendment 3: approvers hear of a change request and of the owner's answer; the owner hears a question,
    // a decline or a reopen. An applied fix and a send-back already have their own notice.
    { id: "time.change-requested", event: EVENTS.changeRequested, when: { answered: false }, category: "approvals", to: [{ approvers: "userId" }], permission: "time:approve", subject: "userId",
      title: "{userId|name} asked to change {projectName}, {dayLabel}", body: "{change} · {reason}", href: "/time/w/{week}" },
    { id: "time.change-answered", event: EVENTS.changeRequested, when: { answered: true }, category: "approvals", to: [{ approvers: "userId" }], permission: "time:approve", subject: "userId",
      title: "{userId|name} answered about {projectName}, {dayLabel}", body: "{answer}", href: "/time/w/{week}" },
    { id: "time.change-asked", event: EVENTS.changeDecided, when: { decision: "ask" }, category: "approvals", to: [{ owner: "userId" }], except: "by", subject: "userId",
      title: "{by|name} has a question about your change to {projectName}, {dayLabel}", body: "{note}", href: "/time/my/{week}" },
    { id: "time.change-declined", event: EVENTS.changeDecided, when: { decision: "decline" }, category: "approvals", to: [{ owner: "userId" }], except: "by", subject: "userId",
      title: "{by|name} declined your change to {projectName}, {dayLabel}", body: "{note}", href: "/time/my/{week}" },
    { id: "time.week-reopened", event: EVENTS.weekReopened, category: "approvals", to: [{ owner: "userId" }], except: "by", subject: "userId",
      title: "Your timesheet for {week} was reopened", body: "{reason}", href: "/time/my/{week}" },
  ],
  // 035: outgoing webhooks send only declared fields (review 058).
  events: { emits: Object.values(EVENTS), payloads: {
    [EVENTS.entryLogged]: declarePayload<EntryLogged>({ entryId: "plain", weekId: "plain", userId: "plain", projectId: "plain", day: "plain", hours: "plain", billable: "plain", source: "plain", lockedChange: "plain", revision: "plain" }),
    [EVENTS.entryCorrected]: declarePayload<EntryCorrected>({ entryId: "plain", weekId: "plain", userId: "plain", projectId: "plain", day: "plain", hours: "plain", billable: "plain", revision: "plain", before: "plain", lockedChange: "plain", by: "plain", byOther: "plain", reason: "plain", projectName: "plain", week: "plain", dayLabel: "plain", requestId: "plain" }),
    [EVENTS.entryDeleted]: declarePayload<EntryDeleted>({ entryId: "plain", weekId: "plain", userId: "plain", projectId: "plain", day: "plain", hours: "plain", revision: "plain", lockedChange: "plain", by: "plain", byOther: "plain", reason: "plain", projectName: "plain", week: "plain", dayLabel: "plain", requestId: "plain" }),
    [EVENTS.weekSubmitted]: declarePayload<WeekSubmitted>({ weekId: "plain", userId: "plain", week: "plain", hours: "plain" }),
    [EVENTS.weekApproved]: declarePayload<WeekDecided>({ weekId: "plain", userId: "plain", week: "plain", by: "plain", chain: "plain", comment: "plain" }),
    [EVENTS.weekRejected]: declarePayload<WeekDecided>({ weekId: "plain", userId: "plain", week: "plain", by: "plain", chain: "plain", comment: "plain" }),
    [EVENTS.weekReopened]: declarePayload<WeekReopened>({ weekId: "plain", userId: "plain", week: "plain", by: "plain", reason: "plain" }),
    [EVENTS.weekReminded]: declarePayload<WeekReminded>({ weekId: "plain", userId: "plain", week: "plain", by: "plain" }),
    [EVENTS.changeRequested]: declarePayload<ChangeRequested>({ requestId: "plain", weekId: "plain", userId: "plain", week: "plain", entryId: "plain", projectName: "plain", dayLabel: "plain", change: "plain", reason: "plain", answered: "plain", answer: "plain" }),
    [EVENTS.changeDecided]: declarePayload<ChangeDecided>({ requestId: "plain", weekId: "plain", userId: "plain", week: "plain", entryId: "plain", projectName: "plain", dayLabel: "plain", decision: "plain", by: "plain", note: "plain" }),
    [EVENTS.changeCompleted]: declarePayload<ChangeCompleted>({ requestId: "plain", weekId: "plain", userId: "plain", week: "plain" }),
  },
  // 008 AC-3: a commit's hours become a draft suggestion on the person's own timesheet.
  handles: [commitTimeHandler] },
  suggestions: [commitDraft],
  fixtures: [timeFixtures],
});
