import { declarePayload, defineModule } from "@amax/core";
import { EVENTS, type TechnologyTagged } from "./contracts";
import { careerFixtures } from "./fixtures";
import { mcpTools } from "./mcp";
import { CareerPage, MyCareerPage } from "./ui/CareerPage";

const READ = ["career:read"];

export default defineModule({
  id: "career",
  title: "Career",
  icon: "user",
  group: "People",
  order: 15,
  menu: "profile",
  dependsOn: ["hr"],
  integratesWith: ["allocations", "delivery", "learning"],
  // Everyone may read a career; whose one is decided per person (AC-6): their own, their manager
  // chain's, and HR's and leadership's. Tagging is for HR and the PMs who staff projects.
  permissions: ["career:read", "career:tag"],
  grants: {
    Leadership: READ, PM: [...READ, "career:tag"], HR: [...READ, "career:tag"], Engineer: READ, Employee: READ,
    Finance: READ, Sales: READ, ITAdmin: READ, Payroll: READ,
  },
  routes: [
    { path: "", title: "Your career", component: MyCareerPage },
    // The person page's Career section: served at /hr/p/:employeeNo/career, gated by hr:read there and by who may see this person here.
    { path: "p/:employeeNo/career", title: "Career", mount: "hr", component: CareerPage },
  ],
  mcpTools,
  retention: [
    // Seven years from the event, as hr keeps its documents, then who recorded and approved it is anonymised.
    { table: "career.history", label: "Imported career history", subject: ["person_id"], subjectName: ["recorded_by", "recorded_for", "approved_by"], fields: ["recorded_by", "recorded_for", "approved_by"], keep: { detail: "the event's structured detail the history screen reads; emptying it blanks the record. Anonymising its personal keys is a 070 follow-up" }, class: "personal", period: "P7Y", start: { at: ["effective_on"] }, action: "anonymise" },
    { table: "career.technology", label: "Technology tags", subject: ["person_id", "proposed_by", "confirmed_by"], subjectName: ["proposed_for"], fields: ["proposed_by", "proposed_for", "confirmed_by"], class: "personal", period: "P7Y", start: { at: ["proposed_at"] }, action: "anonymise" },
    { table: "career.import", label: "Who imported a career history", subject: ["person_id", "imported_by"], fields: ["imported_by"], class: "personal", period: "P7Y", start: { at: ["imported_at"] }, action: "anonymise" },
  ],
  events: { emits: Object.values(EVENTS), payloads: {
    [EVENTS.technologyTagged]: declarePayload<TechnologyTagged>({ personId: "plain", project: "plain", technology: "plain", added: "plain", by: "plain" }),
  } },
  fixtures: [careerFixtures],
});
