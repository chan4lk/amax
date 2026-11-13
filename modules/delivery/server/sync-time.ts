import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { appendAudit, type Emitted, type ServiceContext } from "@amax/core/server";
import { entityZone } from "@amax/workflows";
import { EVENTS, type CommitTime } from "../contracts";
import { dayIn, estimateDays } from "../sync/estimate";
import { commitTimeSince } from "./commit-time";
import { personOf } from "./owner";
import type { CommitInput } from "./push";

// 104 AC-4 to AC-8: hours from a change's commits, drafted for the person to accept. The sync writes a draft row (one
// per person, proposal and day) and raises the commit-time event Time turns into a timesheet suggestion; it never
// logs, submits or approves time. The commit's author is found by a verified git identity (AC-5), never by who pushed.

export type SyncTimeRecord = { proposalId: string; proposalKey: string; commits: CommitInput[] };
export type SyncTimeResult = { drafted: number; unlinked: number; unverified: number; events: Emitted[] };

type Person = { userId: string; zone: string };

/** Each email's person, through a verified git identity (008 AC-2), with the zone their days are kept in (Time's rule). */
async function peopleOf(tx: Tx, emails: string[]) {
  const out = new Map<string, Person>();
  if (!emails.length) return out;
  const rows = await tx.execute(sql`select distinct on (lower(g.email)) lower(g.email) as email, g.user_id, u.legal_entity_id from auth.git_identity g join auth.user u on u.id = g.user_id
    where g.email_verified and u.status = 'active' and lower(g.email) in (${sql.join(emails.map((e) => sql`${e}`), sql`, `)}) order by lower(g.email), g.id`);
  for (const r of rows) out.set(r.email as string, { userId: r.user_id as string, zone: await entityZone(tx, (r.legal_entity_id as string | null) ?? null) });
  return out;
}

/**
 * Review round 1: who a push may draft hours for. The pusher controls the payload, so a person's own push (the plugin,
 * directly or through an agent) drafts only their own commits. A service credential (CI, made by an Admin, reading git on
 * the runner) drafts for every author. Anyone else's commits count as unverified and draft nothing.
 */
const mayDraftFor = (ctx: ServiceContext) => {
  if (ctx.actor.kind === "service") return () => true;
  const me = personOf(ctx);
  return (userId: string) => userId === me;
};

/** The days to draft for one person: from the start of their consent period, up to their own today (not included). */
function daysFor(commits: CommitInput[], person: Person, since: string, now: Date) {
  const today = dayIn(person.zone)(now.getTime());
  // Review round 2: the day's count and ids come from the estimate's own per-day set, so they always agree.
  return estimateDays(commits.filter((c) => Date.parse(c.at) >= Date.parse(since)), person.zone).filter((d) => d.day < today);
}

/** Review round 2: who pushed, and whom an agent or credential pushed for, as the rest of Delivery writes it. */
const pusherOf = (ctx: ServiceContext) => (ctx.onBehalfOf ? `${ctx.actor.id} for ${ctx.onBehalfOf}` : ctx.actor.id);

/**
 * 104 AC-7, review round 2: each commit drafts once, whichever path counts it first (this sync, another sync, or the
 * webhook's `Time:` line). The commits are claimed before anything is counted, and only the claims this transaction won
 * (`returning`) are estimated, so two concurrent drafts can't both count a commit. Only commits on days that have ended
 * are claimed, so today's are left for a later sync.
 */
async function claim(tx: Tx, tenantId: string, userId: string, ids: string[]) {
  const won = new Set<string>();
  for (const id of ids) {
    const [r] = await tx.execute(sql`insert into delivery.commit_draft (tenant_id, user_id, commit_id) values (${tenantId}, ${userId}, ${id}) on conflict do nothing returning commit_id`);
    if (r) won.add(id);
  }
  return won;
}

export async function draftSyncTime(tx: Tx, ctx: ServiceContext, project: { id: string; key: string }, records: SyncTimeRecord[], read: { source: string; now: Date }): Promise<SyncTimeResult> {
  const out: SyncTimeResult = { drafted: 0, unlinked: 0, unverified: 0, events: [] };
  const people = await peopleOf(tx, [...new Set(records.flatMap((r) => r.commits.map((c) => c.email.toLowerCase())))]);
  const consent = await commitTimeSince(tx, [...new Set([...people.values()].map((p) => p.userId))]);
  const may = mayDraftFor(ctx);
  for (const r of records) {
    const byUser = new Map<string, CommitInput[]>();
    for (const c of r.commits) {
      const person = people.get(c.email.toLowerCase());
      if (!person) { out.unlinked++; continue; }
      if (!may(person.userId)) { out.unverified++; continue; }
      byUser.set(person.userId, [...(byUser.get(person.userId) ?? []), c]);
    }
    for (const [userId, commits] of byUser) {
      const since = consent.get(userId);
      if (!since) continue;
      const person = [...people.values()].find((p) => p.userId === userId)!;
      const due = daysFor(commits, person, since, read.now).flatMap((d) => d.ids);
      const won = await claim(tx, ctx.tenantId, userId, due);
      for (const d of daysFor(commits.filter((c) => won.has(c.id)), person, since, read.now)) {
        // Review round 1: the row keeps the read it came from and its commits, so a later correction can be traced.
        await tx.execute(sql`insert into delivery.commit_day_draft (tenant_id, user_id, proposal_id, day, hours, commits, source, commit_ids, drafted_by)
          values (${ctx.tenantId}, ${userId}, ${r.proposalId}, ${d.day}, ${d.hours}, ${d.commits}, ${read.source}, ${JSON.stringify(d.ids)}::jsonb, ${pusherOf(ctx)})`);
        const after = { proposalId: r.proposalId, userId, day: d.day, hours: d.hours, commits: d.commits, source: read.source, commitIds: d.ids };
        // 104 AC-11: the proposal's history says the hours were drafted; Time shows the line by its own rule.
        await appendAudit(tx, ctx, { action: "delivery.commit_time.draft", resource: "delivery.proposal", resourceId: r.proposalId, after });
        // One draft per set of commits (several a day are possible): the first commit names it, and the push says who sent it.
        const payload: CommitTime = { userId, projectId: project.id, projectKey: project.key, proposalKey: r.proposalKey, day: d.day, hours: d.hours,
          commit: `${r.proposalKey}/${d.day}/${d.ids[0]}`, commits: d.commits, source: "repo", pushedBy: pusherOf(ctx) };
        out.events.push({ name: EVENTS.commitTime, payload });
        out.drafted++;
      }
    }
  }
  return out;
}
