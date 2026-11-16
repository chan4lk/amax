import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { defineService, ForbiddenError } from "@amax/core/server";
import { estimateDays } from "../sync/estimate";

// 104 review round 4 (product owner, 2026-11-14: the day ledger). One row per person, proposal and day of theirs holds
// that day's commits with their times, from every path: the person's own sync ("own"), CI ("ci") and the webhook's
// `Time:` line ("hook"). Each path locks the row first, so they can't race. A day's estimate is always over its whole
// set (hook and dismissed commits left out), and a push suggests only what the estimate has beyond the hours already
// suggested for that day, so the total doesn't depend on when or in what order the commits arrive.

export type By = "own" | "ci" | "hook";
export type Entry = { at: string; by: By; dismissed?: boolean };
export type Ledger = Record<string, Entry>;

/** A full commit sha, lowercase: the one key every path records a commit by. */
export const FULL_SHA = /^[0-9a-f]{40}$/;
export const shaKey = (id: string) => id.toLowerCase();

/** The day's ledger, locked for this transaction (made empty first if there's none). */
export async function lockDay(tx: Tx, tenantId: string, userId: string, proposalId: string, day: string): Promise<Ledger> {
  await tx.execute(sql`insert into delivery.commit_ledger (tenant_id, user_id, proposal_id, day) values (${tenantId}, ${userId}, ${proposalId}, ${day}) on conflict do nothing`);
  const [r] = await tx.execute(sql`select commits from delivery.commit_ledger where user_id = ${userId} and proposal_id = ${proposalId} and day = ${day} for update`);
  return (r.commits ?? {}) as Ledger;
}

export const saveDay = (tx: Tx, userId: string, proposalId: string, day: string, l: Ledger) =>
  tx.execute(sql`update delivery.commit_ledger set commits = ${JSON.stringify(l)}::jsonb, updated_at = now() where user_id = ${userId} and proposal_id = ${proposalId} and day = ${day}`);

/**
 * Merges a push's commits for one day into its ledger; returns the ids it added (or brought back). A commit any path
 * already recorded stays as it is, except that the person's own sync confirms a CI commit (and brings back a dismissed
 * one). A webhook's commit is never estimated.
 */
export function merge(l: Ledger, commits: { id: string; at: string }[], own: boolean): string[] {
  const added: string[] = [];
  for (const c of commits) {
    const e = l[c.id];
    if (!e) { l[c.id] = { at: c.at, by: own ? "own" : "ci" }; added.push(c.id); continue; }
    if (own && e.by === "ci") { if (e.dismissed) added.push(c.id); l[c.id] = { at: e.at, by: "own" }; }
  }
  return added;
}

/** The day's hours over its whole set: hook and dismissed commits left out; the estimate's own rule (estimate.ts). */
export function dayHours(l: Ledger, day: string, zone: string) {
  const counted = Object.entries(l).filter(([, e]) => e.by !== "hook" && !e.dismissed).map(([id, e]) => ({ id, at: e.at }));
  return estimateDays(counted, zone).find((d) => d.day === day)?.hours ?? 0;
}

/** Hours already suggested for the day: every repo draft not dismissed. */
export async function suggestedHours(tx: Tx, userId: string, proposalId: string, day: string) {
  const [r] = await tx.execute(sql`select coalesce(sum(hours), 0) as hours from delivery.commit_day_draft
    where user_id = ${userId} and proposal_id = ${proposalId} and day = ${day} and dismissed_at is null`);
  return Number(r.hours);
}

/** The job that may dismiss a draft: Time's, when the person dismisses one someone else pushed. */
export const COMMIT_CLAIMS_JOB = "time.commit-draft";

/**
 * Review rounds 3 and 4: the person dismissed a draft someone else pushed. The draft no longer counts as suggested, and
 * the CI commits it added leave the day's estimate, so neither CI's next draft nor anyone's carries their time again;
 * the person's own sync can still bring them back. Only Time's job may run it.
 */
export const dismissRepoDraft = defineService({
  name: "delivery.commit_time.dismiss",
  action: "delivery:commit-time:release",
  resource: "delivery.commit_day_draft",
  input: z.object({ draftId: z.uuid() }),
  async run(tx, input, ctx) {
    if (ctx.actor.id !== `job:${COMMIT_CLAIMS_JOB}`) throw new ForbiddenError("delivery:commit-time:release", "delivery.commit_day_draft");
    const [d] = await tx.execute(sql`select user_id, proposal_id, to_char(day, 'YYYY-MM-DD') as day, commit_ids from delivery.commit_day_draft where id = ${input.draftId} and dismissed_at is null`);
    if (!d) return { result: { dismissed: false }, resourceId: input.draftId };
    const l = await lockDay(tx, ctx.tenantId, d.user_id as string, d.proposal_id as string, d.day as string);
    for (const id of d.commit_ids as string[]) if (l[id]?.by === "ci") l[id] = { ...l[id], dismissed: true };
    await saveDay(tx, d.user_id as string, d.proposal_id as string, d.day as string, l);
    await tx.execute(sql`update delivery.commit_day_draft set dismissed_at = now() where id = ${input.draftId}`);
    return { result: { dismissed: true }, resourceId: input.draftId, after: { dismissed: true } };
  },
});
