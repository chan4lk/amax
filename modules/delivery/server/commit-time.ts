import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { can, type Viewer } from "@amax/auth";
import { defineService, ForbiddenError, getRuntime, type ServiceContext } from "@amax/core/server";
import { withTenant } from "@amax/db";
import { entityZone } from "@amax/workflows";
import { EVENTS, type CommitTime } from "../contracts";
import { dayIn } from "../sync/estimate";
import { claimOne, shaKey } from "./claims";
import { recordActivity } from "./activity";
import { invalid, notFound } from "./refusal";

export const COMMIT_TIME_MANAGE = "delivery:commit-time:manage";
const actorOf = (ctx: ServiceContext) => (ctx.onBehalfOf ? `${ctx.actor.id} for ${ctx.onBehalfOf}` : ctx.actor.id);

/** 008 AC-6: an Admin switches commit time on for a legal entity, only once its people were told. */
export const setCommitTimeLogging = defineService({
  name: "delivery.commit_time.set",
  action: COMMIT_TIME_MANAGE,
  resource: "delivery.commit_time",
  input: z.object({ legalEntityId: z.uuid(), enabled: z.boolean(), peopleNotified: z.boolean().default(false) }),
  async run(tx, input, ctx) {
    if (input.enabled && !input.peopleNotified) throw invalid("tell the entity's people first that commits will draft their timesheets, then switch it on");
    const [before] = await tx.execute(sql`select enabled from delivery.commit_time where legal_entity_id = ${input.legalEntityId}`);
    // 104 review round 1: notified_at is when the current enabled period began. Switching on again after off starts a new
    // period (now), so commits made while it was off never draft; switching on while already on keeps the period.
    await tx.execute(sql`insert into delivery.commit_time (tenant_id, legal_entity_id, enabled, notified_at, set_by) values (${ctx.tenantId}, ${input.legalEntityId}, ${input.enabled}, ${input.enabled ? sql`now()` : null}, ${actorOf(ctx)})
      on conflict (tenant_id, legal_entity_id) do update set enabled = excluded.enabled,
        notified_at = case when delivery.commit_time.enabled and excluded.enabled then delivery.commit_time.notified_at else coalesce(excluded.notified_at, delivery.commit_time.notified_at) end,
        set_by = excluded.set_by, updated_at = now()`);
    return { result: { legalEntityId: input.legalEntityId, enabled: input.enabled }, resourceId: input.legalEntityId, before: { enabled: Boolean(before?.enabled) }, after: { enabled: input.enabled, peopleNotified: input.peopleNotified } };
  },
});

/** Which legal entities draft time from commits. */
export async function commitTimeSettings(viewer: Viewer) {
  if (!can(viewer, COMMIT_TIME_MANAGE)) throw new ForbiddenError(COMMIT_TIME_MANAGE, "delivery.commit_time");
  return withTenant(getRuntime().db, viewer.tenantId, async (tx) => (await tx.execute(sql`select e.id, e.name, coalesce(c.enabled, false) as enabled, c.notified_at
    from core.legal_entity e left join delivery.commit_time c on c.legal_entity_id = e.id order by e.name`)).map((r) => ({ legalEntityId: r.id as string, name: r.name as string, enabled: Boolean(r.enabled), notifiedAt: r.notified_at ? new Date(r.notified_at as string).toISOString() : null })));
}

/**
 * 104 review round 1: the one consent rule. For each person whose legal entity has commit time on, when its current
 * enabled period began (an instant); a person missing from the map has it off. The webhook asks whether it's on; the
 * repo sync also drafts only the days from that instant on.
 */
export async function commitTimeSince(tx: Tx, userIds: string[]): Promise<Map<string, string>> {
  if (!userIds.length) return new Map();
  const rows = await tx.execute(sql`select u.id, c.notified_at from auth.user u join delivery.commit_time c on c.legal_entity_id = u.legal_entity_id
    where c.enabled and c.notified_at is not null and u.id::text in (${sql.join(userIds.map((id) => sql`${id}`), sql`, `)})`);
  return new Map(rows.map((r) => [r.id as string, new Date(r.notified_at as string).toISOString()]));
}

/** Whether this person's legal entity drafts time from commits. */
export const commitTimeOn = async (tx: Tx, userId: string) => (await commitTimeSince(tx, [userId])).has(userId);

/** "Time: 1.5h" in a commit message: hours to draft, at most a working day. */
export function hoursOf(message: string) {
  const m = message.match(/^time:\s*(\d+(?:\.\d+)?)\s*h\b/im);
  const h = m ? Number(m[1]) : NaN;
  return Number.isFinite(h) && h > 0 && h <= 12 ? Math.round(h * 4) / 4 : null;
}

/** 104 review round 2: the person's own day for an instant, by their legal entity's zone (Time's day rule, the sync's too). */
export async function personDay(tx: Tx, userId: string, at: string) {
  const [u] = await tx.execute(sql`select legal_entity_id from auth.user where id = ${userId}`);
  return dayIn(await entityZone(tx, (u?.legal_entity_id as string | null) ?? null))(Date.parse(at));
}

/**
 * 008 AC-3: hours from a commit, sent to the time module as a draft for the person to accept. Never logged here.
 * 104 review round 2: given the commit's instant (`at`), it's held to the same rules as the repo sync: nothing from
 * before the current consent period, and the day is the author's own. `day` alone is the older form: review round 3
 * holds it to the period too, by the day the period began on.
 */
export const draftCommitTime = defineService({
  name: "delivery.commit_time.draft",
  action: "delivery:task:done",
  resource: "delivery.proposal",
  input: z.object({ userId: z.uuid(), key: z.string(), day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), at: z.string().datetime({ offset: true }).optional(),
    hours: z.number().positive().max(12), commit: z.string().min(4).max(64) }).refine((x) => x.day || x.at, "say when: the commit's time (at) or its day"),
  async run(tx, input, ctx) {
    const [p] = await tx.execute(sql`select p.id, p.key, p.project_id, pr.key as project_key from delivery.proposal p join delivery.project pr on pr.id = p.project_id where p.key = ${input.key}`);
    if (!p) throw notFound(`no proposal ${input.key}`);
    const since = (await commitTimeSince(tx, [input.userId])).get(input.userId);
    const off = { result: { drafted: false as boolean, repeated: false as boolean }, resourceId: p.id as string };
    if (!since || (input.at && Date.parse(input.at) < Date.parse(since))) return off;
    const day = input.at ? await personDay(tx, input.userId, input.at) : input.day!;
    if (!input.at && day < (await personDay(tx, input.userId, since))) return off;
    // Review round 3: one key per commit, lowercase, as the repo sync claims it.
    const commit = shaKey(input.commit);
    // 071 review round 1: one draft per person and commit, for every provider (a repeated push drafts nothing).
    // 104 review round 2: the repo sync claims its commits here too, so whichever path counts a commit first, the other
    // drafts nothing for it; nothing claims a whole day.
    // Review round 3: the provider attributed the commit to this person, so this is a trusted path and may take back a
    // claim released when the person dismissed someone else's draft of it.
    if (!(await claimOne(tx, ctx.tenantId, input.userId, commit, true))) return { result: { drafted: false as boolean, repeated: true as boolean }, resourceId: p.id as string };
    await recordActivity(tx, ctx, { projectId: p.project_id as string, text: `drafted ${input.hours} h on ${p.key as string} for the timesheet`, detail: `From commit ${commit.slice(0, 7)}, waiting to be accepted` });
    const payload: CommitTime = { userId: input.userId, projectId: p.project_id as string, projectKey: p.project_key as string, proposalKey: p.key as string, day, hours: input.hours, commit };
    return { result: { drafted: true as boolean, repeated: false as boolean }, resourceId: p.id as string, after: { hours: input.hours, day, commit }, events: [{ name: EVENTS.commitTime, payload }] };
  },
});
