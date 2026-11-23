import { can, contextForViewer, viewerOf, type Viewer } from "@amax/auth";
import { ForbiddenError, getRuntime, type ServiceContext, type Source } from "@amax/core/server";
import { withTenant, type Tx } from "@amax/db";

export const READ = "git-accounts:read";
export const CONNECT = "git-accounts:connect";
export const UNLINK = "git-accounts:unlink";

export const ctxFor = (viewer: Viewer, source: Source = "ui"): ServiceContext => contextForViewer(viewer, source);

/** Git accounts are the viewer's own, except an Admin's unlink: every own read and write is keyed on their user id. */
export function selfOf(ctx: ServiceContext): string {
  const v = viewerOf(ctx);
  if (!v) throw new ForbiddenError(CONNECT, "git-accounts");
  return v.userId;
}

export const read = async <T>(viewer: Viewer, fn: (tx: Tx) => Promise<T>) => {
  if (!can(viewer, READ)) throw new ForbiddenError(READ, "git-accounts");
  return withTenant(getRuntime().db, viewer.tenantId, fn);
};
