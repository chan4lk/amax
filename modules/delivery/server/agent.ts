import { sql } from "drizzle-orm";
import type { EventHandlerDef } from "@amax/core";
import type { Tx } from "@amax/db";
import { contextFor } from "@amax/core/server";
import { createSuggestion, withdrawSuggestions } from "@amax/agents/server";
import { EVENTS, proposalHref, type Phase, type ProposalPhaseChanged, type ProposalWithdrawn, type TaskReopened, type TaskDone } from "../contracts";
import { readyToVerify, suggestedOwner } from "./proposal-kinds";
import { hasNoOwner, isReadyToVerify, isWithdrawn } from "./readiness";

// 081 amendment 2 (AC-32 to AC-34): the Delivery agent. It reads Delivery's own events, suggests (never writes), and
// takes back what no longer fits. The platform keeps one open suggestion per kind and proposal, and expires them in 7 days.
const AGENT = "delivery.proposal-agent";
const TARGET = "delivery.proposal";

async function proposalOf(tx: Tx, id: string) {
  const [p] = await tx.execute(sql`select p.id, p.key, p.title, p.phase, p.source, p.tasks_done, p.tasks_total, p.owner_user_id, p.owner_name, p.withdrawn_at, p.meta,
      pr.id as project_id, pr.manager_user_id, pr.legal_entity_id
    from delivery.proposal p join delivery.project pr on pr.id = p.project_id where p.id = ${id}`);
  return p;
}

/** The person behind "user:…", "agent:claude for user:…" or "sp:… for user:…"; null for a bare service or job. */
const personIn = (by: string) => [...by.matchAll(/user:([0-9a-f-]{36})/g)].at(-1)?.[1] ?? null;

const open = (p: Record<string, unknown>) => !isWithdrawn(p) && p.phase !== "released";

async function suggest(tenantId: string, p: Record<string, unknown>, s: { kind: string; title: string; detail: string; proposed: Record<string, unknown>; confidence: number }) {
  // The agent acts for the project's manager, who the suggestion is first for (Allocations' agent does the same).
  const ctx = contextFor.job(tenantId, AGENT, p.manager_user_id ? `user:${p.manager_user_id as string}` : undefined);
  await createSuggestion(ctx, {
    ...s, target: { type: TARGET, id: p.id as string, label: `${p.key as string} ${p.title as string}` }, agentName: "Delivery agent",
    scope: { projectId: p.project_id as string, legalEntityId: (p.legal_entity_id as string | null) ?? null },
    evidence: [{ type: "record", label: `${p.key as string} ${p.title as string}`, ref: proposalHref(p.key as string) }],
  });
}

/** Whether "Ready to verify" still fits: a hand-made proposal, still work, in Building, with every task done. */
const readyNow = (p: Record<string, unknown>) => open(p) && isReadyToVerify({ phase: p.phase as Phase, source: (p.source as string | null) ?? null,
  tasksDone: Number(p.tasks_done), tasksTotal: Number(p.tasks_total), withdrawn: false });

/** Takes back this proposal's open suggestions that no longer fit what it is now. */
async function tidy(tx: Tx, tenantId: string, proposalId: string) {
  const p = await proposalOf(tx, proposalId);
  if (!p) return;
  const now = !open(p) ? (p.phase === "released" ? "released" : "withdrawn") : String(p.phase);
  if (!readyNow(p)) await withdraw(tenantId, [readyToVerify.kind], proposalId, `${p.key as string} is ${now} now`);
  if (!open(p)) await withdraw(tenantId, [suggestedOwner.kind], proposalId, `${p.key as string} was ${now}`);
}

const withdraw = (tenantId: string, kinds: string[], proposalId: string, reason: string) =>
  Promise.all(kinds.map((kind) => withdrawSuggestions(contextFor.job(tenantId, AGENT), { kind, targetType: TARGET, targetIds: [proposalId], reason })));

export const proposalAgent: EventHandlerDef[] = [
  {
    id: "delivery.agent.task-done",
    event: EVENTS.taskDone,
    async handle({ tx, tenantId, event }) {
      const e = event.payload as TaskDone;
      const p = await proposalOf(tx, e.proposalId);
      if (!p || !open(p)) return;
      const total = Number(p.tasks_total);
      if (readyNow(p)) {
        await suggest(tenantId, p, { kind: readyToVerify.kind, title: `Move ${p.key as string} to Verified`, confidence: 0.9,
          detail: total === 1 ? `The only task of ${p.key as string}, ${e.task}, is done.` : `All ${total} tasks of ${p.key as string} are done; ${e.task} was the last.`, proposed: { proposalId: p.id, key: p.key } });
      }
      const person = personIn(e.by);
      if (hasNoOwner({ ownerUserId: (p.owner_user_id as string | null) ?? null, ownerName: (p.owner_name as string | null) ?? null }) && person) {
        const [u] = await tx.execute(sql`select id, name from auth.user where id::text = ${person} and status = 'active'`);
        if (u) await suggest(tenantId, p, { kind: suggestedOwner.kind, title: `Make ${u.name as string} the owner of ${p.key as string}`, confidence: 0.7,
          detail: `${p.key as string} has no owner. ${u.name as string} closed ${e.task}.`, proposed: { proposalId: p.id, key: p.key, userId: u.id, name: u.name } });
      }
    },
  },
  // The outbox doesn't promise order (a retry, or one tick delivering several events), so what to take back is decided by
  // the proposal as it is now, never by what an event says it became: an older "moved to Planned" delivered after the
  // last task closed must not withdraw a suggestion that still fits (081 amendment 2 walk-through, 2026-11-04).
  { id: "delivery.agent.phase", event: EVENTS.proposalPhaseChanged, handle: ({ tx, tenantId, event }) => tidy(tx, tenantId, (event.payload as ProposalPhaseChanged).proposalId) },
  { id: "delivery.agent.withdrawn", event: EVENTS.proposalWithdrawn, handle: ({ tx, tenantId, event }) => tidy(tx, tenantId, (event.payload as ProposalWithdrawn).proposalId) },
  // 081 amendment 5 (AC-59): a reopened task makes Ready to verify untrue again.
  { id: "delivery.agent.reopened", event: EVENTS.taskReopened, handle: ({ tx, tenantId, event }) => tidy(tx, tenantId, (event.payload as TaskReopened).proposalId) },
];
