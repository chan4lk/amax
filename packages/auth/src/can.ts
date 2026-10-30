import type { ModuleManifest } from "@amax/core";
import { setAuthorizer, type ServiceContext } from "@amax/core/server";
import type { Role } from "./roles";
import type { Assignment, Viewer } from "./viewer";

/** What a check knows about the record: all optional; a missing field doesn't narrow. */
export type ResourceAttrs = {
  legalEntityId?: string | null;
  department?: string | null;
  projectId?: string | null;
  ownerUserId?: string | null;
};

type Grants = Map<Role, string[]>;
let grants: Grants = new Map();

// Built from installed manifests at boot (and in tests).
export function setGrants(modules: Pick<ModuleManifest, "grants">[]) {
  const next: Grants = new Map();
  for (const m of modules) {
    for (const [role, perms] of Object.entries(m.grants ?? {}) as [Role, string[]][]) next.set(role, [...(next.get(role) ?? []), ...perms]);
  }
  grants = next;
}

const matches = (grant: string, action: string) => {
  const [perm] = grant.split("@");
  return perm === action || (perm.endsWith(":*") && action.startsWith(perm.slice(0, -1)));
};

const inScope = (a: Assignment, r: ResourceAttrs) =>
  (a.legalEntityIds === null || !r.legalEntityId || a.legalEntityIds.includes(r.legalEntityId)) &&
  (a.departments === null || !r.department || a.departments.includes(r.department));

function qualifierHolds(q: string | undefined, v: Viewer, r: ResourceAttrs) {
  switch (q) {
    case undefined: return true;
    case "managed": return !!r.projectId && v.managedProjects.includes(r.projectId);
    case "assigned": return !!r.projectId && (v.managedProjects.includes(r.projectId) || v.assignedProjects.includes(r.projectId));
    case "own": return !!r.ownerUserId && r.ownerUserId === v.userId;
    default: return false;
  }
}

// The one permission check. Modules call it; they never test roles themselves.
export function can(v: Viewer, action: string, resource: ResourceAttrs = {}): boolean {
  return v.assignments.some((a) => {
    if (!inScope(a, resource)) return false;
    if (a.role === "Admin") return true;
    return (grants.get(a.role) ?? []).some((g) => matches(g, action) && qualifierHolds(g.split("@")[1], v, resource));
  });
}

// "Could this viewer ever do this?" — a qualified grant (@managed, @assigned, @own) counts, because
// the record isn't known yet. Services check this up front and call assertCan() with the record.
export function canEver(v: Viewer, action: string): boolean {
  return v.assignments.some((a) => a.role === "Admin" || (grants.get(a.role) ?? []).some((g) => matches(g, action)));
}

/**
 * canEver through an assignment that reaches this legal entity (072 review round 1): the role that grants the action
 * must itself cover the entity, so an unscoped role that doesn't grant it never lends its reach to a scoped one that
 * does. `null` is "no entity", which only unscoped assignments reach.
 */
export const canEverIn = (v: Viewer, action: string, legalEntityId: string | null) =>
  v.assignments.some((a) => (a.legalEntityIds === null || (legalEntityId !== null && a.legalEntityIds.includes(legalEntityId))) && canEver({ ...v, assignments: [a] }, action));

export class ScopeError extends Error {
  readonly retryable = false;
  constructor(action: string) {
    super(`forbidden: ${action} is outside your data scope`);
    this.name = "ScopeError";
  }
}

export function assertCan(v: Viewer, action: string, resource?: ResourceAttrs) {
  if (!can(v, action, resource)) throw new ScopeError(action);
}

export const viewerOf = (ctx: ServiceContext) => ctx.viewer as Viewer | undefined;

// Services check the permission up front (no record yet). A service marked `scoped` calls
// assertCan() once it has loaded the record, so only it may pass on a qualified grant here.
// System jobs are trusted code.
export function installAuthorizer() {
  setAuthorizer((ctx, action, _resource, _input, opts) => {
    if (ctx.actor.kind === "system") return true;
    // principalContext() has already checked scopes, expiry and acts-for (and audited refusals).
    const v = viewerOf(ctx);
    // principalContext() has checked the principal's own scopes. A credential acting for a person
    // through a tool (contextForViewer) has had its scopes checked by the API caller, and may do only
    // what that person may do.
    if (ctx.actor.kind === "service" && (ctx as { principal?: unknown }).principal) return true;
    if (ctx.actor.kind === "service" && !v?.principal) return false;
    // Strict by default; only services that check the record themselves (scoped) accept qualified grants.
    return !!v && (opts?.scoped ? canEver(v, action) : can(v, action));
  });
}
