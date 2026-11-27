import { sql } from "drizzle-orm";
import { withTenant } from "@amax/db";
import { migratedDatabase } from "@amax/db/testdb";
import { configureRuntime } from "@amax/core/server";
import { applyViewAs, installAuthorizer, setGrants, setViewerScopeResolvers, viewerForUser } from "@amax/auth";
import { authFixtures } from "@amax/auth/fixtures";
import { loadFixtures, lumen } from "@amax/testing";
import delivery from "../module";
import { ctxFor } from "../server/context";
import { getRelease } from "../server/queries";
import { createProject, createProposal } from "../server/services";
import { verify } from "./release-fields";

export const T = lumen.tenant.id;
export const OPEN = { name: "Open", category: "uat", startDate: "2026-10-01", targetDate: "2099-12-31" } as const;

export async function releaseDb() {
  const t = await migratedDatabase();
  const app = t.app();
  configureRuntime({ db: app, auditKey: "k".repeat(32) });
  setGrants([delivery]);
  setViewerScopeResolvers([delivery.viewerScopes!]);
  installAuthorizer();
  await loadFixtures(app, [{ id: "auth", fixtures: [authFixtures] }, delivery], lumen);
  const as = async (email: string) => {
    const [u] = await withTenant(app, T, (tx) => tx.execute(sql`select id from auth.user where email = ${email}`));
    return (await withTenant(app, T, (tx) => viewerForUser(tx, T, u.id as string)))!;
  };
  const sahan = await as("sahan@lumenlabs.test");
  const maya = applyViewAs(await as("maya@lumenlabs.test"), "PM");
  const admin = () => ctxFor(sahan);
  await createProject(admin(), { key: "RTK", name: "Release tracking", client: "x", billing: "internal" });
  const row = async (key: string, version: string) =>
    (await t.owner`select r.* from delivery.release r join delivery.project p on p.id = r.project_id where p.key = ${key} and r.version = ${version}`)[0];
  const history = async (key: string, version: string) => (await getRelease(sahan, key, version))!.statusHistory.map((h) => `${h.from}>${h.to}:${h.source}`);
  const proposal = async (key: string, verified = true) => {
    const p = await createProposal(admin(), { projectKey: key, title: `p ${Math.random()}` });
    if (verified) await verify(t.owner, p.key);
    return p.key;
  };
  return { t, app, sahan, maya, admin, row, history, proposal };
}
