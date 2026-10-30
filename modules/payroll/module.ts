import { declarePayload, defineModule } from "@amax/core";
import { EVENTS, registerPack, type PayslipsSent, type RunChecked, type RunStepped } from "./contracts";
import { payrollFixtures } from "./fixtures";
import { demoPack } from "./fixtures/demo-pack";
import { mcpTools, search } from "./mcp";
import { bankFile, bankFileAgent, variance, varianceAgent } from "./suggestions";
import { PayrollPage } from "./ui/PayrollPage";

// The demo pack (fictional rates) runs the engine until the Sri Lanka (015) and Australia (016) packs land.
registerPack(demoPack);

const OWN_SLIP = ["payroll:payslip:read"];
const step = declarePayload<RunStepped>({ runId: "plain", payGroupId: "plain", legalEntityId: "plain", period: "plain", status: "plain", by: "plain" });

export default defineModule({
  id: "payroll",
  title: "Payroll",
  icon: "cash",
  group: "People",
  order: 40,
  dependsOn: ["hr", "leave"],
  integratesWith: ["time"],
  permissions: ["payroll:read", "payroll:totals", "payroll:payslip:read", "payroll:run:draft", "payroll:run:check", "payroll:run:approve-hr", "payroll:run:approve-finance", "payroll:change:decide", "payroll:bank-file:approve", "payroll:payslips:send"],
  grants: {
    Payroll: ["payroll:read", "payroll:payslip:read", "payroll:run:draft", "payroll:run:check", "payroll:change:decide", "payroll:bank-file:approve", "payroll:payslips:send"],
    HR: ["payroll:read", "payroll:payslip:read", "payroll:run:approve-hr", "payroll:change:decide"],
    Finance: ["payroll:read", "payroll:totals", "payroll:payslip:read", "payroll:run:approve-finance"],
    Leadership: OWN_SLIP,
    PM: OWN_SLIP,
    Engineer: OWN_SLIP,
    Sales: OWN_SLIP,
    ITAdmin: OWN_SLIP,
    Employee: OWN_SLIP,
  },
  routes: [{ path: "", title: "Payroll", component: PayrollPage }],
  mcpTools,
  search: search as never,
  // Pay records are kept seven years from the period's end; the legal entity column lets each entity's
  // statutory minimum (032, declared by the country packs 015 and 016) lengthen it.
  retention: [
    { table: "payroll.payslip", label: "Payslips", subject: ["person_id", "user_id"], subjectName: ["person_name"], entity: "legal_entity_id", fields: ["person_name", "employee_no", "cost_centre"], class: "pay", period: "P7Y", start: { at: ["period_end"] }, action: "anonymise" },
    { table: "payroll.payslip_line", label: "Payslip lines", subject: ["person_id"], entity: "legal_entity_id", fields: ["label", "basis"], class: "pay", period: "P7Y", start: { at: ["period_end"] }, action: "delete" },
    { table: "payroll.pay_component", label: "Pay components", subject: ["person_id", "recorded_by"], entity: "legal_entity_id", fields: ["label", "basis", "recorded_by"], class: "pay", period: "P7Y", start: { at: ["ends_on"] }, action: "delete" },
    { table: "payroll.change", label: "Changes since last period", subject: ["person_id", "user_id", "decided_by"], subjectName: ["person_name"], entity: "legal_entity_id", fields: ["person_name", "explanation", "decided_by"], class: "pay", period: "P7Y", start: { at: ["created_at"] }, action: "anonymise" },
    { table: "payroll.run", label: "Who took each run step", subject: ["drafted_by", "checked_by", "hr_approved_by", "finance_approved_by", "bank_file_by", "sent_by"], entity: "legal_entity_id",
      fields: ["drafted_by", "checked_by", "hr_approved_by", "finance_approved_by", "bank_file_by", "sent_by"], class: "personal", period: "P7Y", start: { at: ["sent_at", "drafted_at"] }, action: "anonymise",
      keep: { sources: "which modules the draft's figures came from, fixed text", bank_file_at: "when the bank file was made, a timestamp" } },
    { table: "payroll.bank_file", label: "Bank file approvals", subject: ["approved_by"], entity: "legal_entity_id", fields: ["approved_by"], class: "personal", period: "P7Y", start: { at: ["created_at"] }, action: "anonymise" },
  ],
  jobs: [],
  // 035: outgoing webhooks send only declared fields; no event carries an amount.
  events: {
    emits: Object.values(EVENTS),
    handles: [varianceAgent, bankFileAgent],
    payloads: {
      [EVENTS.runDrafted]: step,
      [EVENTS.runChecked]: declarePayload<RunChecked>({ runId: "plain", payGroupId: "plain", legalEntityId: "plain", period: "plain", status: "plain", by: "plain", changes: "plain" }),
      [EVENTS.runHrApproved]: step,
      [EVENTS.runFinanceApproved]: step,
      [EVENTS.bankFileApproved]: step,
      [EVENTS.payslipsSent]: declarePayload<PayslipsSent>({ runId: "plain", payGroupId: "plain", legalEntityId: "plain", period: "plain", status: "plain", by: "plain", payslips: "plain", userIds: "plain" }),
    },
  },
  suggestions: [variance, bankFile],
  fixtures: [payrollFixtures],
});
