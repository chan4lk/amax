import { declarePayload, defineModule } from "@amax/core";
import { chatIntents } from "./chat";
import { EVENTS, type InsightDismissed, type InsightRecorded } from "./contracts";
import { insightsFixtures } from "./fixtures";
import { mcpTools } from "./mcp";
import { insightsOverview } from "./server/overview";
import { briefingKind } from "./server/agents";
import { InsightsPage } from "./ui/InsightsPage";
import { schedules, workflows } from "./workflows";

const READ = ["insights:read"];

export default defineModule({
  id: "insights",
  title: "Insights",
  icon: "spark",
  group: "Work",
  order: 50,
  dependsOn: ["hr", "delivery", "time", "presales"],
  integratesWith: ["allocations", "leave", "finance", "it-access", "recruitment", "learning", "reports"],
  // The mock's admin, leadership and PM open Insights; each insight still shows only within the
  // viewer's legal entities, and live figures only what the other modules let them see.
  permissions: ["insights:read", "insights:record", "insights:dismiss", "insights:admin"],
  grants: { Leadership: [...READ, "insights:record", "insights:dismiss"], PM: READ },
  routes: [{ path: "", title: "Insights", component: InsightsPage }],
  mcpTools,
  overview: insightsOverview as never,
  chatIntents,
  // 032: an insight and its sources (which cascade with it) are kept two years from the day they are as of.
  retention: [
    { table: "insights.insight", label: "Insights and their sources", subject: ["recorded_by", "dismissed_by"], fields: ["recorded_by", "dismissed_by", "body", "suggestion"], keep: { data: "the screen's figures for its kind; the whole row is deleted when due" }, class: "personal", period: "P2Y", start: { at: ["as_of"] }, action: "delete" },
  ],
  workflows,
  schedules,
  suggestions: [briefingKind],
  events: {
    emits: Object.values(EVENTS),
    payloads: {
      [EVENTS.recorded]: declarePayload<InsightRecorded>({ insightId: "plain", kind: "plain", sources: "plain", by: "plain" }),
      [EVENTS.dismissed]: declarePayload<InsightDismissed>({ insightId: "plain", kind: "plain", by: "plain" }),
    },
  },
  fixtures: [insightsFixtures],
});
