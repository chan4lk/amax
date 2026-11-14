import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import { configureRuntime, traceStep, withTrace } from "@amax/core/server";
import { installAuthorizer, loadViewer, setGrants, setViewerScopeResolvers, signInDemo, type Viewer } from "@amax/auth";
import { authFixtures } from "@amax/auth/fixtures";
import { loadFixtures, lumen } from "@amax/testing";
import delivery from "../module";
import { ctxFor } from "../server/context";
import { updateProposal } from "../server/lifecycle";
import { linkProjectRepo } from "../server/repo-sync";
import { pushSpecclaw } from "../server/push";
import { suggestedOwner } from "../server/proposal-kinds";
import { readSpecclaw } from "../sync/specclaw";

const T = lumen.tenant.id;
const REPO = "https://github.com/example/fleet-tracker.git";

function fakeRepo(dir: string, ownerLine?: string) {
  const root = mkdtempSync(join(tmpdir(), "amax-own-"));
  mkdirSync(join(root, ".specclaw/changes", dir), { recursive: true });
  writeFileSync(join(root, ".specclaw/changes", dir, "change.md"), `# ${dir} title\n\n**Change:** ${dir}${ownerLine ? `\n${ownerLine}` : ""}\n\n## Problem\n\n**Owner:** not-header@example.test\n`);
  return root;
}

// 091 AC-7: the owner comes from the repo, never from who pushed (here Nimal, the PM, pushes everything).
describe.skipIf(!hasDb)("091 a spec proposal's owner comes from its repo", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  let nimal: Viewer;
  let at = 0;
  const push = (dir: string, o: { ownerLine?: string; author?: string | null } = {}) =>
    pushSpecclaw(nimal, { projectKey: "FLT", repoUrl: REPO, ref: "main", sha: `0a0b0c${String(++at).padStart(2, "0")}`, committedAt: new Date(Date.parse("2026-10-08T09:00:00Z") + at * 60_000).toISOString(),
      records: readSpecclaw(fakeRepo(dir, o.ownerLine)).map((r) => ({ ...r, author: "author" in o ? o.author : null })), dryRun: false });
  const idOf = async (key: string) => (await withTenant(app, T, (tx) => tx.execute(sql`select id from delivery.proposal where key = ${key}`)))[0].id as string;
  const ownerOf = async (key: string) => (await withTenant(app, T, (tx) => tx.execute(sql`select owner_name from delivery.proposal where key = ${key}`)))[0]?.owner_name ?? null;

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
    await withTenant(app, T, (tx) => tx.execute(sql`insert into auth.git_identity (tenant_id, user_id, provider, login, email, email_verified)
      select ${T}, id, 'github', 'nimal-dev', 'nimal.commits@example.test', true from auth.user where email = 'nimal@lumenlabs.test'`));
  });
  afterAll(() => t?.drop());

  // 091 final pass: every way people write the Owner line, and only the header's.
  let readerRow = 0;
  it.each([
    ["a bare email", "**Owner:** kasun@lumenlabs.test", "kasun@lumenlabs.test"],
    ["a quoted email", "**Owner:** `kasun@lumenlabs.test`", "kasun@lumenlabs.test"],
    ["a bracketed email, as the README writes it", "**Owner:** <kasun@lumenlabs.test>", "kasun@lumenlabs.test"],
    ["a name and email", "**Owner:** Kasun Dias <kasun@lumenlabs.test>", "kasun@lumenlabs.test"],
    ["no Owner line (one in the body doesn't count)", undefined, null],
  ])("AC-7 the reader takes the Owner line from the header: %s", (_, line, owner) => {
    expect(readSpecclaw(fakeRepo(`50${++readerRow}-a`, line))[0].owner).toBe(owner);
  });

  it.each([
    ["the Owner line names a person on the project", "511-owner-line", { ownerLine: "**Owner:** nimal@lumenlabs.test", author: "someone@example.test" }, "Nimal Silva"],
    ["no Owner line: the change's author, by work email", "512-author", { author: "NIMAL@lumenlabs.test" }, "Nimal Silva"],
    ["the author, by a verified git identity", "513-identity", { author: "nimal.commits@example.test" }, "Nimal Silva"],
    ["a person who isn't on the project", "514-off-project", { ownerLine: "**Owner:** liam@lumenlabs.test" }, null],
    ["an email nobody in amax has", "515-unknown", { author: "stranger@example.test" }, null],
    ["the repo names nobody: never the person who pushed", "516-nobody", {}, null],
  ])("AC-7 %s", async (_, dir, o, owner) => {
    await push(dir, o);
    expect(await ownerOf(`FLT-${dir.slice(0, 3)}`)).toBe(owner);
  });

  it("AC-7 a git identity linked after the first sync gives the unchanged change its owner on the next sync", async () => {
    const r1 = await push("531-linked-later", { author: "nimal.later@example.test" });
    expect([r1.created, await ownerOf("FLT-531")]).toEqual([1, null]);
    await withTenant(app, T, (tx) => tx.execute(sql`insert into auth.git_identity (tenant_id, user_id, provider, login, email, email_verified)
      select ${T}, id, 'github', 'nimal-later', 'nimal.later@example.test', true from auth.user where email = 'nimal@lumenlabs.test'`));
    const r2 = await push("531-linked-later", { author: "nimal.later@example.test" });
    expect([r2.updated, r2.unchanged, await ownerOf("FLT-531")]).toEqual([1, 0, "Nimal Silva"]);
    expect((await push("531-linked-later", { author: "nimal.later@example.test" })).unchanged).toBe(1);
  });

  it("AC-7 a sync follows the repo, and the audit records the owner before and after", async () => {
    await push("521-follow", { author: "nimal@lumenlabs.test" });
    expect(await ownerOf("FLT-521")).toBe("Nimal Silva");
    await push("521-follow", { author: "stranger@example.test" });
    expect(await ownerOf("FLT-521")).toBeNull();
    const [audit] = await withTenant(app, T, (tx) => tx.execute(sql`select before->>'owner' as was, after->>'owner' as now from core.audit_event a
      join delivery.proposal p on a.resource_id = p.id::text where p.key = 'FLT-521' and a.action = 'delivery.proposal.sync' order by a.seq desc limit 1`));
    expect(audit).toMatchObject({ was: "Nimal Silva", now: null });
  });

  it("AC-7 an author git couldn't read keeps the stored owner; the email is never stored", async () => {
    await push("541-unknown", { author: "nimal@lumenlabs.test" });
    await push("541-unknown", { author: undefined });
    expect(await ownerOf("FLT-541")).toBe("Nimal Silva");
    const stored = await withTenant(app, T, (tx) => tx.execute(sql`select count(*)::int as n from delivery.proposal where meta::text ~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}' or meta ? 'ownerEmail'`));
    expect(stored[0].n).toBe(0);
  });

  // 091 review round 2: both transports trace a tool call through traceStep (packages/mcp/src/server.ts,
  // packages/api/src/rest.ts), which keeps a keyed hash of the arguments, so the emails a sync carries aren't stored.
  it("AC-7 a sync_specclaw call's trace holds no author email", async () => {
    const records = readSpecclaw(fakeRepo("561-traced", "**Owner:** traced.owner@example.test")).map((r) => ({ ...r, author: "traced.author@example.test" }));
    await withTrace({ tenantId: T, actor: `user:${nimal.userId}`, source: "api" }, () => traceStep({ kind: "mcp_call", tool: "sync_specclaw", args: { projectKey: "FLT", records } }));
    const rows = await withTenant(app, T, (tx) => tx.execute(sql`select count(*) filter (where tool = 'sync_specclaw')::int as calls, count(*) filter (where t::text like '%traced.%@example.test%')::int as leaks from core.trace_event t`));
    expect(rows[0]).toEqual({ calls: 1, leaks: 0 });
  });

  // 091 review round 1: every way a person sets an owner stops the sync from changing it, and so does an owner a person
  // set before 0021 (the backfill reads the audit log once).
  const setBy = {
    "update_proposal": (key: string) => updateProposal(ctxFor(nimal), { key, ownerUserId: nimal.userId }),
    "accepting a Suggested owner": (key: string) => withTenant(app, T, async (tx) =>
      suggestedOwner.apply(tx, ctxFor(nimal), { proposalId: await idOf(key), key, userId: nimal.userId, name: "Nimal Silva" })),
    "undoing a Suggested owner": (key: string) => withTenant(app, T, async (tx) => {
      const p = { proposalId: await idOf(key), key, userId: nimal.userId, name: "Nimal Silva" };
      await suggestedOwner.apply(tx, ctxFor(nimal), p);
      await suggestedOwner.undo!(tx, ctxFor(nimal), p, { key });
    }),
    "an owner set before 0021 (the backfill)": async (key: string) => {
      await withTenant(app, T, (tx) => tx.execute(sql`update delivery.proposal set owner_user_id = ${nimal.userId}, owner_name = 'Nimal Silva', owner_set_by_person = false where key = ${key}`));
      await updateProposal(ctxFor(nimal), { key, ownerUserId: nimal.userId });
      await withTenant(app, T, (tx) => tx.execute(sql`update delivery.proposal set owner_set_by_person = false where key = ${key}`));
      const backfill = readFileSync(join(__dirname, "../db/migrations/0021_owner_set_by_person.sql"), "utf8").split(/^update /m)[1];
      await t.owner.unsafe(`update ${backfill}`);
    },
  };
  it.each(Object.keys(setBy))("AC-7 once a person sets the owner (%s), a sync leaves it", async (how) => {
    const dir = `55${Object.keys(setBy).indexOf(how)}-person`;
    const key = `FLT-${dir.slice(0, 3)}`;
    await push(dir, { author: "stranger@example.test" });
    expect(await ownerOf(key)).toBeNull();
    await setBy[how as keyof typeof setBy](key);
    const settled = await ownerOf(key);
    // The repo now names someone else than the person's choice, so following it would show.
    await push(dir, { author: settled ? "stranger@example.test" : "nimal@lumenlabs.test" });
    expect(await ownerOf(key)).toBe(settled);
    expect((await withTenant(app, T, (tx) => tx.execute(sql`select owner_set_by_person from delivery.proposal where key = ${key}`)))[0].owner_set_by_person).toBe(true);
  });
});
