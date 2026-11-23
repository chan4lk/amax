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
import { syncSpecclaw } from "../sync/import";
import { getRepoSync, linkProjectRepo } from "../server/repo-sync";
import { pushSpecclaw } from "../server/push";
import { readSpecclaw } from "../sync/specclaw";

const T = lumen.tenant.id;
const REPO = "https://github.com/example/fleet-tracker.git";

function fakeRepo(dirs: string[]) {
  const root = mkdtempSync(join(tmpdir(), "amax-089-"));
  for (const dir of dirs) {
    mkdirSync(join(root, ".specclaw/changes", dir), { recursive: true });
    writeFileSync(join(root, ".specclaw/changes", dir, "change.md"), `# ${dir} title\n\n**Change:** ${dir}\n\n\n`);
    writeFileSync(join(root, ".specclaw/changes", dir, "status.md"), "| Proposal | ✅ Approved | |\n");
  }
  return readSpecclaw(root);
}

// 089: duplicate numbers are skipped for a person; a whole default-branch push withdraws what its branch last synced.
describe.skipIf(!hasDb)("089 sync_specclaw: duplicates and withdrawal", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  let nimal: Viewer;
  let at = 0;
  const push = (dirs: string[], o: Partial<Parameters<typeof pushSpecclaw>[1]> = {}) =>
    pushSpecclaw(nimal, { projectKey: "FLT", repoUrl: REPO, ref: "main", sha: `a1b2c${String(++at).padStart(2, "0")}`, committedAt: `2026-10-08T${String(9 + at).padStart(2, "0")}:00:00Z`, records: fakeRepo(dirs), dryRun: false, ...o });
  const row = async (key: string) => (await withTenant(app, T, (tx) => tx.execute(sql`select title, meta->>'withdrawn' as withdrawn from delivery.proposal where key = ${key}`)))[0];

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
    await push(["101-export", "102-import", "103-audit"]);
  });
  afterAll(() => t?.drop());

  it("AC-9 two folders sharing a number are skipped for a person, the stored proposal untouched; the rest applies", async () => {
    const r = await push(["101-export", "101-exports-v2", "102-import", "103-audit", "104-new"], { withdrawMissing: true });
    expect(r).toMatchObject({ outcome: "applied", created: 1, withdrawn: 0, needsReview: true, skipped: ["FLT-101: two changes numbered 101: 101-export, 101-exports-v2"] });
    expect(await row("FLT-101")).toMatchObject({ title: "101-export title", withdrawn: null });
  });

  it("AC-6 a whole default-branch push withdraws a gone folder; a batch, a branch push or an older commit doesn't", async () => {
    expect(await push(["101-export", "102-import", "104-new"])).toMatchObject({ withdrawn: 0 });
    expect(await push(["101-export", "102-import", "104-new"], { ref: "specclaw/101-export", withdrawMissing: true })).toMatchObject({ withdrawn: 0 });
    expect(await push(["101-export", "102-import", "104-new"], { committedAt: "2026-10-01T00:00:00Z", withdrawMissing: true, dryRun: true })).toMatchObject({ withdrawn: 0 });
    expect(await push([], { withdrawMissing: true, dryRun: true })).toMatchObject({ withdrawn: 0, needsReview: true, skipped: [expect.stringMatching(/^FLT: withdrawal held: the sync read no changes/)] });
    expect(await push(["101-export", "102-import", "104-new"], { withdrawMissing: true })).toMatchObject({ withdrawn: 1 });
    expect(await row("FLT-103")).toMatchObject({ withdrawn: "true" });
  });

  it("AC-7 the preview and the result count withdrawals, and the Repo sync row carries them with Needs you", async () => {
    expect(await push(["101-export", "104-new"], { withdrawMissing: true, dryRun: true })).toMatchObject({ outcome: "preview", withdrawn: 1 });
    expect(await row("FLT-102")).toMatchObject({ withdrawn: null });
    const recent = (await getRepoSync(nimal, { projectKey: "FLT" }))!.recent;
    expect(recent.find((p) => p.withdrawn === 1)).toMatchObject({ outcome: "applied", needsReview: false });
    expect(recent.find((p) => p.needsReview)).toMatchObject({ skipped: ["FLT-101: two changes numbered 101: 101-export, 101-exports-v2"] });
  });

  it("AC-12 the self-sync skips duplicate numbers too, and neither withdraws nor rewrites that key", async () => {
    const maya = (await loadViewer(app, T, (await signInDemo(app, T, "maya@lumenlabs.test")).sessionId))!;
    const r = await syncSpecclaw(app, ctxFor(maya), { projectKey: "FLT", projectName: "Fleet", client: "x", records: fakeRepo(["101-export", "101-exports-v2", "102-import", "104-new"]), sha: "5e1f5e9", committedAt: "2026-10-09T00:00:00Z" });
    expect(r.skipped).toEqual(["FLT-101: two changes numbered 101: 101-export, 101-exports-v2"]);
    expect(await row("FLT-101")).toMatchObject({ title: "101-export title", withdrawn: null });
  });

  it("AC-6 a mass withdrawal is held for a person, and applied once they confirm its count", async () => {
    const all = ["101-export", "102-import", "104-new", "105-a", "106-b", "107-c"];
    await push(all, { committedAt: "2026-10-10T09:00:00Z" });
    const held = await push(["101-export"], { committedAt: "2026-10-10T10:00:00Z", withdrawMissing: true, dryRun: true });
    expect(held).toMatchObject({ withdrawn: 0, needsReview: true, skipped: [expect.stringMatching(/^FLT: withdrawal held: it would withdraw 5 of 6 proposals .*sync again confirming 5 \(/)] });
    expect(await push(["101-export"], { committedAt: "2026-10-10T10:00:00Z", withdrawMissing: true, confirmWithdraw: 4, dryRun: true })).toMatchObject({ withdrawn: 0, needsReview: true });
    expect(await push(["101-export"], { committedAt: "2026-10-10T10:00:00Z", withdrawMissing: true, confirmWithdraw: 5 })).toMatchObject({ outcome: "applied", withdrawn: 5, needsReview: false });
    expect(await row("FLT-107")).toMatchObject({ withdrawn: "true" });
  });

  it("AC-12 the self-sync holds a mass withdrawal too, and applies it once confirmed with its count (--confirm-withdraw)", async () => {
    const maya = (await loadViewer(app, T, (await signInDemo(app, T, "maya@lumenlabs.test")).sessionId))!;
    const sync = (dirs: string[], confirmWithdraw?: number) => syncSpecclaw(app, ctxFor(maya), { projectKey: "SSC", projectName: "Self-sync", client: "x", records: fakeRepo(dirs).map((r) => ({ ...r, source: "main@5e1f5e0" })), sha: "5e1f5e0", committedAt: "2026-10-11T00:00:00Z", confirmWithdraw });
    await sync(["201-a", "202-b", "203-c", "204-d", "205-e", "206-f"]);
    expect(await sync(["201-a"])).toMatchObject({ withdrawn: 0, skipped: [expect.stringMatching(/^SSC: withdrawal held: it would withdraw 5 of 6 proposals .*--confirm-withdraw\)$/)] });
    expect(await sync(["201-a"], 4)).toMatchObject({ withdrawn: 0 });
    expect(await sync(["201-a"], 5)).toMatchObject({ withdrawn: 5, skipped: [] });
  });

  // 089 final pass: the self-sync never reads a change that exists only on a branch, so it can't withdraw the proposal a
  // branch push made for it, even from a newer main commit; a change it did read from main still can be.
  it("AC-6 a newer self-sync of main leaves a branch-only proposal alone", async () => {
    await push(["101-export", "208-branch-only"], { ref: "specclaw/208-branch-only", committedAt: "2026-10-12T00:00:00Z" });
    expect(await row("FLT-208")).toMatchObject({ withdrawn: null });
    const maya = (await loadViewer(app, T, (await signInDemo(app, T, "maya@lumenlabs.test")).sessionId))!;
    const onMain = fakeRepo(["101-export"]).map((r) => ({ ...r, source: "main@7c1e2d4" }));
    const r = await syncSpecclaw(app, ctxFor(maya), { projectKey: "FLT", projectName: "Fleet", client: "x", records: onMain, sha: "7c1e2d4", committedAt: "2026-10-13T00:00:00Z" });
    expect(r.withdrawn).toBe(0);
    expect(await row("FLT-208")).toMatchObject({ withdrawn: null });
  });
});
