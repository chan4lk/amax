import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { can, canEver, viewerForUser, type ResourceAttrs, type Viewer } from "@amax/auth";
import type { NotificationRecipient, NotificationRule } from "@amax/core";

type Payload = Record<string, unknown>;
const idIn = (payload: Payload, field: string) => (typeof payload[field] === "string" ? (payload[field] as string) : null);

async function holders(tx: Tx, role: string): Promise<string[]> {
  const rows = await tx.execute(sql`select distinct ra.user_id from auth.role_assignment ra join auth.user u on u.id = ra.user_id where ra.role = ${role} and u.status = 'active'`);
  return rows.map((r) => r.user_id as string);
}

// The approver chain (030 AC-1): the person's managers who could approve, else the Admins.
// Only people whose roles could ever hold the permission are loaded in full.
async function candidates(tx: Tx, ownerId: string, permission: string | undefined): Promise<string[]> {
  const rows = await tx.execute(sql`select ra.user_id, array_agg(ra.role) as roles from auth.role_assignment ra join auth.user u on u.id = ra.user_id
    where u.status = 'active' and u.id <> ${ownerId} group by ra.user_id`);
  const could = (roles: string[]) => !permission || canEver({ assignments: roles.map((role) => ({ role, legalEntityIds: null, departments: null })) } as unknown as Viewer, permission);
  return rows.filter((r) => could(r.roles as string[])).map((r) => r.user_id as string);
}

// 072 AC-3: a payload entity field with no value keeps entity-scoped approvers out (fails closed); unscoped ones stay.
const NO_ENTITY = "00000000-0000-4000-8000-000000000000";
type Route = { projectIds: string[] | null; entity: string | null | undefined };
const reaches = (v: Viewer, entity: string | null | undefined) =>
  entity === undefined || v.assignments.some((a) => a.legalEntityIds === null || a.legalEntityIds.includes(entity ?? NO_ENTITY));

async function approvers(tx: Tx, tenantId: string, ownerId: string, permission: string | undefined, route: Route): Promise<string[]> {
  const ids = await candidates(tx, ownerId, permission);
  const viewers = (await Promise.all(ids.map((id) => viewerForUser(tx, tenantId, id)))).filter((v): v is Viewer => v !== null);
  const managers = viewers.filter((v) => v.reports.includes(ownerId) && reaches(v, route.entity));
  const scope = route.entity === undefined ? {} : { legalEntityId: route.entity ?? NO_ENTITY };
  // Approvers of these projects in particular; anyone who approves every project (an Admin) is the fallback below.
  const everywhere = (v: Viewer) => can(v, permission!, { projectId: NO_ENTITY, ...scope });
  const onProjects = permission && route.projectIds?.length
    ? viewers.filter((v) => !everywhere(v) && route.projectIds!.some((projectId) => can(v, permission, { projectId, ...scope }))) : [];
  const found = [...new Set([...managers, ...onProjects].map((v) => v.userId))];
  if (found.length) return found;
  const admins = (await holders(tx, "Admin")).filter((id) => id !== ownerId);
  if (route.entity === undefined) return admins;
  const scoped = await Promise.all(admins.map((id) => viewerForUser(tx, tenantId, id)));
  return scoped.filter((v): v is Viewer => v !== null && reaches(v, route.entity)).map((v) => v.userId);
}

async function idsFor(tx: Tx, tenantId: string, to: NotificationRecipient, payload: Payload, rule: NotificationRule): Promise<string[]> {
  if ("role" in to) return holders(tx, to.role);
  const id = idIn(payload, "owner" in to ? to.owner : to.approvers);
  if (!id) return [];
  if ("owner" in to) return [id];
  const projects = to.projects ? payload[to.projects] : null;
  const route: Route = { projectIds: Array.isArray(projects) ? (projects as string[]) : null, entity: to.entity ? ((payload[to.entity] as string | null | undefined) ?? null) : undefined };
  return approvers(tx, tenantId, id, rule.permission, route);
}

const acted = (payload: Payload, rule: NotificationRule, userId: string) => {
  const by = rule.except ? payload[rule.except] : undefined;
  return typeof by === "string" && (by === userId || by.includes(`user:${userId}`));
};

/** Everyone the rule reaches, as viewers with their own roles and data scopes, minus whoever acted. */
export async function recipientsOf(tx: Tx, tenantId: string, rule: NotificationRule, payload: Payload): Promise<Viewer[]> {
  const ids = new Set((await Promise.all(rule.to.map((t) => idsFor(tx, tenantId, t, payload, rule)))).flat());
  const attrs: ResourceAttrs = Object.fromEntries(Object.entries(rule.scope ?? {}).map(([attr, field]) => [attr, idIn(payload, field)]));
  const out: Viewer[] = [];
  for (const id of ids) {
    const v = await viewerForUser(tx, tenantId, id);
    if (!v || acted(payload, rule, id)) continue;
    if (rule.permission && !(rule.scope ? can(v, rule.permission, attrs) : canEver(v, rule.permission))) continue;
    out.push(v);
  }
  return out;
}
