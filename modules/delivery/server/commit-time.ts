import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { can, type Viewer } from "@amax/auth";
import { defineService, ForbiddenError, getRuntime, type ServiceContext } from "@amax/core/server";
import { withTenant } from "@amax/db";
import { EVENTS, type CommitTime } from "../contracts";
import { recordActivity } from "./activity";

export const COMMIT_TIME_MANAGE = "delivery:commit-time:manage";
const actorOf = (ctx: ServiceContext) => (ctx.onBehalfOf ? `${ctx.actor.id} for ${ctx.onBehalfOf}` : ctx.actor.id);

/** 008 AC-6: an Admin switches commit time on for a legal entity, only once its people were told. */
export const setCommitTimeLogging = defineService({
  name: "delivery.commit_time.set",
  action: COMMIT_TIME_MANAGE,
  resource: "delivery.commit_time",
  input: z.object({ legalEntityId: z.uuid(), enabled: z.boolean(), peopleNotified: z.boolean().default(false) }),
  async run(tx, input, ctx) {
    if (input.enabled && !input.peopleNotified) throw Object.assign(new Error("tell the entity's people first that commits will draft their timesheets, then switch it on"), { retryable: false, code: "invalid_input" });
    const [before] = await tx.execute(sql`select enabled from delivery.commit_time where legal_entity_id = ${input.legalEntityId}`);
    await tx.execute(sql`insert into delivery.commit_time (tenant_id, legal_entity_id, enabled, notified_at, set_by) values (${ctx.tenantId}, ${input.legalEntityId}, ${input.enabled}, ${input.enabled ? sql`now()` : null}, ${actorOf(ctx)})
      on conflict (tenant_id, legal_entity_id) do update set enabled = excluded.enabled, notified_at = coalesce(excluded.notified_at, delivery.commit_time.notified_at), set_by = excluded.set_by, updated_at = now()`);
    return { result: { legalEntityId: input.legalEntityId, enabled: input.enabled }, resourceId: input.legalEntityId, before: { enabled: Boolean(before?.enabled) }, after: { enabled: input.enabled, peopleNotified: input.peopleNotified } };
  },
});

/** Which legal entities draft time from commits. */
export async function commitTimeSettings(viewer: Viewer) {
  if (!can(viewer, COMMIT_TIME_MANAGE)) throw new ForbiddenError(COMMIT_TIME_MANAGE, "delivery.commit_time");
  return withTenant(getRuntime().db, viewer.tenantId, async (tx) => (await tx.execute(sql`select e.id, e.name, coalesce(c.enabled, false) as enabled, c.notified_at
    from core.legal_entity e left join delivery.commit_time c on c.legal_entity_id = e.id order by e.name`)).map((r) => ({ legalEntityId: r.id as string, name: r.name as string, enabled: Boolean(r.enabled), notifiedAt: r.notified_at ? new Date(r.notified_at as string).toISOString() : null })));
}

/** Whether this person's legal entity drafts time from commits. */
export async function commitTimeOn(tx: Tx, userId: string) {
  const [r] = await tx.execute(sql`select c.enabled from auth.user u join delivery.commit_time c on c.legal_entity_id = u.legal_entity_id where u.id = ${userId}`);
  return Boolean(r?.enabled);
}

/** "Time: 1.5h" in a commit message: hours to draft, at most a working day. */
export function hoursOf(message: string) {
  const m = message.match(/^time:\s*(\d+(?:\.\d+)?)\s*h\b/im);
  const h = m ? Number(m[1]) : NaN;
  return Number.isFinite(h) && h > 0 && h <= 12 ? Math.round(h * 4) / 4 : null;
}

/** 008 AC-3: hours from a commit, sent to the time module as a draft for the person to accept. Never logged here. */
export const draftCommitTime = defineService({
  name: "delivery.commit_time.draft",
  action: "delivery:task:done",
  resource: "delivery.proposal",
  input: z.object({ userId: z.uuid(), key: z.string(), day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), hours: z.number().positive().max(12), commit: z.string().min(4).max(64) }),
  async run(tx, input, ctx) {
    const [p] = await tx.execute(sql`select p.id, p.key, p.project_id, pr.key as project_key from delivery.proposal p join delivery.project pr on pr.id = p.project_id where p.key = ${input.key}`);
    if (!p) throw new Error(`no proposal ${input.key}`);
    if (!(await commitTimeOn(tx, input.userId))) return { result: { drafted: false as boolean, repeated: false as boolean }, resourceId: p.id as string };
    // 071 review round 1: one draft per person and commit, for every provider (a repeated push drafts nothing).
    const [first] = await tx.execute(sql`insert into delivery.commit_draft (tenant_id, user_id, commit_id) values (${ctx.tenantId}, ${input.userId}, ${input.commit})
      on conflict do nothing returning commit_id`);
    if (!first) return { result: { drafted: false as boolean, repeated: true as boolean }, resourceId: p.id as string };
    await recordActivity(tx, ctx, { projectId: p.project_id as string, text: `drafted ${input.hours} h on ${p.key as string} for the timesheet`, detail: `From commit ${input.commit.slice(0, 7)}, waiting to be accepted` });
    const payload: CommitTime = { userId: input.userId, projectId: p.project_id as string, projectKey: p.project_key as string, proposalKey: p.key as string, day: input.day, hours: input.hours, commit: input.commit };
    return { result: { drafted: true as boolean, repeated: false as boolean }, resourceId: p.id as string, after: { hours: input.hours, day: input.day, commit: input.commit }, events: [{ name: EVENTS.commitTime, payload }] };
  },
});
