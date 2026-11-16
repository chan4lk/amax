import { declarePayload, defineModule } from "@amax/core";
import { chatIntents } from "./chat";
import { EVENTS, type AllocationSet, type MonthCopied } from "./contracts";
import { allocationsFixtures } from "./fixtures";
import { mcpTools } from "./mcp";
import { assignedProjectIds } from "./server/scopes";
import { AllocationsEveryonePage, AllocationsPage } from "./ui/AllocationsPage";
import { agentCheck, agentCheckSchedule, rebalance } from "./suggestions";
import { ProjectTeamPage } from "./ui/ProjectTeamPage";
import { onLeaver, standingExtend, standingExtendSchedule } from "./server/standing-jobs";

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
    { table: "allocations.standing", label: "Who set an allocation until further notice", subject: ["person_id", "project_id", "updated_by"], fields: ["person_id", "updated_by"], class: "personal", period: "P7Y", start: { at: ["until_month"] }, action: "anonymise" },
  ],
  viewerScopes: async (tx, user) => ({ assignedProjects: await assignedProjectIds(tx, user) }),
  chatIntents,
  jobs: [],
  // 006: agent-suggested allocation changes, and the recurring check that makes them (off until switched on).
  suggestions: [rebalance],
  // 107: standing allocations written a month further ahead, on the 1st.
  workflows: [agentCheck, standingExtend],
  schedules: [agentCheckSchedule, standingExtendSchedule],
  // 035: outgoing webhooks send only declared fields (review 058).
  // 107 final pass: a leaver's standing allocations end the month after they leave.
  events: { emits: Object.values(EVENTS), handles: [onLeaver], payloads: {
    [EVENTS.allocationSet]: declarePayload<AllocationSet>({ personId: "plain", projectId: "plain", work: "plain", months: "plain", percent: "plain", by: "plain", standing: "plain" }),
    [EVENTS.monthCopied]: declarePayload<MonthCopied>({ team: "plain", from: "plain", to: "plain", rows: "plain", by: "plain" }),
  } },
  fixtures: [allocationsFixtures],
});
