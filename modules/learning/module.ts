import { declarePayload, defineModule } from "@amax/core";
import { chatIntents } from "./chat";
import { EVENTS, type CertificationExpiring, type CertificationRecorded, type Completed, type Enrolled, type ProgrammeCreated } from "./contracts";
import { learningFixtures } from "./fixtures";
import { mcpTools, search } from "./mcp";
import { LearningPage } from "./ui/LearningPage";
import { schedules, workflows } from "./workflows";

const READ = ["learning:read"];

export default defineModule({
  id: "learning",
  title: "Learning",
  icon: "book",
  group: "People",
  order: 40,
  dependsOn: ["hr"],
  integratesWith: [],
  permissions: ["learning:read", "learning:programme:create", "learning:enrol", "learning:certification:record", "learning:remind"],
  grants: {
    Leadership: READ,
    PM: [...READ, "learning:remind"],
    HR: [...READ, "learning:programme:create", "learning:enrol", "learning:certification:record", "learning:remind"],
  },
  routes: [{ path: "", title: "Learning", component: LearningPage }],
  mcpTools,
  search: search as never,
  retention: [
    // Training and certification records are evidence for audits (ISO 27001 among them): kept seven
    // years after completion or expiry, then who recorded them is anonymised. People are hr.person ids.
    { table: "learning.programme", label: "Who added a programme", subject: ["created_by"], fields: ["created_by"], keep: { detail: "the programme's description, organisation text" }, class: "personal", period: "P7Y", start: { at: ["ends_on"] }, action: "anonymise" },
    { table: "learning.enrolment", label: "Learning records", subject: ["person_id", "enrolled_by", "completed_by"], fields: ["enrolled_by", "completed_by"], class: "personal", period: "P7Y", start: { at: ["completed_on"] }, action: "anonymise" },
    { table: "learning.certification", label: "Certifications", subject: ["person_id", "recorded_by"], fields: ["recorded_by"], class: "personal", period: "P7Y", start: { at: ["expires_on"] }, action: "anonymise" },
    { table: "learning.reminder", label: "Certification reminders", subject: ["requested_by"], fields: ["requested_by"], class: "personal", period: "P2Y", start: { at: ["sent_at"] }, action: "delete" },
  ],
  chatIntents,
  // 030: the holder hears about an expiring certification; they may not open /learning, so no link.
  notifications: [
    { id: "learning.certification-expiring", event: EVENTS.certificationExpiring, category: "reminders", to: [{ owner: "userId" }], subject: "userId",
      title: "Your {name} certification expires on {expiresOn}", body: "{daysLeft} days left to renew it" },
  ],
  jobs: [],
  workflows,
  schedules,
  // 035: outgoing webhooks send only declared fields (review 058).
  events: { emits: Object.values(EVENTS), payloads: {
    [EVENTS.programmeCreated]: declarePayload<ProgrammeCreated>({ programmeId: "plain", number: "plain", title: "plain", kind: "plain", mandatory: "plain", by: "plain" }),
    [EVENTS.enrolled]: declarePayload<Enrolled>({ programmeId: "plain", personIds: "plain", by: "plain" }),
    [EVENTS.completed]: declarePayload<Completed>({ enrolmentId: "plain", programmeId: "plain", personId: "plain", completedOn: "plain", by: "plain" }),
    [EVENTS.certificationRecorded]: declarePayload<CertificationRecorded>({ certificationId: "plain", personId: "plain", name: "plain", expiresOn: "plain", by: "plain" }),
    [EVENTS.certificationExpiring]: declarePayload<CertificationExpiring>({ certificationId: "plain", personId: "plain", userId: "plain", name: "plain", expiresOn: "plain", daysLeft: "plain", kind: "plain", by: "plain" }),
  } },
  fixtures: [learningFixtures],
});
