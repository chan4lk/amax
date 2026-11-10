import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import { configureRuntime, traceStep, withTrace } from "@amax/core/server";
import { completePrivacyRequest, openPrivacyRequest, requestNameRows, setPrivacySources } from "@amax/core/privacy";
import { installAuthorizer, loadViewer, setGrants, setViewerScopeResolvers, signInDemo, type Viewer } from "@amax/auth";
import { authFixtures } from "@amax/auth/fixtures";
import { loadFixtures, lumen } from "@amax/testing";
import delivery from "../module";
import { mcpTools } from "../mcp";
import { ctxFor } from "../server/context";
import { syncProposal } from "../server/services";
import { syncSpecclaw } from "../sync/import";
import { getRepoSync, linkProjectRepo } from "../server/repo-sync";
import { normaliseRepo } from "../sync/repo-url";
import { pushSpecclaw } from "../server/push";
import { readSpecclaw } from "../sync/specclaw";

const T = lumen.tenant.id;
const REPO = "https://github.com/example/fleet-tracker.git";

function fakeRepo(changes: Record<string, { tasks?: string; archived?: boolean; title?: string; corrupt?: boolean }>) {
  const root = mkdtempSync(join(tmpdir(), "amax-push-"));
  for (const [dir, c] of Object.entries(changes)) {
    const base = join(root, ".specclaw/changes", c.archived ? "archive" : "", dir);
    mkdirSync(base, { recursive: true });
    if (c.corrupt) writeFileSync(join(base, "state.json"), "{ not json");
    writeFileSync(join(base, "change.md"), `# ${c.title ?? `${dir} title`}\n\n**Change:** ${dir}\n**Lane:** Delivery · **Module:** \`x\`\n\n## Tasks\n${c.tasks ?? ""}\n`);
    writeFileSync(join(base, "status.md"), "| Proposal | ✅ Approved | |\n");
  }
  return root;
}

// 062 AC-11: every refusal, the dry run, the idempotent re-push, the cap, ordering, erasure.
describe.skipIf(!hasDb)("062 sync_specclaw guard rails", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  let nimal: Viewer;
  const count = async (q: ReturnType<typeof sql>) => Number((await withTenant(app, T, (tx) => tx.execute(q)))[0].n);
  const audits = () => count(sql`select count(*)::int as n from core.audit_event`);
  const pushRows = () => count(sql`select count(*)::int as n from delivery.sync_push`);
  const records = readSpecclaw(fakeRepo({ "101-export": { tasks: "- [x] `T1` — one\n- [ ] `T2` — two" }, "102-import": {}, "103-old": { archived: true } }));
  const push = (o: Partial<Parameters<typeof pushSpecclaw>[1]> = {}) =>
    pushSpecclaw(nimal, { projectKey: "FLT", repoUrl: REPO, ref: "main", sha: "a1b2c3d", committedAt: "2026-10-08T09:00:00Z", records, ...o });
  const proposal = async (key: string) => (await withTenant(app, T, (tx) => tx.execute(sql`select title, tasks_done, meta->>'pr' as pr, synced_commit_at from delivery.proposal where key = ${key}`)))[0];

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
  });
  afterAll(() => t?.drop());

  it("AC-4 a PM links only a project they manage; a push from any other repo is refused and recorded; URLs with credentials are refused", async () => {
    expect(normaliseRepo("git@GitHub.com:example/fleet-tracker.git")).toBe("github.com/example/fleet-tracker");
    expect(await push({ dryRun: false })).toMatchObject({ outcome: "refused", reason: expect.stringMatching(/no linked repo/) });
    await expect(linkProjectRepo(ctxFor(nimal), { projectKey: "CON", repoUrl: REPO })).rejects.toThrow(/data scope/);
    await expect(linkProjectRepo(ctxFor(nimal), { projectKey: "FLT", repoUrl: "https://x-access-token:ghp_secret@github.com/example/fleet-tracker" })).rejects.toThrow(/user name or token/);
    await expect(push({ repoUrl: "https://bob:pw@github.com/example/fleet-tracker" })).rejects.toThrow(/user name or token/);
    await expect(push({ repoUrl: "x-access-token:ghp_secret@github.com:example/fleet-tracker" })).rejects.toThrow(/user name or token/);
    // What the MCP handler writes before the tool runs (packages/mcp/src/server.ts): a keyed hash of the
    // arguments, never the arguments, so a token in one is not stored (review rounds 1-3).
    await withTrace({ tenantId: T, actor: `user:${nimal.userId}`, source: "mcp" }, () =>
      traceStep({ kind: "mcp_call", tool: "link_project_repo", args: { projectKey: "FLT", repoUrl: "https://x-access-token:ghp_TRACESECRET@github.com/example/fleet-tracker" } }));
    expect(await count(sql`select count(*)::int as n from core.trace_event where tool = 'link_project_repo'`)).toBe(1);
    expect(await count(sql`select count(*)::int as n from core.trace_event t where t::text like '%TRACESECRET%'`)).toBe(0);
    await expect(linkProjectRepo(ctxFor(nimal), { projectKey: "FLT", repoUrl: "git@github.com:example/fleet-tracker" })).rejects.toThrow(/default branch/);
    await linkProjectRepo(ctxFor(nimal), { projectKey: "FLT", repoUrl: "ssh://git@github.com/example/fleet-tracker", defaultBranch: "trunk" });
    // A relink to the same repo keeps the stored branch unless one is given; another repo must name it.
    await linkProjectRepo(ctxFor(nimal), { projectKey: "FLT", repoUrl: "git@github.com:example/fleet-tracker" });
    expect((await withTenant(app, T, (tx) => tx.execute(sql`select repo_default_ref from delivery.project where key = 'FLT'`)))[0].repo_default_ref).toBe("trunk");
    await expect(linkProjectRepo(ctxFor(nimal), { projectKey: "FLT", repoUrl: "git@github.com:example/other" })).rejects.toThrow(/default branch/);
    await expect(linkProjectRepo(ctxFor(nimal), { projectKey: "FLT", repoUrl: "git+https://ghp_token@github.com/example/fleet-tracker", defaultBranch: "main" })).rejects.toThrow(/user name or token/);
    await linkProjectRepo(ctxFor(nimal), { projectKey: "FLT", repoUrl: "git@github.com:example/fleet-tracker", defaultBranch: "main" });
    expect(await push({ repoUrl: "https://github.com/example/other", dryRun: false })).toMatchObject({ outcome: "refused", reason: expect.stringMatching(/repo not linked to FLT/) });
    expect((await getRepoSync(nimal, { projectKey: "FLT" }))!.recent.map((p) => p.outcome)).toEqual(["refused", "refused"]);
  });

  it("AC-3/AC-5 refuses an unknown project and a project the person isn't on; the push grant doesn't open sync_proposal", async () => {
    await expect(push({ projectKey: "NOPE" })).rejects.toThrow(/no project NOPE/);
    await expect(push({ projectKey: "CON" })).rejects.toThrow(/forbidden/);
    // sync_proposal has none of the push's guards, so a PM's push grant must not reach it (review round 1).
    await expect(syncProposal(ctxFor(nimal), { projectKey: "FLT", project: { name: "x", client: "x" }, key: "FLT-901", title: "x", phase: "released", tasksDone: 0, tasksTotal: 0,
      source: "specclaw", sourceRef: "901-x", committedAt: "2026-10-01T00:00:00Z", releasedAt: null, meta: {} })).rejects.toThrow(/forbidden/);
  });

  it("AC-2/AC-6/AC-7 a dry run writes nothing; an apply never releases what amax has; re-pushing the same state writes and audits nothing", async () => {
    const before = await audits();
    const preview = await push();
    // 091 AC-4: the default branch brings a finished change amax has never stored in as Released history.
    expect(preview).toMatchObject({ outcome: "preview", created: 3, updated: 0, skipped: [], needsReview: false });
    expect(await audits()).toBe(before);
    expect(await push({ dryRun: false })).toMatchObject({ outcome: "applied", created: 3, skipped: [] });
    expect(await count(sql`select count(*)::int as n from delivery.proposal where key = 'FLT-103' and phase = 'released'`)).toBe(1);
    expect((await getRepoSync(nimal, { projectKey: "FLT" }))!.lastApplied).toMatchObject({ by: "Nimal Silva", created: 3 });
    const settled = await audits(), rows = await pushRows();
    // Nothing new: no Repo sync row, and one audit for moving the marks (review round 4, chosen by the product owner).
    expect(await push({ sha: "b2c3d4e", committedAt: "2026-10-08T10:00:00Z", dryRun: false })).toMatchObject({ outcome: "unchanged", created: 0, updated: 0, unchanged: 3, skipped: [] });
    expect([await audits(), await pushRows()]).toEqual([settled + 1, rows]);
    expect(new Date((await proposal("FLT-102")).synced_commit_at as string).toISOString()).toBe("2026-10-08T10:00:00.000Z");
    // So a commit between the applied one and the unchanged one, with other content, is stale.
    const between = await push({ sha: "b1e0b1e", committedAt: "2026-10-08T09:30:00Z", records: readSpecclaw(fakeRepo({ "102-import": { title: "Edited, then reverted" } })), dryRun: false });
    expect(between.skipped).toEqual([expect.stringMatching(/^FLT-102: stale/)]);
    await expect(push({ records: Array(201).fill(records[0]) })).rejects.toThrow(/200/);
  });

  it.each([
    ["an older commit, from its own branch", { ref: "specclaw/101-export", sha: "01dc0de", committedAt: "2026-10-07T09:00:00Z", repo: { "101-export": { tasks: "- [x] `T1` — one\n- [x] `T2` — two" } } }, /^FLT-101: stale: last synced from a newer commit/],
    ["its own change's earlier phase", { ref: "specclaw/101-export", sha: "c0ffee1", committedAt: "2026-10-08T11:00:00Z", repo: { "101-export": {} } }, /^FLT-101: would move back from building to planned$/],
    ["its own change archived", { ref: "specclaw/102-import", sha: "c0ffee2", committedAt: "2026-10-08T11:00:00Z", repo: { "102-import": { archived: true } } }, /^FLT-102: released comes from Prod deployments$/],
  ])("AC-6/AC-8 a branch push skips %s and writes nothing for it", async (_name, o, why) => {
    const { repo, ...rest } = o;
    const r = await push({ ...rest, records: readSpecclaw(fakeRepo(repo)), dryRun: false });
    expect(r).toMatchObject({ created: 0, updated: 0, needsReview: false });
    expect(r.skipped).toEqual([expect.stringMatching(why)]);
  });

  it("AC-6 a branch cut from an older main, with a newer commit, touches only its own change", async () => {
    const forked = readSpecclaw(fakeRepo({ "101-export": { title: "Old export title" }, "102-import": { title: "Import, renamed on the branch" } }));
    const r = await push({ ref: "specclaw/102-import", sha: "f0f0f0f", committedAt: "2026-10-08T12:00:00Z", records: forked, dryRun: false });
    expect(r).toMatchObject({ outcome: "applied", updated: 1, skipped: [] });
    expect((await proposal("FLT-101")).title).toBe("101-export title");
    expect((await proposal("FLT-102")).title).toBe("Import, renamed on the branch");
  });

  it("AC-6 the default branch is the one stored with the link: a payload can't claim it, and a branch naming no change is flagged", async () => {
    const claim = await push({ ref: "release", defaultRef: "release", sha: "a0a0a0a", committedAt: "2026-10-08T12:10:00Z", records: readSpecclaw(fakeRepo({ "101-export": { title: "Hijacked" } })), dryRun: false } as never);
    expect(claim).toMatchObject({ outcome: "applied", updated: 0, ignored: 1, needsReview: true, skipped: [expect.stringMatching(/^release: not the default branch \(main\)/)] });
    expect((await proposal("FLT-101")).title).toBe("101-export title");
  });

  it("AC-7 on the default branch a step back is flagged for a person, not treated as standing", async () => {
    const r = await push({ sha: "b1b1b1b", committedAt: "2026-10-08T12:20:00Z", records: readSpecclaw(fakeRepo({ "101-export": {} })) });
    expect(r).toMatchObject({ needsReview: true, skipped: ["FLT-101: would move back from building to planned"] });
  });

  it("AC-8 sync_proposal must say which commit it read the spec at", () => {
    const tool = mcpTools.find((x) => x.name === "sync_proposal")!;
    const call = { projectKey: "FLT", projectName: "x", client: "x", key: "FLT-101", title: "x", phase: "building", sourceRef: "101-export", tasks: [] };
    expect(tool.input.safeParse(call).success).toBe(false);
    expect(tool.input.safeParse({ ...call, committedAt: "2026-10-08T12:00:00Z" }).success).toBe(true);
  });

  it("AC-8 a self-sync from a newer main commit moves the mark, changed or not, so an older push is stale", async () => {
    const maya = (await loadViewer(app, T, (await signInDemo(app, T, "maya@lumenlabs.test")).sessionId))!;
    // 089: the self-sync withdraws only what the refs it read last synced, so its records carry main's ref, as bin.ts's do.
    const onMain = (dir: string, sha: string) => readSpecclaw({ dir, ref: `main@${sha}` });
    const main = onMain(fakeRepo({ "101-export": { tasks: "- [x] `T1` — one\n- [ ] `T2` — two" }, "102-import": { title: "Import, renamed on the branch" } }), "5e1f5e1");
    await syncSpecclaw(app, ctxFor(maya), { projectKey: "FLT", projectName: "Fleet", client: "x", records: main, sha: "5e1f5e1", committedAt: "2026-10-08T12:30:00Z" });
    const r = await push({ sha: "01d0001", committedAt: "2026-10-08T12:25:00Z", records: readSpecclaw(fakeRepo({ "101-export": { title: "Older title" }, "102-import": { title: "Older title" } })) });
    expect(r.skipped).toEqual([expect.stringMatching(/^FLT-101: stale/), expect.stringMatching(/^FLT-102: stale/)]);
    // A change the self-sync withdraws is read at that commit too.
    await syncSpecclaw(app, ctxFor(maya), { projectKey: "FLT", projectName: "Fleet", client: "x", records: onMain(fakeRepo({ "101-export": { tasks: "- [x] `T1` — one\n- [ ] `T2` — two" } }), "5e1f5e2"), sha: "5e1f5e2", committedAt: "2026-10-08T12:40:00Z" });
    const after = await push({ sha: "01d0002", committedAt: "2026-10-08T12:35:00Z", records: readSpecclaw(fakeRepo({ "102-import": { title: "Older title" } })) });
    expect(after.skipped).toEqual([expect.stringMatching(/^FLT-102: stale: last synced from a newer commit \(2026-10-08T12:40/)]);
  });

  it("AC-7 a skip a person should see is recorded and flagged; main can clear a PR link", async () => {
    const before = await pushRows();
    const r = await push({ sha: "d00d00d", committedAt: "2026-10-08T13:00:00Z", records: readSpecclaw(fakeRepo({ "101-export": { corrupt: true } })), dryRun: false });
    expect(r).toMatchObject({ outcome: "applied", created: 0, updated: 0, needsReview: true, skipped: ["FLT-101: state.json unreadable"] });
    expect(await pushRows()).toBe(before + 1);
    await withTenant(app, T, (tx) => tx.execute(sql`update delivery.proposal set meta = meta || '{"pr":"https://github.com/example/fleet-tracker/pull/9"}' where key = 'FLT-102'`));
    await push({ sha: "e00e00e", committedAt: "2026-10-08T13:30:00Z", records: readSpecclaw(fakeRepo({ "102-import": { title: "Import, renamed on the branch" } })), dryRun: false });
    expect((await proposal("FLT-102")).pr).toBeNull();
  });

  it("AC-8 refuses a commit time in the future; a push waits on the project lock before reading anything", async () => {
    await expect(push({ committedAt: new Date(Date.now() + 3_600_000).toISOString() })).rejects.toThrow(/future/);
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let locked!: () => void;
    const isLocked = new Promise<void>((r) => (locked = r));
    // Another session holds only FLT's row. The push below changes nothing, so it would never reach a
    // write's lock: only applyPush's own lock can make it wait (review round 3).
    const other = app.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${T}, true)`);
      await tx.execute(sql`select 1 from delivery.project where key = 'FLT' for update`);
      locked();
      await held;
    });
    await isLocked;
    const stored = readSpecclaw(fakeRepo({ "102-import": { title: "Import, renamed on the branch" } }));
    const pending = push({ sha: "abc14de", committedAt: "2026-10-08T14:00:00Z", records: stored });
    const waited = await Promise.race([pending.then(() => false), new Promise<boolean>((r) => setTimeout(() => r(true), 300))]);
    release();
    await other;
    expect(waited).toBe(true);
    expect(await pending).toMatchObject({ outcome: "preview", unchanged: 1 });
  });

  it.each([
    ["who pushed", "actor", "ayesha@lumenlabs.test"],
    ["the person a credential pushed for", "for_user", "kasun@lumenlabs.test"],
    ["someone who is both on one row", "both", "ravi@lumenlabs.test"],
  ])("AC-11 erasing %s anonymises their sync_push rows", async (_name, column, email) => {
    const ayesha = (await withTenant(app, T, (tx) => tx.execute(sql`select id from auth.user where email = ${email}`)))[0].id as string;
    const project = (await withTenant(app, T, (tx) => tx.execute(sql`select id from delivery.project where key = 'FLT'`)))[0].id as string;
    const [row] = await withTenant(app, T, (tx) => tx.execute(sql`insert into delivery.sync_push (tenant_id, project_id, actor_id, actor_kind, for_user_id, repo_url, ref, sha, committed_at, outcome)
      values (${T}, ${project}, ${column === "for_user" ? "sp:00000000-0000-4000-8000-000000000001" : `user:${ayesha}`}, ${column === "for_user" ? "service" : "user"}, ${column === "actor" ? null : ayesha},
              'github.com/example/fleet-tracker', 'main', 'abcdef1', now(), 'applied') returning id`));
    setPrivacySources([delivery]);
    // Two people, as erasure requires: one opens the request, another completes it.
    const as = async (who: string) => (await loadViewer(app, T, (await signInDemo(app, T, who)).sessionId))!;
    const maya = await as("maya@lumenlabs.test");
    const req = await openPrivacyRequest(ctxFor(await as("sahan@lumenlabs.test")), { kind: "erasure", person: email });
    // Proposal owners recorded only by name need a decision; they aren't this person's here.
    const named = await withTenant(app, T, (tx) => requestNameRows(tx, req.id));
    await completePrivacyRequest(ctxFor(maya), { id: req.id, nameRows: { exclude: named.flatMap((n) => n.rows.map((r) => r.id)) } });
    const [after] = await t.owner`select actor_id, for_user_id from delivery.sync_push where id = ${row.id as string}`;
    expect(after.actor_id).not.toContain(ayesha);
    expect(after.for_user_id).toBeNull();
    if (column === "for_user") expect(after.actor_id).toBe("sp:00000000-0000-4000-8000-000000000001");
  });
});
