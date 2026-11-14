import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { defineService, ForbiddenError } from "@amax/core/server";

// 104 review rounds 2 and 3 (drafts are untrusted): each commit is counted once, by the first path to claim it in
// delivery.commit_draft. A person's own sync and the webhook are trusted for the person; CI (a service credential) is not,
// so its claims can be released when the person dismisses its draft, and the person's own path can then take them.

/** A full commit sha, lowercase: the one key every path claims by (review round 3). */
export const FULL_SHA = /^[0-9a-f]{40}$/;
export const shaKey = (id: string) => id.toLowerCase();

/** The job that may release claims: Time's, when a person dismisses an untrusted draft. */
export const COMMIT_CLAIMS_JOB = "time.commit-draft";

/**
 * The ids already counted for this person. A trusted path (`own`) may take back a released claim; an untrusted one sees
 * every claim, released or not, as taken, so a dismissed draft isn't pushed again.
 */
export async function takenIds(tx: Tx, userId: string, ids: string[], own: boolean) {
  if (!ids.length) return new Set<string>();
  const rows = await tx.execute(sql`select commit_id from delivery.commit_draft where user_id = ${userId}
    and commit_id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)}) ${own ? sql`and released_at is null` : sql``}`);
  return new Set(rows.map((r) => r.commit_id as string));
}

/**
 * Claims one commit for this person: "new" when this transaction created the claim, "back" when a trusted path (`own`)
 * took back a released one, null when another path holds it.
 */
export async function claimOne(tx: Tx, tenantId: string, userId: string, id: string, own: boolean): Promise<"new" | "back" | null> {
  const [r] = own
    ? await tx.execute(sql`insert into delivery.commit_draft (tenant_id, user_id, commit_id) values (${tenantId}, ${userId}, ${id})
        on conflict (tenant_id, user_id, commit_id) do update set released_at = null where delivery.commit_draft.released_at is not null returning (xmax = 0) as created`)
    : await tx.execute(sql`insert into delivery.commit_draft (tenant_id, user_id, commit_id) values (${tenantId}, ${userId}, ${id}) on conflict do nothing returning true as created`);
  return r ? (r.created ? "new" : "back") : null;
}

/** Undoes this transaction's claims for a day it drafts nothing for: new claims go, taken-back ones are released again. */
export async function unclaim(tx: Tx, userId: string, won: { id: string; how: "new" | "back" }[]) {
  for (const w of won) {
    await (w.how === "new"
      ? tx.execute(sql`delete from delivery.commit_draft where user_id = ${userId} and commit_id = ${w.id}`)
      : tx.execute(sql`update delivery.commit_draft set released_at = now() where user_id = ${userId} and commit_id = ${w.id}`));
  }
}

/** Review round 3: releases an untrusted draft's claims once the person dismisses it. Only Time's job may run it. */
export const releaseCommitClaims = defineService({
  name: "delivery.commit_time.release",
  action: "delivery:commit-time:release",
  resource: "delivery.commit_draft",
  input: z.object({ userId: z.uuid(), commitIds: z.array(z.string().regex(FULL_SHA)).max(2000) }),
  async run(tx, input, ctx) {
    if (ctx.actor.id !== `job:${COMMIT_CLAIMS_JOB}`) throw new ForbiddenError("delivery:commit-time:release", "delivery.commit_draft");
    const ids = input.commitIds.map(shaKey);
    const released = ids.length ? await tx.execute(sql`update delivery.commit_draft set released_at = now() where user_id = ${input.userId} and released_at is null
      and commit_id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)}) returning commit_id`) : [];
    return { result: { released: released.length }, resourceId: input.userId, after: { released: released.length } };
  },
});
