import { sql } from "drizzle-orm";
import { z } from "zod";
import type { EventHandlerDef } from "@amax/core";
import { contextFor } from "@amax/core/server";
import { defineSuggestionKind } from "@amax/agents";
import { createSuggestion, SuggestionError, withdrawSuggestions } from "@amax/agents/server";
import { EVENTS as DELIVERY, type ReleaseDeployed } from "@amax/delivery/contracts";
import { EVENTS, type InvoiceDrafted } from "./contracts";
import { BILLING_AGENT } from "./server/agent";
import { issued } from "./server/billing";
import { draftMilestones } from "./server/drafts";
import { lockContract, writeInvoice } from "./server/issue";
import { actorOf, amt, todayOf } from "./server/read";

const Draft = z.object({ draftId: z.uuid(), contractId: z.uuid(), amount: z.string(), currency: z.string(), description: z.string() });
type Draft = z.infer<typeof Draft>;

export const invoiceDraft = defineSuggestionKind<Draft, { invoiceId: string }>({
  kind: "finance.invoice-draft",
  title: "Invoice draft",
  permission: "finance:invoice:issue",
  proposed: Draft,
  async apply(tx, ctx, p) {
    const [d] = await tx.execute(sql`select * from finance.draft where id = ${p.draftId} for update`);
    if (!d || d.status !== "open") throw new SuggestionError("that draft was replaced or invoiced since; decide the newer one");
    if (amt(d.amount) !== amt(p.amount)) throw new SuggestionError("that draft's amount moved since; decide the newer one");
    const c = await lockContract(tx, p.contractId);
    const by = actorOf(ctx);
    const inv = await writeInvoice(tx, ctx.tenantId, c, { source: d.source as "tm", description: d.description as string, subtotal: amt(d.amount), hours: d.hours as string | null, period: d.period as string | null, milestoneId: d.milestone_id as string | null, issuedOn: await todayOf(tx), by });
    await tx.execute(sql`update finance.draft set status = 'invoiced', invoice_id = ${inv.id} where id = ${d.id}`);
    if (d.milestone_id) await tx.execute(sql`update finance.milestone set status = 'invoiced' where id = ${d.milestone_id}`);
    return { applied: { invoiceId: inv.id }, action: "finance.invoice.issue", resource: "finance.invoice", resourceId: inv.id, after: { number: inv.number, subtotal: inv.subtotal, draftId: d.id },
      events: [{ name: EVENTS.invoiceIssued, payload: issued(inv, c, d.source as string, by) }] };
  },
  async undo(tx, ctx, p, applied) {
    const [i] = await tx.execute(sql`select * from finance.invoice where id = ${applied.invoiceId} and not exists (select 1 from finance.payment where invoice_id = ${applied.invoiceId}) for update`);
    if (!i) throw new SuggestionError("a payment is recorded against that invoice, so issue a credit note instead");
    const c = await lockContract(tx, p.contractId);
    const cn = await writeInvoice(tx, ctx.tenantId, c, { source: "credit", description: `Credit for ${i.number as string}: draft accepted in error`, subtotal: `-${amt(i.subtotal)}`, creditsId: i.id as string, period: i.period as string | null, issuedOn: await todayOf(tx), by: actorOf(ctx) });
    await tx.execute(sql`update finance.draft set status = 'open', invoice_id = null where id = ${p.draftId}`);
    if (i.milestone_id) await tx.execute(sql`update finance.milestone set status = 'drafted' where id = ${i.milestone_id}`);
    return { applied: null, action: "finance.invoice.undo", resource: "finance.invoice", resourceId: i.id as string, after: { creditNote: cn.number } };
  },
});

export const draftAgent: EventHandlerDef = {
  id: "finance.draft-agent",
  event: EVENTS.invoiceDrafted,
  async handle({ tx, tenantId, event }) {
    const e = event.payload as InvoiceDrafted;
    const ctx = contextFor.job(tenantId, "finance.draft-agent");
    // 073: a draft replaced by a newer one (an approval, a reopen) takes its suggestion with it, so the inbox only ever
    // offers the current amount.
    const stale = await tx.execute(sql`select id from finance.draft where contract_id = ${e.contractId} and status = 'superseded' order by created_at desc limit 200`);
    await withdrawSuggestions(ctx, { kind: invoiceDraft.kind, targetType: "finance.draft", targetIds: stale.map((r) => r.id as string), reason: "A newer draft replaced this one" });
    const [d] = await tx.execute(sql`select d.*, c.currency, c.client, c.project_id from finance.draft d join finance.contract c on c.id = d.contract_id where d.id = ${e.draftId} and d.status = 'open'`);
    if (!d) return;
    const why = e.source === "tm" ? "Approved billable time not yet invoiced" : "Its release reached Prod";
    await createSuggestion(ctx, {
      kind: invoiceDraft.kind, target: { type: "finance.draft", id: e.draftId, label: `${d.client as string}: ${d.description as string}` },
      title: `Invoice ${d.client as string}, ${amt(d.amount)} ${d.currency as string}`, detail: `${why}: ${d.description as string}.`,
      proposed: { draftId: e.draftId, contractId: e.contractId, amount: amt(d.amount), currency: String(d.currency), description: d.description as string },
      confidence: 0.9, agentName: BILLING_AGENT, scope: { legalEntityId: e.legalEntityId, projectId: d.project_id as string }, evidence: [{ type: "record", label: "Financials", ref: `/finance?contract=${e.contractId}` }],
    });
  },
};

export const releaseAgent: EventHandlerDef = {
  id: "finance.release-agent",
  event: DELIVERY.releaseDeployed,
  async handle({ tenantId, event }) {
    const e = event.payload as ReleaseDeployed;
    if (!e.released || e.status !== "deployed") return;
    await draftMilestones(contextFor.job(tenantId, "finance.release-agent"), { projectId: e.projectId, version: e.version });
  },
};
