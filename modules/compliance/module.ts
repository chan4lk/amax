import { declarePayload, defineModule } from "@amax/core";
import { chatIntents } from "./chat";
import * as C from "./contracts";
import { complianceFixtures } from "./fixtures";
import { mcpTools } from "./mcp";
import { auditChainCheck, auditChainSchedule } from "./server/chain";
import { ACKNOWLEDGE, MANAGE, READ, REPORT } from "./server/context";
import { breachReminders, breachReminderSchedule } from "./server/reminders";
import { CompliancePage } from "./ui/CompliancePage";

const { EVENTS } = C;
const EVERYONE = [REPORT, ACKNOWLEDGE];
const OFFICER = [READ, MANAGE, ...EVERYONE];
const P = "plain" as const;
const INCIDENT = { incidentId: P, ref: P, title: P, status: P, breach: P, ownerUserId: P, by: P };
const BREACH = { incidentId: P, ref: P, title: P, ownerUserId: P, country: P, notifyBy: P, regulator: P };
const RISK = { riskId: P, ref: P, level: P, ownerUserId: P, by: P };

export default defineModule({
  id: "compliance",
  title: "Compliance",
  icon: "doc",
  group: "Operations",
  order: 10,
  dependsOn: ["hr"],
  // A.6.3 training evidence reads learning's contract; without learning, and until 021 lands for access reviews, the control shows the gap.
  integratesWith: ["it-access", "learning"],
  permissions: [READ, MANAGE, REPORT, ACKNOWLEDGE],
  // Admin, IT Admin and HR keep the registers; Leadership reads them. Everyone reports incidents and acknowledges their own policies.
  grants: {
    ITAdmin: OFFICER, HR: OFFICER, Leadership: [READ, ...EVERYONE],
    PM: EVERYONE, Engineer: EVERYONE, Finance: EVERYONE, Sales: EVERYONE, Payroll: EVERYONE, Employee: EVERYONE,
  },
  routes: [{ path: "", title: "Compliance", component: CompliancePage }],
  mcpTools,
  chatIntents,
  retention: [
    { table: "compliance.incident", label: "Incidents", subject: ["owner_user_id", "reported_by", "decided_by"], subjectName: ["owner_name"], entity: "legal_entity_id",
      fields: ["owner_user_id", "owner_name", "reported_by", "decided_by", "description"], keep: { notify_by: "the breach notification deadline, a timestamp" }, class: "personal", period: "P7Y", start: { at: ["resolved_on"] }, action: "anonymise" },
    { table: "compliance.risk", label: "Risks", subject: ["owner_user_id", "raised_by"], subjectName: ["owner_name"],
      fields: ["owner_user_id", "owner_name", "raised_by", "description"], class: "personal", period: "P7Y", start: { at: ["closed_at"] }, action: "anonymise" },
    { table: "compliance.policy", label: "Policy versions", subject: ["published_by"], fields: ["published_by"], keep: { summary: "the policy's own summary, organisation text" }, class: "personal", period: "P7Y", start: { at: ["published_on"] }, action: "anonymise" },
    { table: "compliance.supplier", label: "Suppliers", subject: ["added_by"], fields: ["added_by"], class: "personal", period: "P7Y", start: { at: [], idle: "P7Y" }, action: "anonymise" },
    { table: "compliance.evidence_bundle", label: "Evidence bundles", subject: ["generated_by"], fields: ["generated_by", "contents"], class: "personal", period: "P7Y", start: { at: ["generated_at"] }, action: "anonymise" },
  ],
  workflows: [auditChainCheck, breachReminders],
  schedules: [auditChainSchedule, breachReminderSchedule],
  // 030: people hear about policies to acknowledge; owners and Admins about breaches and their deadlines; Admins about a broken audit chain.
  notifications: [
    { id: "compliance.acknowledge", event: EVENTS.acknowledgementRequested, category: "reminders", to: [{ owner: "userId" }], subject: "userId",
      title: "Please read and acknowledge {title} v{version}", body: "Ask amax to acknowledge it once you have read it" },
    { id: "compliance.breach", event: EVENTS.breachFlagged, category: "reminders", urgency: "urgent", to: [{ owner: "ownerUserId" }, { role: "Admin" }], permission: MANAGE,
      title: "Possible personal-data breach {ref}: decide by {notifyBy}", body: "{title}. The deadline is the {regulator} rule from the country pack.", href: "/compliance" },
    { id: "compliance.breach-deadline", event: EVENTS.breachDeadline, category: "reminders", urgency: "urgent", to: [{ owner: "ownerUserId" }], permission: MANAGE,
      title: "{ref}: the breach decision is due in {daysLeft} days", body: "{title}. Decide by {notifyBy}.", href: "/compliance" },
    { id: "compliance.chain-broken", event: EVENTS.chainChecked, when: { ok: false }, category: "reminders", urgency: "urgent", to: [{ role: "Admin" }], permission: MANAGE,
      title: "The audit log no longer verifies at event {brokenAt}", href: "/compliance" },
  ],
  events: {
    emits: Object.values(EVENTS),
    payloads: {
      [EVENTS.policyPublished]: declarePayload<C.PolicyPublished>({ policyId: P, key: P, title: P, version: P, inScope: P, by: P }),
      [EVENTS.acknowledgementRequested]: declarePayload<C.AcknowledgementRequested>({ policyId: P, title: P, version: P, userId: P }),
      [EVENTS.policyAcknowledged]: declarePayload<C.PolicyAcknowledged>({ policyId: P, version: P, personId: P, userId: P }),
      [EVENTS.riskRaised]: declarePayload<C.RiskRaised>(RISK),
      [EVENTS.riskChanged]: declarePayload<C.RiskChanged>({ ...RISK, status: P, changed: P }),
      [EVENTS.incidentReported]: declarePayload<C.IncidentReported>(INCIDENT),
      [EVENTS.incidentChanged]: declarePayload<C.IncidentChanged>({ ...INCIDENT, changed: P }),
      [EVENTS.breachFlagged]: declarePayload<C.BreachFlagged>(BREACH),
      [EVENTS.breachDeadline]: declarePayload<C.BreachDeadline>({ ...BREACH, daysLeft: P }),
      [EVENTS.supplierChanged]: declarePayload<C.SupplierChanged>({ supplierId: P, name: P, subprocessor: P, status: P, by: P }),
      [EVENTS.chainChecked]: declarePayload<C.ChainChecked>({ checkId: P, ok: P, events: P, headSeq: P, brokenAt: P }),
      [EVENTS.evidenceExported]: declarePayload<C.EvidenceExported>({ bundleId: P, control: P, periodFrom: P, periodTo: P, digest: P, by: P }),
    },
  },
  fixtures: [complianceFixtures],
});
