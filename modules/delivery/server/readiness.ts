import { sql } from "drizzle-orm";
import type { Phase } from "../contracts";

/**
 * 087 (review round 2): withdrawn, once: by hand (withdrawn_at), or by its repo (the sync sets meta.withdrawn when a spec
 * folder goes). The TS form reads meta as the SQL form does (`->> 'withdrawn' = 'true'`), so a string "true" counts in both.
 */
export const isWithdrawn = (r: { withdrawn_at?: unknown; meta?: unknown }) =>
  Boolean(r.withdrawn_at) || String((r.meta as { withdrawn?: unknown } | null)?.withdrawn) === "true";
/** The same rule in SQL, for a table or alias (`p`, or `delivery.proposal` when unaliased). */
export const withdrawnIn = (t: "p" | "delivery.proposal") => sql.raw(`(${t}.withdrawn_at is not null or coalesce(${t}.meta->>'withdrawn', 'false') = 'true')`);

/**
 * Review 081 round 1 (B4): the attention rules, once. The list's chips and order (attention.ts), the agent's "Ready to
 * verify" suggestion (agent.ts) and a person's Overview panel (overview.ts) all ask these, so they can't disagree.
 */
export type ReadinessFacts = { phase: Phase; source: string | null; tasksDone: number; tasksTotal: number; withdrawn: boolean };

/**
 * Ready to verify: a proposal made by hand, still open, in Building, with every task done. A spec proposal's phase
 * follows its repo (move_proposal refuses it), so amax never calls one ready: there is nothing to do here.
 */
export const isReadyToVerify = (p: ReadinessFacts) =>
  !p.withdrawn && p.source === null && p.phase === "building" && p.tasksTotal > 0 && p.tasksDone === p.tasksTotal;

/**
 * 087 AC-1: has no owner: no owner user and no owner name. A row with only a name (made before 081, or named by a sync)
 * is owned, so no suggestion or pin replaces a named owner; linking it to a person is a deliberate update_proposal.
 */
export const hasNoOwner = (p: { ownerUserId: string | null; ownerName: string | null }) => !p.ownerUserId && !p.ownerName;

/**
 * 087 (review round 3): the owner name a screen or card shows, once, in SQL: the stored name, else the owner user's, else
 * "Unknown person" for an owner user whose name can't be read. Null only when it has no owner (hasNoOwner).
 */
export const ownerShownIn = (t: "p") =>
  sql.raw(`coalesce(${t}.owner_name, (select u.name from auth.user u where u.id = ${t}.owner_user_id), case when ${t}.owner_user_id is not null then 'Unknown person' end)`);

/** Over the estimate: approved hours above an estimate it has. */
export const overEstimate = (p: { hours: number; estimateHours: number | null }) => p.estimateHours !== null && p.hours > p.estimateHours;
