import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import { configureRuntime } from "@amax/core/server";
import { installAuthorizer, loadViewer, setGrants, setViewerScopeResolvers, signInDemo, type Viewer } from "@amax/auth";
import { authFixtures } from "@amax/auth/fixtures";
import { loadFixtures, lumen } from "@amax/testing";
import delivery from "../module";
import { ctxFor } from "../server/context";
import { linkProjectRepo } from "../server/repo-sync";
import { pushSpecclaw } from "../server/push";
import { readSpecclaw } from "../sync/specclaw";

const T = lumen.tenant.id;
const REPO = "https://github.com/example/fleet-tracker.git";

function fakeRepo(dirs: Record<string, { archived?: boolean }>) {
  const root = mkdtempSync(join(tmpdir(), "amax-091-"));
  for (const [dir, c] of Object.entries(dirs)) {
    const base = join(root, ".specclaw/changes", c.archived ? "archive" : "", dir);
    mkdirSync(base, { recursive: true });
    writeFileSync(join(base, "change.md"), `# ${dir} title\n\n**Change:** ${dir}\n\n\n`);
    writeFileSync(join(base, "status.md"), "| Proposal | ✅ Approved | |\n");
  }
  return readSpecclaw(root);
}

// 091 AC-2, AC-4: what a push may do to a key, by where it comes from.
describe.skipIf(!hasDb)("091 sync_specclaw: history as Released, one folder per key", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  let nimal: Viewer;
  let at = 0;
  const push = (dirs: Record<string, { archived?: boolean }>, o: Partial<Parameters<typeof pushSpecclaw>[1]> = {}) =>
    pushSpecclaw(nimal, { projectKey: "FLT", repoUrl: REPO, ref: "main", sha: `9a9b9c${String(++at).padStart(2, "0")}`, committedAt: `2026-10-08T${String(9 + at).padStart(2, "0")}:00:00Z`, records: fakeRepo(dirs), dryRun: false, ...o });
  const row = async (key: string) => (await withTenant(app, T, (tx) => tx.execute(sql`select phase, source_ref, released_at from delivery.proposal where key = ${key}`)))[0];

  beforeAll(async () => {
    t = await migratedDatabase();
    app = t.app();
    configureRuntime({ db: app, auditKey: "k".repeat(32) });
    setGrants([delivery]);
    setViewerScopeResolvers([delivery.viewerScopes!]);
    installAuthorizer();
    await loadFixtures(app, [{ id: "auth", fixtures: [authFixtures] }, delivery], lumen);
    await withTenant(app, T, (tx) => tx.execute(sql`insert into auth.role_assignment (tenant_id, user_id, role, source)
      select ${T}, id, 'PM', 'manual' from auth.user where email = 'nimal@lumenlabs.test'`));
    nimal = (await loadViewer(app, T, (await signInDemo(app, T, "nimal@lumenlabs.test")).sessionId))!;
    await linkProjectRepo(ctxFor(nimal), { projectKey: "FLT", repoUrl: REPO, defaultBranch: "main" });
    await push({ "301-live": {}, "302-other": {} });
  });
  afterAll(() => t?.drop());

  it.each([
    ["the default branch, a finished change amax never stored", { "303-done": { archived: true } }, {}, "FLT-303", { created: 1, skipped: [] }, "released"],
    ["the default branch, a finished change amax already has", { "301-live": { archived: true } }, {}, "FLT-301", { created: 0, skipped: ["FLT-301: released comes from Prod deployments"] }, "planned"],
    ["a branch, its own finished change amax never stored", { "304-elsewhere": { archived: true } }, { ref: "specclaw/304-elsewhere" }, "FLT-304", { created: 0, skipped: ["FLT-304: released comes from Prod deployments"] }, undefined],
  ])("AC-4 %s", async (_, dirs, o, key, result, phase) => {
    expect(await push(dirs, o)).toMatchObject(result);
    expect((await row(key))?.phase).toBe(phase);
  });

  it.each([
    ["a branch whose folder reuses a key main holds for another", { "302-reused": {} }, { ref: "specclaw/302-reused" }, { needsReview: true, skipped: ["FLT-302: two changes numbered 302: 302-other, 302-reused"] }, "302-other"],
    ["its own branch, the same folder", { "302-other": {} }, { ref: "specclaw/302-other" }, { needsReview: false, skipped: [] }, "302-other"],
    ["the default branch renaming the change", { "301-live": {}, "302-renamed": {} }, {}, { needsReview: false, skipped: [] }, "302-renamed"],
  ])("AC-2 %s", async (_, dirs, o, result, folder) => {
    expect(await push(dirs, o)).toMatchObject(result);
    expect((await row("FLT-302")).source_ref).toBe(folder);
  });
});
