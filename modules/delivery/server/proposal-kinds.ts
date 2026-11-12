import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { defineSuggestionKind } from "@amax/agents";
import { SuggestionError } from "@amax/agents/server";
import { setOwnerIn } from "./lifecycle";
import { namedOwner, notOnProject } from "./owner";
import { moveIn } from "./services";
import { hasNoOwner } from "./readiness";

// 081 amendment 2 (AC-32, AC-33): what the Delivery agent may suggest about a proposal. A person accepts it (the
// platform checks the kind's permission on the suggestion's project); apply is the same write as the board or
// update_proposal, as that person, and re-checks under the row lock that the suggestion still fits, else nothing is
// written. Proposals are named by id: a rekey (CON-019 → CON-H001) can't send the change to another proposal.

const keyOf = async (tx: Tx, proposalId: string) => {
  const [p] = await tx.execute(sql`select key from delivery.proposal where id = ${proposalId}`);
  if (!p) throw new SuggestionError("that proposal is gone; nothing was changed");
  return p.key as string;
};
const stale = (why: string): never => { throw new SuggestionError(`${why}; nothing was changed`); };

const Verify = z.object({ proposalId: z.uuid(), key: z.string() });
type Verify = z.infer<typeof Verify>;

const move = async (tx: Tx, ctx: Parameters<typeof moveIn>[1], p: Verify, to: "verified" | "building", fits: (row: Record<string, unknown>, key: string) => void) => {
  const key = await keyOf(tx, p.proposalId);
  const out = await moveIn(tx, ctx, { key, to }, (row) => fits(row, key));
  return { applied: { key }, action: "delivery.proposal.move", resource: "delivery.proposal", resourceId: out.resourceId, before: out.before ?? null, after: out.after ?? null, events: out.events ?? [] };
};

export const readyToVerify = defineSuggestionKind<Verify, { key: string }>({
  kind: "delivery.proposal-verify",
  title: "Ready to verify",
  permission: "delivery:proposal:move",
  proposed: Verify,
  apply: (tx, ctx, p) => move(tx, ctx, p, "verified", (row, key) => {
    if (row.phase !== "building") stale(`${key} is ${String(row.phase)} now, not Building`);
    if (!Number(row.tasks_total) || Number(row.tasks_done) !== Number(row.tasks_total)) stale(`${key} has open tasks again`);
  }),
  undo: (tx, ctx, p) => move(tx, ctx, p, "building", (row, key) => {
    if (row.phase !== "verified") stale(`${key} is ${String(row.phase)} now; undo only moves it back from Verified`);
  }),
});

const Owner = z.object({ proposalId: z.uuid(), key: z.string(), userId: z.uuid(), name: z.string() });
type Owner = z.infer<typeof Owner>;

const own = async (tx: Tx, ctx: Parameters<typeof setOwnerIn>[1], p: Owner, to: { id: string; name: string } | null, fits: (row: Record<string, unknown>, key: string) => void) => {
  const key = await keyOf(tx, p.proposalId);
  // 081 AC-68: someone who has left the project since the suggestion was made isn't made its owner.
  const [row] = await tx.execute(sql`select project_id from delivery.proposal where id = ${p.proposalId}`);
  const why = to ? await notOnProject(tx, ctx.tenantId, to.id, row.project_id as string, key) : null;
  if (why) throw new SuggestionError(`${why} Nothing was changed.`);
  const out = await setOwnerIn(tx, ctx, key, to, (row) => fits(row, key));
  return { applied: { key }, action: "delivery.proposal.update", resource: "delivery.proposal", resourceId: out.resourceId, before: out.before, after: out.after, events: out.events };
};

export const suggestedOwner = defineSuggestionKind<Owner, { key: string }>({
  kind: "delivery.proposal-owner",
  title: "Suggested owner",
  permission: "delivery:proposal:create",
  proposed: Owner,
  apply: async (tx, ctx, p) => own(tx, ctx, p, await namedOwner(tx, p.userId), (row, key) => {
    if (!hasNoOwner({ ownerUserId: (row.owner_user_id as string | null) ?? null, ownerName: (row.owner_name as string | null) ?? null })) stale(`${key} has an owner now${row.owner_name ? ` (${String(row.owner_name)})` : ""}`);
  }),
  undo: (tx, ctx, p) => own(tx, ctx, p, null, (row, key) => {
    if (row.owner_user_id !== p.userId) stale(`${key}'s owner changed since; undo only clears ${p.name}`);
  }),
});

export const proposalKinds = [readyToVerify, suggestedOwner];
