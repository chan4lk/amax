import { declarePayload, defineModule } from "@amax/core";
import { chatIntents } from "./chat";
import { EVENTS, type OpportunityPromoted, type OpportunityStageChanged } from "./contracts";
import { presalesFixtures } from "./fixtures";
import { jobs } from "./jobs";
import { mcpTools, search } from "./mcp";
import { BoardPage } from "./ui/BoardPage";
import { OpportunityPage } from "./ui/OpportunityPage";

const READ = ["presales:read"];
const SELL = [...READ, "presales:opportunity:create", "presales:opportunity:edit", "presales:opportunity:remove"];

export default defineModule({
  id: "presales",
  title: "Presales",
  icon: "target",
  group: "Business",
  order: 20,
  dependsOn: ["delivery"],
  integratesWith: [],
  permissions: ["presales:read", "presales:opportunity:create", "presales:opportunity:edit", "presales:opportunity:remove", "presales:promote"],
  // Promoting needs delivery's own project permission too; delivery checks it when it creates the project.
  grants: { Leadership: READ, Sales: SELL, PM: [...READ, "presales:promote"] },
  routes: [
    { path: "", title: "Presales", component: BoardPage },
    { path: "o/:number", title: "Opportunity", component: OpportunityPage },
  ],
  mcpTools,
  search: search as never,
  retention: [
    // Sales records are kept seven years after the deal closes (or two idle years), then names are anonymised.
    // Rows that record a person only by name are found by it (subjectName), so requests and holds reach them.
    { table: "presales.opportunity", label: "Opportunity owners and leads", subject: ["owner_user_id", "removed_by"], subjectName: ["owner_name", "lead_name"], fields: ["owner_name", "owner_user_id", "lead_name", "removed_by", "lost_reason"], class: "personal", period: "P7Y", start: { at: ["closed_at", "removed_at"], idle: "P2Y" }, action: "anonymise" },
    { table: "presales.stage_change", label: "Stage changes", subject: ["by_actor"], subjectName: ["by_name"], fields: ["by_name", "by_actor", "note"], class: "personal", period: "P7Y", start: { at: ["at"] }, action: "anonymise" },
    { table: "presales.activity", subjectName: ["owner_name"], label: "Sales activities", fields: ["owner_name", "note"], class: "personal", period: "P7Y", start: { at: ["created_at"] }, action: "anonymise" },
    { table: "presales.task", subjectName: ["owner_name"], label: "Sales tasks", fields: ["owner_name"], class: "personal", period: "P7Y", start: { at: ["created_at"] }, action: "anonymise" },
    { table: "presales.risk", subjectName: ["owner_name"], label: "Deal risks", fields: ["owner_name"], class: "personal", period: "P7Y", start: { at: ["created_at"] }, action: "anonymise" },
    { table: "presales.suggestion", subject: ["decided_by"], subjectName: ["owner_name"], label: "Agent suggestions", fields: ["owner_name", "decided_by", "summary"], keep: { client_name: "the client organisation's name, not a person's" }, class: "personal", period: "P1Y", start: { at: ["decided_at", "found_at"] }, action: "anonymise" },
  ],
  chatIntents,
  jobs,
  // 035: outgoing webhooks send only declared fields (review 058).
  events: { emits: Object.values(EVENTS), payloads: {
    [EVENTS.stageChanged]: declarePayload<OpportunityStageChanged>({ opportunityId: "plain", number: "plain", from: "plain", to: "plain", fromChance: "plain", toChance: "plain", by: "plain", reason: "plain" }),
    [EVENTS.promoted]: declarePayload<OpportunityPromoted>({ opportunityId: "plain", number: "plain", projectId: "plain", projectKey: "plain", by: "plain", client: "plain", costCentre: "plain", estimateDays: "plain", ownerName: "plain", leadName: "plain", valueUsd: "plain" }),
  } },
  fixtures: [presalesFixtures],
});
