import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { assertCan, viewerOf } from "@amax/auth";
import { defineService, type ServiceContext } from "@amax/core/server";
import { EVENTS, type ProposalWithdrawn } from "../contracts";
import { namedOwner, notOnProject, ownerChanged } from "./owner";
import { countTasks } from "./tasks";
import { invalid, notFound } from "./refusal";
import { isWithdrawn } from "./readiness";

// 081 AC-9 to AC-11: the lifecycle of a proposal made by hand. A spec proposal belongs to its repo: the sync owns its
// title, phase, tasks and withdrawal, so these refuse it (its owner is the one thing amax may set). Released is history.

const by = (ctx: ServiceContext) => (ctx.onBehalfOf ? `${ctx.actor.id} for ${ctx.onBehalfOf}` : ctx.actor.id);
const refuse = (message: string): never => { throw invalid(message); };

/** The proposal row, locked, after the viewer's scope check on its project. */
async function lockedProposal(tx: Tx, ctx: ServiceContext, key: string, action: string) {
  const [p] = await tx.execute(sql`select * from delivery.proposal where key = ${key} for update`);
  if (!p) throw notFound(`no proposal ${key}`);
  const v = viewerOf(ctx);
  if (v) assertCan(v, action, { projectId: p.project_id as string });
  return p;
}

const withdrawn = isWithdrawn;

/** A hand-made proposal that's still work: not from a repo, not released, not withdrawn. */
function guardOpen(p: Record<string, unknown>, what: string) {
  if (withdrawn(p)) refuse(`${p.key as string} was withdrawn; it can't ${what}`);
  if (p.source !== null) refuse(`${p.key as string} comes from ${p.source as string}; ${what} in the repo's spec, and the sync brings it here`);
  if (p.phase === "released") refuse(`${p.key as string} is released; shipped history doesn't change`);
}

const Edits = z.object({
  key: z.string(),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  estimateHours: z.number().nonnegative().max(10_000).nullable().optional(),
  ownerUserId: z.string().uuid().optional(),
}).refine((a) => a.title !== undefined || a.description !== undefined || a.estimateHours !== undefined || a.ownerUserId !== undefined, "say what to change: title, description, estimate or owner");

export const updateProposal = defineService({
  scoped: true,
  name: "delivery.proposal.update",
  action: "delivery:proposal:create",
  resource: "delivery.proposal",
  input: Edits,
  async run(tx, a, ctx) {
    const p = await lockedProposal(tx, ctx, a.key, "delivery:proposal:create");
    const content = a.title !== undefined || a.description !== undefined || a.estimateHours !== undefined;
    if (content) guardOpen(p, "be edited");
    else if (withdrawn(p)) refuse(`${a.key} was withdrawn; it can't be edited`);
    const owner = a.ownerUserId ? await namedOwner(tx, a.ownerUserId) : null;
    const why = owner ? await notOnProject(tx, ctx.tenantId, owner.id, p.project_id as string, a.key) : null;
    if (why) refuse(why);
    const next = { title: a.title ?? (p.title as string), description: a.description === undefined ? (p.description as string | null) : a.description,
      estimateHours: a.estimateHours === undefined ? p.estimate_hours : a.estimateHours, ownerUserId: owner?.id ?? (p.owner_user_id as string | null), ownerName: owner?.name ?? (p.owner_name as string | null) };
    await tx.execute(sql`update delivery.proposal set title = ${next.title}, description = ${next.description}, estimate_hours = ${next.estimateHours},
      owner_user_id = ${next.ownerUserId}, owner_name = ${next.ownerName}, owner_set_by_person = owner_set_by_person or ${owner !== null}, updated_at = now() where id = ${p.id}`);
    const changed = Object.fromEntries(Object.entries({ title: a.title, description: a.description, estimateHours: a.estimateHours, owner: owner?.name }).filter(([, x]) => x !== undefined));
    const before = Object.fromEntries(Object.keys(changed).map((k) => [k, { title: p.title, description: p.description, estimateHours: p.estimate_hours === null ? null : Number(p.estimate_hours), owner: p.owner_name }[k]]));
    return { result: { key: a.key, ...changed }, resourceId: p.id as string, before, after: changed, events: owner ? ownerChanged({ ...p, title: next.title }, owner, by(ctx)) : [] };
  },
});

export const withdrawProposal = defineService({
  scoped: true,
  name: "delivery.proposal.withdraw",
  action: "delivery:proposal:move",
  resource: "delivery.proposal",
  input: z.object({ key: z.string(), reason: z.string().trim().min(3).max(500) }),
  async run(tx, a, ctx) {
    // Out of its release too, so a later Prod deployment can't release withdrawn work. The release row is locked before
    // the proposal, the order every release writer takes them in (services.ts, rounds 18 and 19), so they can't deadlock.
    const [seen] = await tx.execute(sql`select release_id from delivery.proposal where key = ${a.key}`);
    const [r] = seen?.release_id ? await tx.execute(sql`select version from delivery.release where id = ${seen.release_id} for update`) : [];
    const p = await lockedProposal(tx, ctx, a.key, "delivery:proposal:move");
    if ((p.release_id ?? null) !== (seen?.release_id ?? null)) refuse(`${a.key} moved between releases just now; try again`);
    guardOpen(p, "be withdrawn");
    await tx.execute(sql`update delivery.proposal set withdrawn_at = now(), withdrawn_by = ${by(ctx)}, withdraw_reason = ${a.reason}, release_id = null, updated_at = now() where id = ${p.id}`);
    const payload: ProposalWithdrawn = { proposalId: p.id as string, key: a.key, projectId: p.project_id as string, by: by(ctx), reason: a.reason,
      ownerUserId: (p.owner_user_id as string | null) ?? null, title: p.title as string };
    return { result: { key: a.key, withdrawn: true, leftRelease: (r?.version as string | undefined) ?? null }, resourceId: p.id as string,
      before: { phase: p.phase, release: r?.version ?? null }, after: { reason: a.reason }, events: [{ name: EVENTS.proposalWithdrawn, payload }] };
  },
});

export const addProposalTask = defineService({
  scoped: true,
  name: "delivery.task.add",
  action: "delivery:task:done",
  resource: "delivery.task",
  input: z.object({ key: z.string(), title: z.string().trim().min(1).max(200) }),
  async run(tx, a, ctx) {
    const p = await lockedProposal(tx, ctx, a.key, "delivery:task:done");
    guardOpen(p, "take new tasks");
    const [{ n }] = await tx.execute(sql`select coalesce(max(substring(ref from 2)::int), 0) + 1 as n from delivery.task where proposal_id = ${p.id}`);
    const ref = `T${Number(n)}`;
    const [t] = await tx.execute(sql`insert into delivery.task (tenant_id, proposal_id, ref, title) values (${ctx.tenantId}, ${p.id}, ${ref}, ${a.title}) returning id`);
    const counts = await countTasks(tx, p.id as string);
    return { result: { key: a.key, task: ref, tasksDone: counts.done, tasksTotal: counts.total }, resourceId: t.id as string, after: { proposalId: p.id as string, ref, title: a.title } };
  },
});

/**
 * 081 amendment 2: set or clear a proposal's owner in the caller's transaction, on the locked row: an accepted "Suggested
 * owner" and its undo. `guard` re-checks under the lock that the suggestion still fits. Any proposal (spec ones too).
 */
export async function setOwnerIn(tx: Tx, ctx: ServiceContext, key: string, owner: { id: string; name: string } | null, guard: (p: Record<string, unknown>) => void) {
  const p = await lockedProposal(tx, ctx, key, "delivery:proposal:create");
  if (withdrawn(p)) refuse(`${key} was withdrawn; its owner doesn't change`);
  guard(p);
  // 091 AC-7: a person decided the owner, so a sync from the repo leaves it from now on.
  await tx.execute(sql`update delivery.proposal set owner_user_id = ${owner?.id ?? null}, owner_name = ${owner?.name ?? null}, owner_set_by_person = true, updated_at = now() where id = ${p.id}`);
  return { resourceId: p.id as string, before: { owner: (p.owner_name as string | null) ?? null }, after: { owner: owner?.name ?? null }, events: ownerChanged(p, owner, by(ctx)) };
}
