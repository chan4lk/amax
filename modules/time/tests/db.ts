import { sql } from "drizzle-orm";
import { withTenant } from "@amax/db";
import { freshDatabase, migratedDatabase, repoRoot } from "@amax/db/testdb";
import { migrate, migrationScopes } from "@amax/db/migrate";
import { configureRuntime } from "@amax/core/server";
import { applyViewAs, installAuthorizer, setGrants, setViewerScopeResolvers, viewerForUser, type Role, type Viewer } from "@amax/auth";
import { authFixtures } from "@amax/auth/fixtures";
import { loadFixtures, lumen } from "@amax/testing";
import type { ModuleManifest } from "@amax/core";
import { installedModules } from "./installed";

export const T = lumen.tenant.id;
type Resolver = NonNullable<ModuleManifest["viewerScopes"]>;

/** `disabled`: modules switched off the way AMAX_MODULES_DISABLED does it, never migrated or installed (072). */
export async function timeDb(extraScopes: Resolver[] = [], disabled: string[] = []) {
  const t = disabled.length ? await freshDatabase() : await migratedDatabase();
  if (disabled.length) await migrate(t.owner, migrationScopes(repoRoot, disabled));
  const app = t.app();
  const modules = await installedModules(disabled);
  configureRuntime({ db: app, auditKey: "k".repeat(32) });
  setGrants(modules);
  const resolvers = [...modules.flatMap((m) => (m.viewerScopes ? [m.viewerScopes] : [])), ...extraScopes];
  setViewerScopeResolvers(resolvers);
  installAuthorizer();
  await loadFixtures(app, [{ id: "auth", fixtures: [authFixtures] }, ...modules], lumen);
  const idOf = async (key: string) =>
    (await withTenant(app, T, (tx) => tx.execute(sql`select id from auth.user where email = ${`${key}@lumenlabs.test`}`)))[0].id as string;
  const as = async (key: string, role?: Role): Promise<Viewer> => {
    const id = await idOf(key);
    const v = (await withTenant(app, T, (tx) => viewerForUser(tx, T, id)))!;
    return role ? applyViewAs(v, role) : v;
  };
  const q = (query: ReturnType<typeof sql>) => withTenant(app, T, (tx) => tx.execute(query));
  return { t, app, as, idOf, q, useScopes: (more: Resolver[]) => setViewerScopeResolvers([...resolvers, ...more]) };
}
