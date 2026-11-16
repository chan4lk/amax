import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import { configureRuntime } from "@amax/core/server";
import { applyViewAs, installAuthorizer, setGrants, setViewerScopeResolvers, viewerForUser, type Viewer } from "@amax/auth";
import { authFixtures } from "@amax/auth/fixtures";
import { createRegistry } from "@amax/mcp";
import { loadFixtures, lumen } from "@amax/testing";
import delivery from "../module";
import { listEnvironments } from "../server/queries";

const T = lumen.tenant.id;

describe.skipIf(!hasDb)("106 set_up_project (Postgres)", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  let maya: Viewer;
  const registry = createRegistry([delivery]);
  const q = (s: ReturnType<typeof sql>) => withTenant(app, T, (tx) => tx.execute(s));
  const setUp = (v: Viewer, input: Record<string, unknown>) => registry.call(v, "set_up_project", input, { source: "mcp" });

  beforeAll(async () => {
    t = await migratedDatabase();
    app = t.app();
    configureRuntime({ db: app, auditKey: "k".repeat(32) });
    setGrants([delivery]);
    setViewerScopeResolvers([delivery.viewerScopes!]);
    installAuthorizer();
    await loadFixtures(app, [{ id: "auth", fixtures: [authFixtures] }, delivery], lumen);
    const [u] = await q(sql`select id from auth.user where email = 'maya@lumenlabs.test'`);
    maya = (await withTenant(app, T, (tx) => viewerForUser(tx, T, u.id as string)))!;
  });
  afterAll(() => t?.drop());

  it("AC-1 one write creates the project with its environments, makes the caller manager and links the repo, audited", async () => {
    const r = await setUp(maya, { key: "NWP", name: "Northwind Portal", client: "Northwind", billing: "t&m", repoUrl: "https://github.com/example/northwind-portal" });
    expect(r).toMatchObject({ key: "NWP", repoUrl: "github.com/example/northwind-portal", defaultBranch: "main" });
    const [p] = await q(sql`select manager_user_id, repo_url, repo_default_ref from delivery.project where key = 'NWP'`);
    expect(p).toMatchObject({ manager_user_id: maya.userId, repo_url: "github.com/example/northwind-portal", repo_default_ref: "main" });
    expect((await listEnvironments(maya, "NWP")).map((e) => e.name)).toEqual(["Dev", "QA", "UAT", "Prod"]);
    const audit = await q(sql`select after from core.audit_event where action = 'delivery.project.setup' order by seq desc`);
    expect(audit).toHaveLength(1);
    expect(audit[0].after).toMatchObject({ key: "NWP", repoUrl: "github.com/example/northwind-portal", defaultBranch: "main" });
  });

  it("AC-2 refused without delivery:project:create, a repo URL holding credentials is refused, and nothing is created either way", async () => {
    const engineer = applyViewAs(maya, "Engineer");
    await expect(setUp(engineer, { key: "ENG", name: "Nope", client: "Internal", billing: "internal" })).rejects.toThrow(/forbidden/);
    await expect(setUp(maya, { key: "TOK", name: "Token", client: "Internal", billing: "internal", repoUrl: "https://user:secret@github.com/example/x" })).rejects.toThrow();
    expect(await q(sql`select key from delivery.project where key in ('ENG', 'TOK')`)).toEqual([]);
  });

  it("AC-8 a taken key is refused before the card and by the write, and the link isn't made on its own", async () => {
    const tool = registry.toolsFor(maya).find((x) => x.name === "set_up_project")!;
    await expect(tool.propose!(maya as never, { key: "CON" } as never)).rejects.toMatchObject({ field: "key", message: expect.stringMatching(/CON is taken/) });
    await expect(setUp(maya, { key: "CON", name: "Again", client: "Contoso", billing: "fixed", repoUrl: "https://github.com/example/again" })).rejects.toThrow(/taken/);
    expect(await q(sql`select key from delivery.project where repo_url = 'github.com/example/again'`)).toEqual([]);
  });
});
