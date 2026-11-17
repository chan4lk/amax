import { declarePayload, defineModule } from "@amax/core";
import { chatIntents } from "./chat";
import { allocationRules } from "./chat-rules";
import { EVENTS, type AllocationSet, type FixSuggested, type MonthCopied, type MonthSettled } from "./contracts";
import { allocationsFixtures } from "./fixtures";
import { mcpTools } from "./mcp";
import { assignedProjectIds } from "./server/scopes";
import { AllocationsEveryonePage, AllocationsPage } from "./ui/AllocationsPage";
import { agentCheck, agentCheckSchedule, rebalance } from "./suggestions";
import { ProjectTeamPage } from "./ui/ProjectTeamPage";

const READ = ["allocations:read"];

export default defineModule({
  id: "allocations",
  title: "Allocations",
  icon: "people",
  group: "Work",
  order: 30,
  dependsOn: ["delivery", "hr"],
  integratesWith: ["leave"],
  permissions: ["allocations:read", "allocations:allocate", "allocations:copy"],
  grants: {
    Leadership: READ,
    HR: READ,
    PM: [...READ, "allocations:allocate@managed", "allocations:copy"],
  },
  routes: [
    { path: "", title: "Allocations", component: AllocationsPage },
    { path: "everyone", title: "Allocations", component: AllocationsEveryonePage },
    // The project page's Team section (051): served at /delivery/p/:key/team, gated by delivery:read here and allocations:read in the screen.
    { path: "p/:key/team", title: "Team", mount: "delivery", component: ProjectTeamPage },
  ],
  mcpTools,
  // People are hr.person ids and their names stay in hr; only who last changed an allocation is personal.
  retention: [
    { table: "allocations.allocation", label: "Who changed an allocation", subject: ["person_id", "project_id", "updated_by"], fields: ["person_id", "updated_by"], class: "personal", period: "P7Y", start: { at: ["month"] }, action: "anonymise" },
  ],
  viewerScopes: async (tx, user) => ({ assignedProjects: await assignedProjectIds(tx, user) }),
  chatIntents,
  chatRules: allocationRules,
  jobs: [],
  // 006: agent-suggested allocation changes, and the recurring check that makes them (off until switched on).
  suggestions: [rebalance],
  workflows: [agentCheck],
  schedules: [agentCheckSchedule],
  notifications: [
    { id: "allocations.over-capacity", event: EVENTS.allocationSet, when: { over: true }, category: "approvals", urgency: "urgent", to: [{ role: "PM" }],
      permission: "allocations:allocate", scope: { projectId: "projectId" }, except: "byUser",
      title: "{personUserId|name} is at {total}% in {month}", body: "{byUser|name} put them at {percent}% on {project}. Press Fix it on Allocations.", href: "/allocations" },
    { id: "allocations.changed", event: EVENTS.allocationSet, when: { over: false }, category: "reminders", to: [{ role: "PM" }],
      permission: "allocations:allocate", scope: { projectId: "projectId" }, except: "byUser",
      title: "{byUser|name} set {personUserId|name} to {percent}% on {project}", body: "Their busiest month, {month}, is at {total}%.", href: "/allocations" },
    { id: "allocations.fix-suggested", event: EVENTS.fixSuggested, category: "approvals", to: [{ role: "PM" }],
      permission: "allocations:allocate", scope: { projectId: "projectId" },
      title: "{personUserId|name} is at {total}% in {month}", body: "The Allocation check found a change. Press Take action on Allocations.", href: "/allocations" },
  ],
  notificationClears: [{ id: "allocations.settled", event: EVENTS.monthSettled, rules: ["allocations.over-capacity", "allocations.fix-suggested"], match: ["personUserId", "month"] }],
  // 035: outgoing webhooks send only declared fields (review 058).
  events: { emits: Object.values(EVENTS), payloads: {
    [EVENTS.allocationSet]: declarePayload<AllocationSet>({ personId: "plain", projectId: "plain", work: "plain", months: "plain", percent: "plain", by: "plain",
      personUserId: "plain", project: "plain", month: "plain", total: "plain", over: "plain", byUser: "plain" }),
    [EVENTS.monthCopied]: declarePayload<MonthCopied>({ team: "plain", from: "plain", to: "plain", rows: "plain", by: "plain" }),
    [EVENTS.monthSettled]: declarePayload<MonthSettled>({ personUserId: "plain", month: "plain" }),
    [EVENTS.fixSuggested]: declarePayload<FixSuggested>({ suggestionId: "plain", personUserId: "plain", projectId: "plain", project: "plain", month: "plain", total: "plain", percent: "plain" }),
  } },
  fixtures: [allocationsFixtures],
});
