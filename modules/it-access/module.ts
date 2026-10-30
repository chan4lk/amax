import { declarePayload, defineModule } from "@amax/core";
import { EVENTS, type ChangeApplied, type ChangeQueued, type ConsentChanged, type ReviewRecorded, type SyncCompleted } from "./contracts";
import { itAccessFixtures } from "./fixtures";
import { mcpTools, search } from "./mcp";
import { licenceAgent } from "./server/agents";
import { leaverAgent, onboardingAccess } from "./server/leavers";
import { APPROVE, CONSENT, READ, REQUEST, REVIEW } from "./server/read";
import { accessKinds } from "./suggestions";
import { AccessPage } from "./ui/AccessPage";
import { applySchedule, applyWorkflow, syncSchedule, syncWorkflow } from "./workflows";

export default defineModule({
  id: "it-access",
  title: "Access and licences",
  icon: "key",
  group: "Operations",
  order: 70,
  dependsOn: ["hr"],
  integratesWith: ["onboarding"],
  // IT Admin reads, asks for and approves changes, and records reviews. Consenting to the write
  // registration (CONSENT) is Admin alone; it-access:sync is the jobs' own write, held by no role.
  permissions: [READ, REQUEST, APPROVE, REVIEW, CONSENT, "it-access:sync"],
  grants: { ITAdmin: [READ, REQUEST, APPROVE, REVIEW] },
  routes: [{ path: "", title: "Access and licences", component: AccessPage }],
  mcpTools,
  search: search as never,
  retention: [
    { table: "it_access.account", label: "Accounts and access reviews", subject: ["person_id", "reviewed_by"], subjectName: ["display_name"], entity: "legal_entity_id",
      fields: ["display_name", "reviewed_by"], class: "personal", period: "P1Y", start: { at: ["left_on", "expires_on"] }, action: "anonymise" },
    { table: "it_access.seat", label: "Who removed licence seats", subject: ["removed_by"], fields: ["removed_by"], class: "personal", period: "P2Y", start: { at: ["removed_on"] }, action: "anonymise" },
    { table: "it_access.change", label: "Who approved access changes", subject: ["approved_by"], fields: ["approved_by"], keep: { detail: "what the change runner applies (products, skuIds, externalUserId); emptying it breaks a queued change. Its directory user id is a 070 follow-up" }, class: "personal", period: "P7Y", start: { at: ["approved_at"] }, action: "anonymise" },
    { table: "it_access.sync_run", label: "Access sync runs", subject: ["started_by"], fields: ["started_by"], keep: { summary: "the run's counts, written by amax; the row is deleted when due" }, class: "personal", period: "P1Y", start: { at: ["finished_at"] }, action: "delete" },
    { table: "it_access.write_consent", label: "Who consented to the write registration", subject: ["consented_by"], fields: ["consented_by"], class: "personal", period: "P7Y", start: { at: ["consented_at"] }, action: "anonymise" },
  ],
  jobs: [],
  workflows: [syncWorkflow, applyWorkflow],
  schedules: [syncSchedule, applySchedule],
  // 035: outgoing webhooks send only declared fields: ids, actions, dates and counts, never money or names.
  events: {
    emits: Object.values(EVENTS),
    handles: [licenceAgent, leaverAgent, onboardingAccess],
    payloads: {
      [EVENTS.syncCompleted]: declarePayload<SyncCompleted>({ source: "plain", status: "plain", products: "plain", devices: "plain", by: "plain" }),
      [EVENTS.changeQueued]: declarePayload<ChangeQueued>({ changeId: "plain", action: "plain", accountId: "plain", productId: "plain", effectiveOn: "plain", by: "plain" }),
      [EVENTS.changeApplied]: declarePayload<ChangeApplied>({ changeId: "plain", action: "plain", status: "plain" }),
      [EVENTS.reviewRecorded]: declarePayload<ReviewRecorded>({ accountId: "plain", personId: "plain", reviewedOn: "plain", by: "plain" }),
      [EVENTS.consentChanged]: declarePayload<ConsentChanged>({ enabled: "plain", scopes: "plain", by: "plain" }),
    },
  },
  suggestions: accessKinds,
  fixtures: [itAccessFixtures],
});
