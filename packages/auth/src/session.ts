import { sql } from "drizzle-orm";
import { textArray, withTenant, type Db, type Tx } from "@amax/db";
import { appendAudit } from "@amax/core/server";
import { isRole, type Role } from "./roles";
import { applyViewAs, type Assignment, type Viewer } from "./viewer";

export const SESSION_HOURS = 12;



export class SignInDenied extends Error {
  constructor(public reason: "unknown-directory" | "wrong-tenant" | "no-role" | "deactivated" | "unknown-user" | "bad-credentials" | "locked") {
    super(`sign-in denied: ${reason}`);
    this.name = "SignInDenied";
  }
}

export type DirectoryClaims = {
  issuer: string;
  directoryId: string;
  externalId: string;
  email: string;
  name: string;
  groups: string[];
};

const audit = (tx: Tx, tenantId: string, userId: string, action: string, after: Record<string, unknown>) =>
  appendAudit(tx, { tenantId, actor: { id: `user:${userId}`, kind: "user" }, source: "ui" }, { action, resource: "auth.session", resourceId: userId, after });

// The tenant comes only from the token's issuer + directory claim. If the sign-in started on a
// tenant's own provider, that tenant must match, so one directory can't sign in to another tenant.
export async function resolveTenant(db: Db, issuer: string, directoryId: string, expectedTenantId?: string) {
  const [hit] = await db.execute(sql`select tenant_id from auth.resolve_tenant(${issuer}, ${directoryId})`);
  if (!hit) throw new SignInDenied("unknown-directory");
  if (expectedTenantId && hit.tenant_id !== expectedTenantId) throw new SignInDenied("wrong-tenant");
  return hit.tenant_id as string;
}

// Entra sign-in: map groups to roles (none mapped = no access), upsert the user, sync group roles,
// open a session. Manual role assignments are kept.
export async function signInFromDirectory(db: Db, claims: DirectoryClaims, expectedTenantId?: string) {
  const tenantId = await resolveTenant(db, claims.issuer, claims.directoryId, expectedTenantId);
  return withTenant(db, tenantId, async (tx) => {
    const mapped = await tx.execute(sql`select distinct role from auth.role_mapping where group_id = any(${textArray(claims.groups)})`);
    const roles = mapped.map((r) => r.role as string).filter(isRole);
    if (!roles.length) throw new SignInDenied("no-role");
    const [user] = await tx.execute(sql`insert into auth.user (tenant_id, external_id, email, name)
      values (${tenantId}, ${claims.externalId}, ${claims.email.toLowerCase()}, ${claims.name})
      on conflict (tenant_id, external_id) do update set email = excluded.email, name = excluded.name, updated_at = now()
      returning id, status`);
    if (user.status !== "active") throw new SignInDenied("deactivated");
    await tx.execute(sql`delete from auth.role_assignment where user_id = ${user.id} and source = 'group' and not (role = any(${textArray(roles)}))`);
    for (const role of roles) {
      await tx.execute(sql`insert into auth.role_assignment (tenant_id, user_id, role, source) values (${tenantId}, ${user.id}, ${role}, 'group') on conflict do nothing`);
    }
    return openSession(tx, tenantId, user.id as string, roles);
  });
}

// Demo sign-in (fixtures only, never in production): an existing active user by email.
export async function signInDemo(db: Db, tenantId: string, email: string) {
  return withTenant(db, tenantId, async (tx) => {
    const [user] = await tx.execute(sql`select id, status from auth.user where email = ${email.toLowerCase()}`);
    if (!user) throw new SignInDenied("unknown-user");
    if (user.status !== "active") throw new SignInDenied("deactivated");
    const roles = await tx.execute(sql`select role from auth.role_assignment where user_id = ${user.id}`);
    if (!roles.length) throw new SignInDenied("no-role");
    return openSession(tx, tenantId, user.id as string, roles.map((r) => r.role as Role));
  });
}

export async function openSession(tx: Tx, tenantId: string, userId: string, roles: string[]) {
  const [s] = await tx.execute(sql`insert into auth.session (tenant_id, user_id, expires_at)
    values (${tenantId}, ${userId}, now() + make_interval(hours => ${SESSION_HOURS})) returning id`);
  await audit(tx, tenantId, userId, "auth.signin", { roles });
  return { tenantId, userId, sessionId: s.id as string };
}

// Rebuilds the viewer from the database. null when the session is revoked or expired, or the user
// was deactivated: callers sign the browser out.
export async function loadViewer(db: Db, tenantId: string, sessionId: string): Promise<Viewer | null> {
  return withTenant(db, tenantId, async (tx) => {
    const [row] = await tx.execute(sql`select s.user_id, s.view_as_role from auth.session s join auth.user u on u.id = s.user_id
      where s.id = ${sessionId} and s.revoked_at is null and s.expires_at > now() and u.status = 'active'`);
    if (!row) return null;
    const v = await viewerForUser(tx, tenantId, row.user_id as string);
    return v && applyViewAs({ ...v, sessionId }, (row.view_as_role as Role | null) ?? undefined);
  });
}

type ScopeResolver = (tx: Tx, user: { tenantId: string; userId: string }) => Promise<{ managedProjects?: string[]; assignedProjects?: string[]; reports?: string[] }>;
let scopeResolvers: ScopeResolver[] = [];
/** Modules that own scopes (delivery: managed projects; hr: reports) register here at boot. */
export const setViewerScopeResolvers = (fns: ScopeResolver[]) => {
  scopeResolvers = fns;
};

// An active user's roles and scopes, for a session or a personal API/MCP token.
export async function viewerForUser(tx: Tx, tenantId: string, userId: string): Promise<Viewer | null> {
  const [u] = await tx.execute(sql`select name, email from auth.user where id = ${userId} and status = 'active'`);
  if (!u) return null;
  const assignments = (await tx.execute(sql`select role, legal_entity_ids, departments from auth.role_assignment where user_id = ${userId}`))
    .map((a) => ({ role: a.role as Role, legalEntityIds: (a.legal_entity_ids as string[] | null) ?? null, departments: (a.departments as string[] | null) ?? null }) satisfies Assignment);
  const scopes = { managedProjects: [] as string[], assignedProjects: [] as string[], reports: [] as string[] };
  for (const resolve of scopeResolvers) {
    const r = await resolve(tx, { tenantId, userId });
    scopes.managedProjects.push(...(r.managedProjects ?? []));
    scopes.assignedProjects.push(...(r.assignedProjects ?? []));
    scopes.reports.push(...(r.reports ?? []));
  }
  return {
    tenantId,
    userId,
    name: u.name as string,
    email: u.email as string,
    assignments,
    actualRoles: [...new Set(assignments.map((a) => a.role))],
    ...scopes,
  };
}

// View as: Admins only. Stored on the session, so every request (and the audit) knows the real user.
export async function setViewAs(db: Db, viewer: Viewer, role: Role | null) {
  if (!viewer.actualRoles.includes("Admin")) throw new SignInDenied("no-role");
  if (role !== null && !isRole(role)) throw new Error(`unknown role ${role}`);
  await withTenant(db, viewer.tenantId, async (tx) => {
    await tx.execute(sql`update auth.session set view_as_role = ${role} where id = ${viewer.sessionId} and user_id = ${viewer.userId}`);
    await audit(tx, viewer.tenantId, viewer.userId, "auth.view_as", { role });
  });
}

export async function signOutSession(db: Db, tenantId: string, sessionId: string) {
  await withTenant(db, tenantId, (tx) => tx.execute(sql`update auth.session set revoked_at = now() where id = ${sessionId} and revoked_at is null`));
}

/** 070 AC-52: signing in again in a browser ends the session the new one replaces, so none is left alive, audited. */
export async function endSwitchedSession(db: Db, tenantId: string, sessionId: string) {
  await withTenant(db, tenantId, async (tx) => {
    const [s] = await tx.execute(sql`update auth.session set revoked_at = now() where id = ${sessionId} and revoked_at is null returning user_id`);
    if (s) await audit(tx, tenantId, s.user_id as string, "auth.signout", { reason: "switched" });
  });
}

/**
 * 070 review round 1: called only after a sign-in has succeeded, for every provider, so a failed attempt
 * leaves the browser's live session alone and an Entra sign-in ends the one it replaces too.
 */
export async function endReplacedSession(db: Db, before: { tenantId?: string; sessionId?: string } | null | undefined, after: { sessionId?: string } | null | undefined) {
  if (!after?.sessionId || !before?.tenantId || !before.sessionId || before.sessionId === after.sessionId) return false;
  await endSwitchedSession(db, before.tenantId, before.sessionId);
  return true;
}

