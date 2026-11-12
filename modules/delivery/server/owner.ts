import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { can, viewerForUser } from "@amax/auth";
import type { Emitted, ServiceContext } from "@amax/core/server";
import { EVENTS, type ProposalOwnerChanged } from "../contracts";
import { invalid } from "./refusal";

export type Owner = { id: string; name: string };

const userOf = (id: string | undefined | null) => (id?.startsWith("user:") ? id.slice(5) : null);

/** 081 AC-5: the person behind a write: the user who acted, or the one an agent or credential acted for; null for a bare service. */
export const personOf = (ctx: ServiceContext) => (ctx.actor.kind === "user" ? userOf(ctx.actor.id) : userOf(ctx.onBehalfOf));

async function activePerson(tx: Tx, userId: string): Promise<Owner | null> {
  const [u] = await tx.execute(sql`select id, name from auth.user where id::text = ${userId} and status = 'active'`);
  return u ? { id: u.id as string, name: u.name as string } : null;
}

/** The owner a write names, an active person in the tenant; refused otherwise. */
export async function namedOwner(tx: Tx, userId: string): Promise<Owner> {
  const owner = await activePerson(tx, userId);
  if (!owner) throw invalid("the owner must be an active person in this workspace");
  return owner;
}

/**
 * 091 AC-7: the person a repo names for a spec proposal (its Owner line, else the author of its change.md): a verified
 * git identity with that email, else an active person whose work email it is, and only when they're on the project.
 * Null when nobody fits, so the proposal stays Unassigned.
 */
export async function ownerFromRepo(tx: Tx, tenantId: string, email: unknown, projectId: string): Promise<Owner | null> {
  if (typeof email !== "string" || !email.includes("@")) return null;
  const [u] = await tx.execute(sql`select u.id, u.name from auth.user u where u.status = 'active' and (
      exists (select 1 from auth.git_identity g where g.user_id = u.id and g.email_verified and lower(g.email) = lower(${email}))
      or lower(u.email) = lower(${email}))
    order by exists (select 1 from auth.git_identity g where g.user_id = u.id and g.email_verified and lower(g.email) = lower(${email})) desc limit 1`);
  if (!u) return null;
  return (await notOnProject(tx, tenantId, u.id as string, projectId)) ? null : { id: u.id as string, name: u.name as string };
}

/**
 * 091 AC-7: a sync leaves the stored owner as it is: a person set it, or the repo's answer couldn't be read. The write
 * (upsertSpecProposal) applies it to the row it read `for update` (092 AC-1); 094 AC-6: this is the only definition.
 */
export const ownerFrozen = (cur: Record<string, unknown> | undefined, email: unknown) => cur?.owner_set_by_person === true || email === undefined;

/**
 * 091 AC-7: whether a stored spec proposal's owner no longer matches what its repo names, so a sync must rewrite it
 * though nothing in its files changed (say, its author linked their git identity since). Never once a person set it.
 */
export async function repoOwnerStale(tx: Tx, tenantId: string, cur: Record<string, unknown>, email: unknown): Promise<boolean> {
  if (ownerFrozen(cur, email)) return false;
  const owner = await ownerFromRepo(tx, tenantId, email, cur.project_id as string);
  return (owner?.id ?? null) !== ((cur.owner_user_id as string | null) ?? null);
}

/** The owner by default: the named one, else the person acting (none for a bare service). */
export async function ownerFor(tx: Tx, ctx: ServiceContext, userId?: string): Promise<Owner | null> {
  if (userId) return namedOwner(tx, userId);
  const me = personOf(ctx);
  return me ? activePerson(tx, me) : null;
}

/** 081 AC-62: the event for a proposal whose owner becomes `to`; none when the owner stays the same. */
export function ownerChanged(p: Record<string, unknown>, to: Owner | null, by: string): Emitted[] {
  const from = (p.owner_user_id as string | null) ?? null;
  if (from === (to?.id ?? null)) return [];
  const payload: ProposalOwnerChanged = { proposalId: p.id as string, key: p.key as string, title: p.title as string, projectId: p.project_id as string,
    from, to: to?.id ?? null, toName: to?.name ?? null, cleared: !to, by };
  return [{ name: EVENTS.ownerChanged, payload }];
}

/**
 * 081 AC-67: why this person can't own a proposal on the project, or null when they can. An owner is an active person who
 * holds delivery:task:done there: a PM who manages it, or an engineer assigned to it (the platform's data scopes, so
 * Delivery needs no Allocations import).
 */
export async function notOnProject(tx: Tx, tenantId: string, userId: string, projectId: string, key?: string): Promise<string | null> {
  const v = await viewerForUser(tx, tenantId, userId);
  if (!v) return "the owner must be an active person in this workspace";
  if (can(v, "delivery:task:done", { projectId })) return null;
  const [p] = await tx.execute(sql`select name from delivery.project where id = ${projectId}`);
  return `${v.name} isn't on ${(p?.name as string | undefined) ?? "that project"}, so they can't own ${key ?? "its proposals"}. Pick someone on the project.`;
}
