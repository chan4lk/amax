import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { defineService, ValidationError, type ServiceContext } from "@amax/core/server";
import { kindOf, SuggestionError, type SuggestionScope } from "./kinds";

export const SUGGEST = "suggestions:create";
export const DECIDE = "suggestions:decide";
export const READ = "suggestions:read";

export const CHANNELS = ["internal", "email", "teams", "ticket", "document"] as const;
export type Channel = (typeof CHANNELS)[number];
export type Status = "open" | "queried" | "approved" | "accepting" | "accepted" | "undoing" | "undone" | "dismissed";

export const Evidence = z.object({ type: z.enum(["record", "message", "run", "link"]), label: z.string().min(1).max(200), ref: z.string().min(1).max(500) });
export const Source = z.object({ channel: z.enum(CHANNELS), label: z.string().min(1).max(200).optional(), ref: z.string().max(500).optional() })
  .refine((s) => s.channel === "internal" || Boolean(s.label), { message: "an external source needs a label saying where it came from", path: ["label"] });
const Scope = z.object({ projectId: z.uuid().nullish(), ownerUserId: z.uuid().nullish(), legalEntityId: z.uuid().nullish(), department: z.string().nullish() });

export const SuggestionInput = z.object({
  kind: z.string().min(3),
  target: z.object({ type: z.string().min(1).max(60), id: z.string().min(1).max(200), label: z.string().min(1).max(200) }),
  title: z.string().min(3).max(200),
  detail: z.string().max(2000).optional(),
  proposed: z.unknown(),
  evidence: z.array(Evidence).max(20).default([]),
  confidence: z.number().min(0).max(1),
  source: Source.default({ channel: "internal" }),
  scope: Scope.default({}),
  agentName: z.string().min(2).max(80),
  expiresInDays: z.number().int().min(1).max(30).default(7),
  runId: z.uuid().optional(),
});
export type SuggestionInput = z.input<typeof SuggestionInput>;

/** The person an agent acts for: the principal's person, or the signed-in person whose agent this is. */
export const actsFor = (ctx: ServiceContext) => ctx.onBehalfOf ?? (ctx.actor.kind === "user" ? ctx.actor.id : null);
export const personOf = (ctx: ServiceContext) => (ctx.actor.kind === "user" ? ctx.actor.id : null);

// 006 AC-1, AC-6: the proposed change is validated against its kind's schema before it is stored.
export const createSuggestion = defineService({
  name: "agents.suggestion.create",
  action: SUGGEST,
  resource: "agents.suggestion",
  input: SuggestionInput,
  async run(tx, input, ctx) {
    const kind = kindOf(input.kind);
    const proposed = kind.proposed.safeParse(input.proposed);
    if (!proposed.success) throw new ValidationError(proposed.error.issues.map((i) => ({ ...i, path: ["proposed", ...i.path] })));
    // An agent that runs again proposes the same open change once: the open suggestion is returned.
    const [open] = await tx.execute(sql`select id, expires_at from agents.suggestion where kind = ${input.kind} and target_type = ${input.target.type} and target_id = ${input.target.id}
      and status in ('open', 'queried', 'approved') and expires_at >= now() limit 1`);
    if (open) return { result: { id: open.id as string, kind: input.kind, status: "open" as Status, expiresAt: new Date(open.expires_at as string).toISOString(), existing: true }, resourceId: open.id as string, after: { existing: true } };
    const [row] = await tx.execute(sql`insert into agents.suggestion (tenant_id, kind, target_type, target_id, target_label, title, detail, proposed, evidence, confidence,
        agent, agent_name, acts_for, source_channel, source_label, source_ref, scope, run_id, expires_at)
      values (${ctx.tenantId}, ${input.kind}, ${input.target.type}, ${input.target.id}, ${input.target.label}, ${input.title}, ${input.detail ?? null}, ${JSON.stringify(proposed.data)}::jsonb,
        ${JSON.stringify(input.evidence)}::jsonb, ${input.confidence}, ${ctx.actor.id}, ${input.agentName}, ${actsFor(ctx)}, ${input.source.channel}, ${input.source.label ?? null},
        ${input.source.ref ?? null}, ${JSON.stringify(input.scope)}::jsonb, ${input.runId ?? null}, now() + make_interval(days => ${input.expiresInDays})) returning id, expires_at`);
    const id = row.id as string;
    return {
      result: { id, kind: input.kind, status: "open" as Status, expiresAt: new Date(row.expires_at as string).toISOString(), existing: false },
      resourceId: id,
      after: { kind: input.kind, target: input.target, agent: ctx.actor.id, agentName: input.agentName, actsFor: actsFor(ctx), source: input.source.channel, confidence: input.confidence },
      events: [{ name: "agents.suggestion.created", payload: { suggestionId: id, kind: input.kind } }],
    };
  },
});

/**
 * 073: an agent withdraws its own open suggestions about records that no longer stand (a superseded invoice draft),
 * so nobody accepts a stale amount. They read as dismissed, with the reason, and leave no decision to a person.
 */
export const withdrawSuggestions = defineService({
  name: "agents.suggestion.withdraw",
  action: SUGGEST,
  resource: "agents.suggestion",
  input: z.object({ kind: z.string(), targetType: z.string(), targetIds: z.array(z.string()).max(200), reason: z.string().min(3).max(300) }),
  async run(tx, a, ctx) {
    if (!a.targetIds.length) return { result: { withdrawn: 0 }, resourceId: null, after: { withdrawn: 0 } };
    const ids = sql.join(a.targetIds.map((t) => sql`${t}`), sql`, `);
    const rows = await tx.execute(sql`update agents.suggestion set status = 'dismissed', decided_by = ${ctx.actor.id}, decided_at = now(), query_note = ${a.reason}, updated_at = now()
      where kind = ${a.kind} and target_type = ${a.targetType} and target_id in (${ids}) and status in ('open', 'queried', 'approved') returning id`);
    return { result: { withdrawn: rows.length }, resourceId: (rows[0]?.id as string | undefined) ?? null, after: { withdrawn: rows.length, reason: a.reason } };
  },
});

export type Row = Record<string, unknown> & { id: string; kind: string; status: Status; proposed: unknown; applied: unknown; scope: SuggestionScope; acts_for: string | null; first_approved_by: string | null };

export async function lockRow(tx: Tx, id: string, allowed: Status[]): Promise<Row> {
  const [r] = await tx.execute(sql`select *, expires_at < now() as expired, undo_until < now() as undo_over from agents.suggestion where id = ${id} for update`);
  if (!r) throw Object.assign(new SuggestionError(`suggestion ${id} not found`), { code: "not_found" });
  if (!allowed.includes(r.status as Status)) throw new SuggestionError(`that suggestion is ${r.status}`);
  return r as Row;
}
