import { sql } from "drizzle-orm";
import { withTenant, type Tx } from "@amax/db";
import { migratedDatabase } from "@amax/db/testdb";
import { configureRuntime } from "@amax/core/server";
import { applyViewAs, installAuthorizer, loadViewer, setGrants, setViewerScopeResolvers, signInDemo, type Role, type Viewer } from "@amax/auth";
import { authFixtures } from "@amax/auth/fixtures";
import { loadFixtures, lumen } from "@amax/testing";
import delivery from "../module";

export const T = lumen.tenant.id;

/** 081: a migrated database with delivery's fixtures, and the fixture people as signed-in viewers. */
export async function proposalDb() {
  const t = await migratedDatabase();
  const app = t.app();
  configureRuntime({ db: app, auditKey: "k".repeat(32) });
  setGrants([delivery]);
  // 081 amendment 6: an owner must be on the project. Allocations isn't loaded here, so Nimal (allocated to CON and FLT in its
  // fixtures) is put on both; the other engineers stay off every project, as 081's permission tests expect.
  const nimalOn = async (tx: Tx, user: { userId: string }) => ({ assignedProjects: (await tx.execute(sql`select p.id from delivery.project p, auth.user u
    where u.id = ${user.userId} and u.email = 'nimal@lumenlabs.test' and p.key in ('CON', 'FLT')`)).map((r) => r.id as string) });
  setViewerScopeResolvers([delivery.viewerScopes!, nimalOn]);
  installAuthorizer();
  await loadFixtures(app, [{ id: "auth", fixtures: [authFixtures] }, delivery], lumen);
  const as = async (key: string, role?: Role): Promise<Viewer> => {
    const v = (await loadViewer(app, T, (await signInDemo(app, T, `${key}@lumenlabs.test`)).sessionId))!;
    return role ? applyViewAs(v, role) : v;
  };
  const q = (query: ReturnType<typeof sql>) => withTenant(app, T, (tx) => tx.execute(query));
  const row = async (key: string) => (await q(sql`select * from delivery.proposal where key = ${key}`))[0];
  return { t, app, as, q, row };
}
