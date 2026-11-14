import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { appendAudit, type Emitted, type ServiceContext } from "@amax/core/server";
import { entityZone } from "@amax/workflows";
import { EVENTS, type CommitTime } from "../contracts";
import { dayIn, estimateDays } from "../sync/estimate";
import { commitTimeSince } from "./commit-time";
import { personOf } from "./owner";
import type { CommitInput } from "./push";
import { claimOne, takenIds, unclaim } from "./claims";

// 104 AC-4 to AC-8: hours from a change's commits, drafted for the person to accept. Each draft is a row of
// delivery.commit_day_draft (several a day are possible) and the commit-time event Time turns into a timesheet
// suggestion; the sync never logs, submits or approves time. The commit's author is found by a verified git identity
// (AC-5). Review rounds 2 and 3 (drafts are untrusted): each commit is counted once, claimed in commit_draft (claims.ts),
// and a day drafts only the hours its estimate has beyond what is already drafted for it, so the total doesn't depend on
// when or how often the repo is pushed.

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
 * Hours already drafted for this person, proposal and day by drafts this estimate covers: every commit of the draft is
 * among the day's commits here (so the two figures measure the same work) and still claimed (a draft the person
 * dismissed was released, and no longer counts). Read before this push claims anything (review round 3).
 */
async function draftedHours(tx: Tx, userId: string, proposalId: string, day: string, ids: string[]) {
  const [r] = await tx.execute(sql`select coalesce(sum(d.hours), 0) as hours from delivery.commit_day_draft d
    where d.user_id = ${userId} and d.proposal_id = ${proposalId} and d.day = ${day} and d.commit_ids <@ ${JSON.stringify(ids)}::jsonb
      and not exists (select 1 from jsonb_array_elements_text(d.commit_ids) c(id) join delivery.commit_draft k on k.user_id = d.user_id and k.commit_id = c.id
                      where k.released_at is not null)`);
  return Number(r.hours);
}

/** Commits only the webhook's `Time:` line drafted (claimed, in no repo draft): their hours are its, so they leave the estimate. */
async function webhookOnly(tx: Tx, userId: string, ids: string[]) {
  if (!ids.length) return new Set<string>();
  const rows = await tx.execute(sql`select k.commit_id from delivery.commit_draft k where k.user_id = ${userId}
    and k.commit_id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
    and not exists (select 1 from delivery.commit_day_draft d where d.user_id = k.user_id and d.commit_ids ? k.commit_id)`);
  return new Set(rows.map((r) => r.commit_id as string));
}

const quarter = (h: number) => Math.round(h * 4) / 4;

/** Review round 3: one key per commit (a full sha, lowercase), and each commit once however often a payload repeats it. */
const distinct = (commits: CommitInput[]) => [...new Map(commits.map((c) => [c.id.toLowerCase(), { ...c, id: c.id.toLowerCase() }])).values()];

export async function draftSyncTime(tx: Tx, ctx: ServiceContext, project: { id: string; key: string }, records: SyncTimeRecord[], read: { source: string; now: Date }): Promise<SyncTimeResult> {
  const out: SyncTimeResult = { drafted: 0, unlinked: 0, unverified: 0, events: [] };
  const people = await peopleOf(tx, [...new Set(records.flatMap((r) => r.commits.map((c) => c.email.toLowerCase())))]);
  const consent = await commitTimeSince(tx, [...new Set([...people.values()].map((p) => p.userId))]);
  const may = mayDraftFor(ctx);
  const own = ctx.actor.kind !== "service";
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
      const mine = distinct(commits);
      const hook = await webhookOnly(tx, userId, mine.map((c) => c.id));
      const days = daysFor(mine.filter((c) => !hook.has(c.id)), person, since, read.now);
      const taken = await takenIds(tx, userId, days.flatMap((d) => d.ids), own);
      for (const d of days) {
        const fresh = d.ids.filter((id) => !taken.has(id));
        if (!fresh.length) continue;
        // Claimed before anything is counted; a day whose commits this transaction didn't all win drafts nothing and
        // is left as it was, for the next sync to estimate again (review rounds 2 and 3).
        const prior = await draftedHours(tx, userId, r.proposalId, d.day, d.ids);
        const won: { id: string; how: "new" | "back" }[] = [];
        for (const id of fresh) { const how = await claimOne(tx, ctx.tenantId, userId, id, own); if (how) won.push({ id, how }); }
        if (won.length < fresh.length) { await unclaim(tx, userId, won); continue; }
        const hours = quarter(Math.max(0, d.hours - prior));
        if (hours <= 0) continue;
        // Review round 1: the row keeps the read it came from and its commits, so a later correction can be traced.
        await tx.execute(sql`insert into delivery.commit_day_draft (tenant_id, user_id, proposal_id, day, hours, commits, source, commit_ids, drafted_by)
          values (${ctx.tenantId}, ${userId}, ${r.proposalId}, ${d.day}, ${hours}, ${fresh.length}, ${read.source}, ${JSON.stringify(fresh)}::jsonb, ${pusherOf(ctx)})`);
        const after = { proposalId: r.proposalId, userId, day: d.day, hours, commits: fresh.length, source: read.source, commitIds: fresh };
        // 104 AC-11: the proposal's history says the hours were drafted; Time shows the line by its own rule.
        await appendAudit(tx, ctx, { action: "delivery.commit_time.draft", resource: "delivery.proposal", resourceId: r.proposalId, after });
        // One draft per set of commits: its first commit names it. Who pushed it, and whether that was the person, go
        // with it, so Time can say where it came from and release it if the person dismisses an untrusted one.
        const payload: CommitTime = { userId, projectId: project.id, projectKey: project.key, proposalKey: r.proposalKey, day: d.day, hours,
          commit: `${r.proposalKey}/${d.day}/${fresh[0]}`, commits: fresh.length, source: "repo", pushedBy: pusherOf(ctx), commitIds: fresh, trusted: own };
        out.events.push({ name: EVENTS.commitTime, payload });
        out.drafted++;
      }
    }
  }
  return out;
}
