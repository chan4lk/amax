import { declarePayload, defineModule } from "@amax/core";
import { EVENTS, type ContractCreated, type CreditNoteIssued, type InvoiceDrafted, type InvoiceIssued, type PaymentRecorded } from "./contracts";
import { financeFixtures } from "./fixtures";
import { mcpTools, search } from "./mcp";
import { financeOverview } from "./server/overview";
import { draftAgent, invoiceDraft, releaseAgent } from "./suggestions";
import { timeHandlers } from "./server/time-sync";
import { FinancePage } from "./ui/FinancePage";

const WRITE = ["finance:read", "finance:contract:write", "finance:invoice:draft", "finance:invoice:issue", "finance:payment:record"];
const issued = { invoiceId: "plain", number: "plain", contractId: "plain", projectId: "plain", legalEntityId: "plain", source: "plain", by: "plain" } as const;

export default defineModule({
  id: "finance",
  title: "Financials",
  icon: "wallet",
  group: "Business",
  order: 30,
  dependsOn: ["delivery"],
  integratesWith: ["time"],
  permissions: WRITE,
  grants: { Finance: WRITE, Leadership: ["finance:read"] },
  routes: [{ path: "", title: "Financials", component: FinancePage }],
  mcpTools,
  overview: financeOverview as never,
  search: search as never,
  retention: [
    { table: "finance.contract", label: "Who created each contract", subject: ["created_by"], entity: "legal_entity_id", fields: ["created_by"], class: "personal", period: "P7Y", start: { at: ["created_at"] }, action: "anonymise" },
    { table: "finance.invoice", label: "Who issued each invoice", subject: ["issued_by"], entity: "legal_entity_id", fields: ["issued_by"], keep: { tax_lines: "the invoice's tax amounts by rate, no person in them", description: "what was invoiced, part of the statutory invoice record" }, class: "personal", period: "P7Y", start: { at: ["created_at"] }, action: "anonymise" },
    { table: "finance.payment", label: "Who recorded each payment", subject: ["recorded_by"], fields: ["recorded_by"], class: "personal", period: "P7Y", start: { at: ["created_at"] }, action: "anonymise" },
  ],
  jobs: [],
  events: {
    emits: Object.values(EVENTS),
    handles: [draftAgent, ...timeHandlers, releaseAgent],
    payloads: {
      [EVENTS.contractCreated]: declarePayload<ContractCreated>({ contractId: "plain", projectId: "plain", legalEntityId: "plain", kind: "plain", by: "plain" }),
      [EVENTS.invoiceDrafted]: declarePayload<InvoiceDrafted>({ draftId: "plain", contractId: "plain", legalEntityId: "plain", source: "plain" }),
      [EVENTS.invoiceIssued]: declarePayload<InvoiceIssued>(issued),
      [EVENTS.creditNoteIssued]: declarePayload<CreditNoteIssued>({ ...issued, creditsId: "plain" }),
      [EVENTS.paymentRecorded]: declarePayload<PaymentRecorded>({ paymentId: "plain", invoiceId: "plain", contractId: "plain", legalEntityId: "plain", by: "plain" }),
    },
  },
  suggestions: [invoiceDraft],
  fixtures: [financeFixtures],
});
