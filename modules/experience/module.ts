import { declarePayload, defineModule } from "@amax/core";
import { chatIntents } from "./chat";
import { EVENTS, type CollectionCompleted, type CollectionSet, type FixAccepted, type PulseSent, type ScoreDropped } from "./contracts";
import { experienceFixtures } from "./fixtures";
import { mcpTools } from "./mcp";
import { ADMIN, ANSWER, COLLECT, FIX, OWN, PULSE, READ } from "./server/read";
import { closeOnDismiss, fixKind, suggestFixes } from "./suggestions";
import { ExperiencePage } from "./ui/ExperiencePage";
import { collectSchedule, collectWorkflow, remediateSchedule, remediateWorkflow } from "./workflows";

// Admin and Leadership read the screen, IT Admin too (it decides the fixes). Everyone answers the
// pulse and reads their own devices. experience:collect is the jobs' own write, held by no role.
const EVERYONE = [OWN, ANSWER];

export default defineModule({
  id: "experience",
  title: "Digital experience",
  icon: "chart",
  group: "Operations",
  order: 80,
  dependsOn: ["hr", "it-access"],
  integratesWith: ["helpdesk", "notifications", "insights"],
  permissions: [READ, ADMIN, FIX, PULSE, ANSWER, OWN, COLLECT],
  grants: {
    Leadership: [...EVERYONE, READ, PULSE],
    ITAdmin: [...EVERYONE, READ, FIX],
    PM: EVERYONE, Engineer: EVERYONE, Finance: EVERYONE, Sales: EVERYONE, HR: EVERYONE, Payroll: EVERYONE, Employee: EVERYONE,
  },
  routes: [{ path: "", title: "Digital experience", component: ExperiencePage }],
  mcpTools,
  // 032 (AC-6): device data is deleted 90 days after the reading (a device 90 days after it was last
  // seen). Who switched collection or remediation on, approved a fix or sent a pulse is kept seven years.
  retention: [
    { table: "experience.device", label: "Devices in digital experience", subject: ["owner_user_id", "person_id"], entity: "legal_entity_id", fields: ["owner_user_id", "person_id", "department"],
      class: "personal", period: "P90D", start: { at: ["last_seen_at"] }, action: "delete" },
    { table: "experience.device_day", label: "Device health readings", subject: ["owner_user_id"], fields: ["owner_user_id"], class: "personal", period: "P90D", start: { at: ["collected_at"] }, action: "delete" },
    { table: "experience.device_app_day", label: "App crash and hang readings", subject: ["owner_user_id"], fields: ["owner_user_id"], class: "personal", period: "P90D", start: { at: ["collected_at"] }, action: "delete" },
    { table: "experience.collection", label: "Who switched experience collection", subject: ["set_by"], entity: "legal_entity_id", fields: ["set_by"], class: "personal", period: "P7Y", start: { at: ["set_at"] }, action: "anonymise" },
    { table: "experience.settings", label: "Who switched remediation", subject: ["remediation_set_by"], fields: ["remediation_set_by"], class: "personal", period: "P7Y", start: { at: ["remediation_set_at"] }, action: "anonymise" },
    { table: "experience.remediation", label: "Who approved a remediation", subject: ["approved_by"], fields: ["approved_by"], class: "personal", period: "P7Y", start: { at: ["approved_at"] }, action: "anonymise" },
    { table: "experience.pulse", label: "Who sent a pulse survey", subject: ["sent_by"], fields: ["sent_by"], keep: { question: "the survey's question to everyone, organisation text" }, class: "personal", period: "P7Y", start: { at: ["sent_on"] }, action: "anonymise" },
  ],
  chatIntents,
  workflows: [collectWorkflow, remediateWorkflow],
  schedules: [collectSchedule, remediateSchedule],
  // 030 (AC-4): each person gets the pulse on their own channels (Teams when they chose it).
  notifications: [{ id: "experience.pulse", event: EVENTS.pulseSent, category: "reminders", to: [{ owner: "userId" }], title: "Pulse survey: {question}",
    body: "One anonymous question, at most once a fortnight. Answer it in amax chat: \"Answer the pulse survey\"." }],
  // 035: outgoing webhooks send only declared fields: ids, counts, groups of 5 or more, never a person's reading.
  events: {
    emits: Object.values(EVENTS),
    handles: [suggestFixes, closeOnDismiss],
    payloads: {
      [EVENTS.collected]: declarePayload<CollectionCompleted>({ devices: "plain", entities: "plain", issues: "plain" }),
      [EVENTS.collectionSet]: declarePayload<CollectionSet>({ legalEntityId: "plain", enabled: "plain", noticeOn: "plain", by: "plain" }),
      [EVENTS.pulseSent]: declarePayload<PulseSent>({ pulseId: "plain", userId: "plain", question: "plain" }),
      [EVENTS.fixAccepted]: declarePayload<FixAccepted>({ issueId: "plain", fix: "plain", devices: "plain", by: "plain" }),
      [EVENTS.scoreDropped]: declarePayload<ScoreDropped>({ dimension: "plain", group: "plain", from: "plain", to: "plain", asOf: "plain" }),
    },
  },
  suggestions: [fixKind],
  fixtures: [experienceFixtures],
});
