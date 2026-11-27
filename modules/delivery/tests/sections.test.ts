import { createElement } from "react";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import { configureRuntime } from "@amax/core/server";
import { installAuthorizer, setGrants, setViewerScopeResolvers, viewerForUser, type Viewer } from "@amax/auth";
import { authFixtures } from "@amax/auth/fixtures";
import { loadFixtures, lumen } from "@amax/testing";
import manifest from "../module";
import { PROJECT_SECTIONS } from "../contracts";
import { listProposals, listReleases } from "../server/queries";
import { ProjectTabs } from "../ui/ProjectHeader";

describe("project section tabs", () => {
  it("AC4 every tab is a link to its own section, none is aria-disabled, and only the current one is marked", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const html = renderToStaticMarkup(createElement(ProjectTabs, { projectKey: "CON", current: "team" }));
    expect(html).not.toContain("aria-disabled");
    expect(html).not.toContain("<button");
    expect([...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1])).toEqual(["", "/proposals", "/releases", "/risks", "/team", "/contract"].map((s) => `/delivery/p/CON${s}`));
    expect([...html.matchAll(/aria-current="page"[^>]*>([^<]+)</g)].map((m) => m[1])).toEqual(["Team"]);
    expect(manifest.routes.map((r) => r.path)).toEqual(expect.arrayContaining(PROJECT_SECTIONS.filter((s) => s.path).map((s) => `p/:key/${s.path}`)));
  });
});

describe.skipIf(!hasDb)("project sections against Postgres", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  let maya: Viewer;
  beforeAll(async () => {
    t = await migratedDatabase();
    app = t.app();
    configureRuntime({ db: app, auditKey: "k".repeat(32) });
    setGrants([manifest]);
    setViewerScopeResolvers([manifest.viewerScopes!]);
    installAuthorizer();
    await loadFixtures(app, [{ id: "auth", fixtures: [authFixtures] }, manifest], lumen);
    const [u] = await withTenant(app, lumen.tenant.id, (tx) => tx.execute(sql`select id from auth.user where email = 'maya@lumenlabs.test'`));
    maya = (await withTenant(app, lumen.tenant.id, (tx) => viewerForUser(tx, lumen.tenant.id, u.id as string)))!;
  }, 60_000);
  afterAll(() => t?.drop());

  it("AC2 a project's proposals and releases leave out every other project's records", async () => {
    const [allProposals, allReleases] = await Promise.all([listProposals(maya), listReleases(maya)]);
    const keys = [...new Set(allReleases.map((r) => r.projectKey))];
    expect(keys.length).toBeGreaterThan(1);
    for (const key of keys) {
      const [proposals, releases] = await Promise.all([listProposals(maya, { projectKey: key }), listReleases(maya, { projectKey: key })]);
      expect(proposals.map((p) => p.id).sort()).toEqual(allProposals.filter((p) => p.projectKey === key).map((p) => p.id).sort());
      expect(releases.map((r) => r.id).sort()).toEqual(allReleases.filter((r) => r.projectKey === key).map((r) => r.id).sort());
      expect(releases.length).toBeLessThan(allReleases.length);
    }
  }, 60_000);
});
