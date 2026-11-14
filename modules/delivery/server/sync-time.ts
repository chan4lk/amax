import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { appendAudit, type Emitted, type ServiceContext } from "@amax/core/server";
import { entityZone } from "@amax/workflows";
import { EVENTS, type CommitTime } from "../contracts";
import { dayIn } from "../sync/estimate";
import { commitTimeSince } from "./commit-time";
import { personOf } from "./owner";
import type { CommitInput } from "./push";
import { dayHours, lockDay, merge, saveDay, shaKey, suggestedHours } from "./ledger";

// 104 AC-4 to AC-8: hours from a change's commits, suggested to the person to accept. The sync never logs, submits or
// approves time. The commit's author is found by a verified git identity (AC-5). Review round 4 (the day ledger): each
// person's day of commits is one locked ledger row (ledger.ts); a push merges its commits in and suggests only what the
// day's estimate has beyond what was already suggested, so the total doesn't depend on when or in what order pushes come.

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
 * the runner) drafts for every author, as untrusted drafts the person may dismiss. Anyone else's commits count as
 * unverified and draft nothing.
 */
const mayDraftFor = (ctx: ServiceContext) => {
  if (ctx.actor.kind === "service") return () => true;
  const me = personOf(ctx);
  return (userId: string) => userId === me;
};

/** Review round 2: who pushed, and whom an agent or credential pushed for, as the rest of Delivery writes it. */
const pusherOf = (ctx: ServiceContext) => (ctx.onBehalfOf ? `${ctx.actor.id} for ${ctx.onBehalfOf}` : ctx.actor.id);

const quarter = (h: number) => Math.round(h * 4) / 4;

/**
 * One person's commits from the start of their consent period, by their own day, days that have ended only; each commit
 * once (one lowercase key), however often a payload repeats it (review round 3).
 */
function byDay(commits: CommitInput[], person: Person, since: string, now: Date) {
  const dayOf = dayIn(person.zone);
  const today = dayOf(now.getTime());
  const out = new Map<string, Map<string, { id: string; at: string }>>();
  for (const c of commits) {
    const ms = Date.parse(c.at);
    if (!Number.isFinite(ms) || ms < Date.parse(since)) continue;
    const day = dayOf(ms);
    if (day >= today) continue;
    const id = shaKey(c.id);
    out.set(day, (out.get(day) ?? new Map()).set(id, { id, at: new Date(ms).toISOString() }));
  }
  return [...out].map(([day, m]) => ({ day, commits: [...m.values()] }));
}

/** Merges one day's commits into its ledger and suggests what's new; the draft, or null when nothing is. */
async function draftDay(tx: Tx, ctx: ServiceContext, a: { userId: string; zone: string; proposalId: string; day: string; commits: { id: string; at: string }[]; own: boolean; source: string }) {
  const l = await lockDay(tx, ctx.tenantId, a.userId, a.proposalId, a.day);
  const added = merge(l, a.commits, a.own);
  if (!added.length) return null;
  await saveDay(tx, a.userId, a.proposalId, a.day, l);
  const hours = quarter(Math.max(0, dayHours(l, a.day, a.zone) - (await suggestedHours(tx, a.userId, a.proposalId, a.day))));
  if (hours <= 0) return null;
  // Review round 1: the row keeps the read it came from and the commits it added, so a later correction can be traced.
  const [d] = await tx.execute(sql`insert into delivery.commit_day_draft (tenant_id, user_id, proposal_id, day, hours, commits, source, commit_ids, drafted_by)
    values (${ctx.tenantId}, ${a.userId}, ${a.proposalId}, ${a.day}, ${hours}, ${added.length}, ${a.source}, ${JSON.stringify(added)}::jsonb, ${pusherOf(ctx)}) returning id`);
  return { id: d.id as string, hours, added };
}

export async function draftSyncTime(tx: Tx, ctx: ServiceContext, project: { id: string; key: string }, records: SyncTimeRecord[], read: { source: string; now: Date }): Promise<SyncTimeResult> {
  const out: SyncTimeResult = { drafted: 0, unlinked: 0, unverified: 0, events: [] };
  const people = await peopleOf(tx, [...new Set(records.flatMap((r) => r.commits.map((c) => c.email.toLowerCase())))]);
  const consent = await commitTimeSince(tx, [...new Set([...people.values()].map((p) => p.userId))]);
  const may = mayDraftFor(ctx);
  const own = ctx.actor.kind !== "service";
  for (const r of records) {
    const byUser = new Map<string, { person: Person; commits: CommitInput[] }>();
    for (const c of r.commits) {
      const person = people.get(c.email.toLowerCase());
      if (!person) { out.unlinked++; continue; }
      if (!may(person.userId)) { out.unverified++; continue; }
      byUser.set(person.userId, { person, commits: [...(byUser.get(person.userId)?.commits ?? []), c] });
    }
    for (const [userId, { person, commits }] of byUser) {
      const since = consent.get(userId);
      if (!since) continue;
      for (const { day, commits: dayCommits } of byDay(commits, person, since, read.now)) {
        const d = await draftDay(tx, ctx, { userId, zone: person.zone, proposalId: r.proposalId, day, commits: dayCommits, own, source: read.source });
        if (!d) continue;
        const after = { proposalId: r.proposalId, userId, day, hours: d.hours, commits: d.added.length, source: read.source, commitIds: d.added };
        // 104 AC-11: the proposal's history says the hours were drafted; Time shows the line by its own rule.
        await appendAudit(tx, ctx, { action: "delivery.commit_time.draft", resource: "delivery.proposal", resourceId: r.proposalId, after });
        // Review round 4: no pusher in the event (it stays in commit_day_draft.drafted_by, a retention subject); the
        // draft's id lets Time dismiss it, and `trusted` says whether the person pushed it themselves.
        const payload: CommitTime = { userId, projectId: project.id, projectKey: project.key, proposalKey: r.proposalKey, day, hours: d.hours,
          commit: `${r.proposalKey}/${day}/${d.added[0]}`, commits: d.added.length, source: "repo", draftId: d.id, trusted: own };
        out.events.push({ name: EVENTS.commitTime, payload });
        out.drafted++;
      }
    }
  }
  return out;
}
