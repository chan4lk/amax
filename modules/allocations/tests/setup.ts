import { sql } from "drizzle-orm";
import { withTenant, type Db, type Tx } from "@amax/db";
import { migratedDatabase } from "@amax/db/testdb";
import { configureRuntime } from "@amax/core/server";
import { applyViewAs, installAuthorizer, setGrants, setViewerScopeResolvers, viewerForUser, type Role, type Viewer } from "@amax/auth";
import { authFixtures } from "@amax/auth/fixtures";
import { loadFixtures, lumen } from "@amax/testing";
import type { ModuleManifest } from "@amax/core";
import allocations from "../module";

// The modules allocations depends on, loaded the way the app's registry loads installed modules.
export const installed = (id: string): Promise<ModuleManifest> => import(`@amax/${id}/module`).then((m) => m.default);

export const T = lumen.tenant.id;
export const TODAY = new Date("2026-10-16T12:00:00Z");

/** A migrated database with auth, delivery, hr and allocations fixtures, and viewers by demo key. */
export async function allocationsDatabase() {
  const t = await migratedDatabase();
  const app: Db = t.app();
  configureRuntime({ db: app, auditKey: "k".repeat(32) });
  const mods = [...(await Promise.all((allocations.dependsOn ?? []).map(installed))), allocations];
  setGrants(mods);
  setViewerScopeResolvers(mods.map((m) => m.viewerScopes!));
  installAuthorizer();
  await loadFixtures(app, [{ id: "auth", fixtures: [authFixtures] }, ...mods], lumen);
  const as = async (key: string, role?: Role): Promise<Viewer> => {
    const [u] = await withTenant(app, T, (tx) => tx.execute(sql`select id from auth.user where email = ${`${key}@lumenlabs.test`}`));
    const v = (await withTenant(app, T, (tx) => viewerForUser(tx, T, u.id as string)))!;
    return role ? applyViewAs(v, role) : v;
  };
  const tx = <R>(fn: (tx: Tx) => Promise<R>) => withTenant(app, T, fn);
  return { t, app, as, tx };
}
