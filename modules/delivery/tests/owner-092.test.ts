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

function fakeRepo(dir: string, title: string, ownerLine?: string) {
  const root = mkdtempSync(join(tmpdir(), "amax-092-"));
  mkdirSync(join(root, ".specclaw/changes", dir), { recursive: true });
  writeFileSync(join(root, ".specclaw/changes", dir, "change.md"), `# ${title}\n\n**Change:** ${dir}${ownerLine ? `\n${ownerLine}` : ""}\n\n`);
  return readSpecclaw(root);
}

describe.skipIf(!hasDb)("092 owners: a person's choice stands under concurrency, and Owner lines parse cleanly", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  let nimal: Viewer;
  let at = 0;
  const push = (dir: string, title: string, author: string | null) =>
    pushSpecclaw(nimal, { projectKey: "FLT", repoUrl: REPO, ref: "main", sha: `0c0d0e${String(++at).padStart(2, "0")}`, committedAt: new Date(Date.parse("2026-10-08T09:00:00Z") + at * 60_000).toISOString(),
      records: fakeRepo(dir, title).map((r) => ({ ...r, author })), dryRun: false });
  const row = async (key: string) => (await withTenant(app, T, (tx) => tx.execute(sql`select title, owner_name from delivery.proposal where key = ${key}`)))[0];

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
  });
  afterAll(() => t?.drop());

  // 092 AC-1: a person sets the owner while a sync of the same proposal is running. The person's transaction holds the
  // row (as update_proposal's does: lifecycle.ts locks the proposal, then writes owner and owner_set_by_person). The
  // sync waits at its locked read of the row, then sees the person's owner and flag, and keeps them.
  it("AC-1 an owner a person sets during a sync stands", async () => {
    await push("601-race", "Race v1", "stranger@example.test");
    expect(await row("FLT-601")).toMatchObject({ owner_name: null });
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let locked!: () => void;
    const isLocked = new Promise<void>((r) => (locked = r));
    const person = app.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${T}, true)`);
      await tx.execute(sql`select id from delivery.proposal where key = 'FLT-601' for update`);
      await tx.execute(sql`update delivery.proposal set owner_user_id = ${nimal.userId}, owner_name = 'Nimal Silva', owner_set_by_person = true where key = 'FLT-601'`);
      locked();
      await held;
    });
    await isLocked;
    const sync = push("601-race", "Race v2", "stranger@example.test");
    const waited = await Promise.race([sync.then(() => false), new Promise<boolean>((r) => setTimeout(() => r(true), 300))]);
    release();
    await person;
    await sync;
    expect(waited).toBe(true);
    expect(await row("FLT-601")).toMatchObject({ title: "Race v2", owner_name: "Nimal Silva" });
    // 093 review round 1: the sync read the row locked, so its audit doesn't claim the person's change as its own.
    const [audit] = await withTenant(app, T, (tx) => tx.execute(sql`select before->>'owner' as was, after->>'owner' as now from core.audit_event a
      join delivery.proposal p on a.resource_id = p.id::text where p.key = 'FLT-601' and a.action = 'delivery.proposal.sync' order by a.seq desc limit 1`));
    expect(audit).toMatchObject({ was: "Nimal Silva", now: "Nimal Silva" });
  });

  // 092 AC-2: the Owner line's email is a clean address, whatever punctuation people put around it. 093 final pass: and
  // the whole address, never cut down to a different one when it has an unusual character before the @.
  it.each([
    ["a trailing comma", "**Owner:** nimal@lumenlabs.test,", "nimal@lumenlabs.test"],
    ["a trailing full stop after a bracketed name", "**Owner:** Nimal Silva <nimal@lumenlabs.test>.", "nimal@lumenlabs.test"],
    ["a markdown mailto link", "**Owner:** [nimal@lumenlabs.test](mailto:nimal@lumenlabs.test)", "nimal@lumenlabs.test"],
    ["a semicolon and a note", "**Owner:** nimal@lumenlabs.test; backend lead", "nimal@lumenlabs.test"],
    ["inside parentheses", "**Owner:** (nimal@lumenlabs.test)", "nimal@lumenlabs.test"],
    ["an apostrophe in the address", "**Owner:** o'brien@lumenlabs.test", "o'brien@lumenlabs.test"],
    ["a ! in the address, bracketed", "**Owner:** Ann <a!b@lumenlabs.test>", "a!b@lumenlabs.test"],
    ["a plus tag, quoted", "**Owner:** `first+tag@lumenlabs.test`", "first+tag@lumenlabs.test"],
    ["single quotes around it", "**Owner:** 'nimal@lumenlabs.test'", "nimal@lumenlabs.test"],
    ["bold markup around it", "**Owner:** *nimal@lumenlabs.test*", "nimal@lumenlabs.test"],
    ["italic markup around it", "**Owner:** _nimal@lumenlabs.test_", "nimal@lumenlabs.test"],
  ])("AC-2 the Owner line with %s", (_, line, email) => {
    expect(fakeRepo("611-owner", "Owner", line)[0].owner).toBe(email);
  });
});
