import { declarePayload, defineModule } from "@amax/core";
import { EVENTS, type HolidaySet, type TargetSet } from "./contracts";
import { reportsFixtures } from "./fixtures";
import { mcpTools } from "./mcp";
import { hoursCorrectedHandler, hoursDeletedHandler, hoursHandler } from "./server/hours";
import { weekStatusHandlers } from "./server/status";
import { ReportsPage } from "./ui/ReportsPage";

const READ = ["reports:read"];

export default defineModule({
  id: "reports",
  title: "Reports",
  icon: "chart",
  group: "Work",
  order: 40,
  dependsOn: ["hr"],
  integratesWith: ["time", "leave", "allocations"],
  permissions: ["reports:read", "reports:admin"],
  // Who opens Reports (the mock's admin, leadership, PM and finance); what each sees is still limited
  // to the people whose time, hr record and leave they may see. Admin holds reports:admin.
  grants: { Leadership: READ, PM: READ, Finance: READ },
  routes: [{ path: "", title: "Reports", component: ReportsPage }],
  mcpTools,
  // The hours read model mirrors time.entry (logged, corrected and deleted entries, 070): kept as long as timesheets are (seven years from the day).
  retention: [
    { table: "reports.logged_hours", label: "Logged hours (reports copy)", subject: ["user_id"], fields: ["user_id", "hours"], class: "personal", period: "P7Y", start: { at: ["day"] }, action: "delete" },
    { table: "reports.week_status", label: "Timesheet week status (reports copy)", subject: ["user_id"], fields: ["user_id", "status"], class: "personal", period: "P7Y", start: { at: ["updated_at"] }, action: "delete" },
  ],
  jobs: [],
  events: {
    emits: Object.values(EVENTS),
    handles: [hoursHandler, hoursCorrectedHandler, hoursDeletedHandler, ...weekStatusHandlers],
    payloads: {
      [EVENTS.targetSet]: declarePayload<TargetSet>({ target: "plain", by: "plain" }),
      [EVENTS.holidaySet]: declarePayload<HolidaySet>({ legalEntityId: "plain", on: "plain", name: "plain", by: "plain" }),
    },
  },
  fixtures: [reportsFixtures],
});
