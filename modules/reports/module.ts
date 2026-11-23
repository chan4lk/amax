import { declarePayload, defineModule } from "@amax/core";
import { chatSuggestions } from "./chat-suggestions";
import { reportRules } from "./chat-rules";
import { EVENTS, type HolidaySet, type TargetSet } from "./contracts";
import { REPORT_EXPORT_SLOT } from "@amax/core/server";
import { reportsFixtures } from "./fixtures";
import { mcpTools } from "./mcp";
import { reportExport } from "./server/export-slot";
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
  integratesWith: ["time", "leave", "allocations", "delivery"],
  permissions: ["reports:read", "reports:target", "reports:admin"],
  // Who opens Reports (the mock's admin, leadership, PM and finance); what each sees is still limited
  grants: { Leadership: [...READ, "reports:target"], PM: [...READ, "reports:target"], Finance: READ },
  routes: [{ path: "", title: "Reports", component: ReportsPage }],
  mcpTools,
  chatSuggestions,
  provides: { [REPORT_EXPORT_SLOT]: reportExport },
  chatRules: reportRules,
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
