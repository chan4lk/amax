import { declarePayload, defineModule } from "@amax/core";
import { EVENTS, type ApplicationReceived, type HireConfirmed, type Hired, type OfferSent, type RoleOpened } from "./contracts";
import { recruitmentFixtures } from "./fixtures";
import { mcpTools, search } from "./mcp";
import { hireAgent, hrRecord, joinedLink } from "./server/hire";
import { screen, screenAgent } from "./suggestions";
import { RecruitmentPage } from "./ui/RecruitmentPage";

const READ = ["recruitment:read"];
const hired = { applicationId: "plain", roleId: "plain", legalEntityId: "plain", startsOn: "plain", by: "plain" } as const;

export default defineModule({
  id: "recruitment",
  title: "Recruitment",
  icon: "briefcase",
  group: "People",
  order: 20,
  dependsOn: ["hr"],
  integratesWith: [],
  permissions: ["recruitment:read", "recruitment:role:manage", "recruitment:candidate:manage", "recruitment:offer:send"],
  grants: {
    HR: [...READ, "recruitment:role:manage", "recruitment:candidate:manage", "recruitment:offer:send"],
    Leadership: READ,
  },
  routes: [{ path: "", title: "Recruitment", component: RecruitmentPage }],
  mcpTools,
  search: search as never,
  // 032: a candidate who isn't hired is anonymised twelve months after the decision (the tenant default
  // "Candidates not hired"); a hire's candidate record goes the same way once hr holds the person.
  retention: [
    { table: "recruitment.candidate", label: "Candidates not hired", subjectName: ["name"], entity: "legal_entity_id", fields: ["name", "email", "cv"], class: "candidate", period: "P12M", start: { at: ["decided_at"] }, action: "anonymise" },
    { table: "recruitment.application", label: "Hiring decisions and agent evidence", subject: ["person_id", "moved_by", "hr_confirmed_by"], entity: "legal_entity_id",
      fields: ["close_note", "agent_evidence", "moved_by", "hr_confirmed_by"], class: "candidate", period: "P12M", start: { at: ["closed_at", "hired_at"] }, action: "anonymise" },
    { table: "recruitment.interview", label: "Who recorded interviews", subject: ["recorded_by"], fields: ["recorded_by"], class: "personal", period: "P12M", start: { at: ["scheduled_at"] }, action: "anonymise" },
    { table: "recruitment.offer", label: "Who sent offers", subject: ["sent_by"], entity: "legal_entity_id", fields: ["sent_by"], class: "personal", period: "P7Y", start: { at: ["sent_at"] }, action: "anonymise" },
    { table: "recruitment.role", label: "Who raised roles", subject: ["raised_by"], entity: "legal_entity_id", fields: ["raised_by", "reason"], class: "personal", period: "P7Y", start: { at: ["closed_at"] }, action: "anonymise" },
  ],
  jobs: [],
  // 035: outgoing webhooks send only declared fields; no event carries a candidate's name or CV.
  events: {
    emits: Object.values(EVENTS),
    handles: [screenAgent, hireAgent, joinedLink],
    payloads: {
      [EVENTS.roleOpened]: declarePayload<RoleOpened>({ roleId: "plain", legalEntityId: "plain", title: "plain", openings: "plain", by: "plain" }),
      [EVENTS.applicationReceived]: declarePayload<ApplicationReceived>({ applicationId: "plain", roleId: "plain", legalEntityId: "plain", by: "plain" }),
      [EVENTS.offerSent]: declarePayload<OfferSent>({ applicationId: "plain", offerId: "plain", legalEntityId: "plain", provider: "plain", by: "plain" }),
      [EVENTS.hired]: declarePayload<Hired>(hired),
      [EVENTS.hireConfirmed]: declarePayload<HireConfirmed>({ ...hired, confirmedBy: "plain" }),
    },
  },
  suggestions: [screen, hrRecord],
  fixtures: [recruitmentFixtures],
});
