import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const repoRoot = join(__dirname, "../../..");
type Out = { lines: string[]; notices: string[]; warnings: string[]; errors: string[] };
type Run = (o: { env: Record<string, string>; root: string; fetchImpl: typeof fetch; out: unknown }) => Promise<number>;
let run: Run;
let readSpecclaw: (dir: string) => { dir: string }[];

const ENV = { AMAX_URL: "https://amax.example/", AMAX_SYNC_API_KEY: "key-123", AMAX_SYNC_ACT_FOR: "6f1c2c1e-0000-4000-8000-000000000001" };
const ok = (over: object = {}) => ({ outcome: "applied", created: 1, updated: 0, withdrawn: 0, unchanged: 0, ignored: 0, skipped: [], needsReview: false, ...over });

function repo(mainDirs: string[], branch?: { name: string; dirs: string[] }) {
  const root = mkdtempSync(join(tmpdir(), "specclaw-ci-"));
  const git = (...a: string[]) => execFileSync("git", a, { cwd: root, encoding: "utf8" }).trim();
  const write = (dirs: string[]) => {
    mkdirSync(join(root, ".specclaw"), { recursive: true });
    writeFileSync(join(root, ".specclaw/config.yaml"), "amax:\n  project: FLT\n");
    for (const d of dirs) { mkdirSync(join(root, ".specclaw/changes", d), { recursive: true }); writeFileSync(join(root, ".specclaw/changes", d, "change.md"), `# ${d}\n\n**Change:** ${d}\n\n\n`); }
    git("add", "-A");
    git("commit", "-qm", "fixture");
  };
  git("init", "-q", "-b", "main");
  git("config", "user.email", "fixture@example.test");
  git("config", "user.name", "Fixture");
  git("remote", "add", "origin", "https://github.com/example/fleet-tracker.git");
  write(mainDirs);
  if (branch) {
    git("checkout", "-qb", branch.name);
    write(branch.dirs);
    git("update-ref", `refs/remotes/origin/${branch.name}`, git("rev-parse", "HEAD"));
    git("checkout", "-q", "main");
  }
  return root;
}

function fakeAmax(answer: (args: Record<string, unknown>) => { status?: number; body: object }) {
  const calls: { url: string; headers: Record<string, string>; args: Record<string, unknown> }[] = [];
  const fetchImpl = (async (url: string, init: { headers: Record<string, string>; body: string }) => {
    const args = JSON.parse(init.body);
    calls.push({ url, headers: init.headers, args });
    const a = answer(args);
    return new Response(JSON.stringify(a.body), { status: a.status ?? 200 });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

const collect = (): Out & { out: object } => {
  const o: Out = { lines: [], notices: [], warnings: [], errors: [] };
  return { ...o, out: { line: (t: string) => o.lines.push(t), notice: (t: string) => o.notices.push(t), warn: (t: string) => o.warnings.push(t), error: (t: string) => o.errors.push(t) } };
};

beforeAll(async () => {
  ({ run } = await import(pathToFileURL(join(repoRoot, "scripts/specclaw-sync-ci.mjs")).href));
  ({ readSpecclaw } = await import(pathToFileURL(join(repoRoot, "plugins/amax/scripts/read-specclaw.mjs")).href));
});

describe("089 CI specclaw sync through sync_specclaw", () => {
  it("AC-1 posts to the REST tool with the bearer key and act-for header, the plugin reader's records, and no database secret", async () => {
    const root = repo(["101-export"]);
    const { calls, fetchImpl } = fakeAmax(() => ({ body: { result: ok() } }));
    expect(await run({ env: ENV, root, fetchImpl, out: collect().out })).toBe(0);
    expect(calls[0]).toMatchObject({ url: "https://amax.example/api/v1/tools/sync_specclaw", headers: { authorization: "Bearer key-123", "amax-act-for": ENV.AMAX_SYNC_ACT_FOR } });
    expect(calls[0].args).toMatchObject({ projectKey: "FLT", repoUrl: "github.com/example/fleet-tracker", ref: "main", dryRun: false });
    expect((calls[0].args.records as { dir: string }[]).map((r) => r.dir)).toEqual(readSpecclaw(root).map((r) => r.dir));
    expect(readFileSync(join(repoRoot, ".github/workflows/specclaw-sync.yml"), "utf8")).not.toMatch(/DATABASE_URL|AMAX_SYNC_TOKEN|AUDIT_HASH_KEY/);
  });

  it("AC-2 pushes main (whole, so it may withdraw) then each specclaw/* branch under its own ref; past 200 changes it batches and doesn't withdraw", async () => {
    const { calls, fetchImpl } = fakeAmax(() => ({ body: { result: ok() } }));
    await run({ env: ENV, root: repo(["101-export"], { name: "specclaw/102-import", dirs: ["101-export", "102-import"] }), fetchImpl, out: collect().out });
    expect(calls.map((c) => [c.args.ref, c.args.withdrawMissing])).toEqual([["main", true], ["specclaw/102-import", false]]);
    const big = fakeAmax(() => ({ body: { result: ok() } })), o = collect();
    await run({ env: ENV, root: repo(Array.from({ length: 201 }, (_, i) => `${String(i + 1).padStart(3, "0")}-c`)), fetchImpl: big.fetchImpl, out: o.out });
    expect(big.calls.map((c) => [(c.args.records as unknown[]).length, c.args.withdrawMissing])).toEqual([[200, false], [1, false]]);
    expect(o.warnings).toEqual([expect.stringMatching(/more than 200 changes, so withdrawal is skipped/)]);
  }, 30_000);

  it("AC-3 applies a push that needs a person, and prints every skip as a warning", async () => {
    const { calls, fetchImpl } = fakeAmax(() => ({ body: { result: ok({ needsReview: true, skipped: ["FLT-074: two changes numbered 074: 074-a, 074-b"] }) } }));
    const o = collect();
    expect(await run({ env: ENV, root: repo(["101-export"]), fetchImpl, out: o.out })).toBe(0);
    expect(calls.map((c) => c.args.dryRun)).toEqual([false]);
    expect(o.warnings).toEqual(["FLT-074: two changes numbered 074: 074-a, 074-b"]);
  });

  it("AC-4 without secrets it calls nothing and says what to add; a refusal or an HTTP error fails with the reason", async () => {
    const none = fakeAmax(() => ({ body: {} })), o = collect();
    expect(await run({ env: {}, root: repo(["101-export"]), fetchImpl: none.fetchImpl, out: o.out })).toBe(0);
    expect([none.calls.length, o.notices]).toEqual([0, [expect.stringMatching(/not set up, so nothing was synced\. Add AMAX_URL, AMAX_SYNC_API_KEY, AMAX_SYNC_ACT_FOR/)]]);
    const refused = collect();
    expect(await run({ env: ENV, root: repo(["101-export"]), fetchImpl: fakeAmax(() => ({ body: { result: ok({ outcome: "refused", reason: "repo not linked to FLT" }) } })).fetchImpl, out: refused.out })).toBe(1);
    expect(refused.errors).toEqual([expect.stringMatching(/refused: repo not linked to FLT/)]);
    const broken = collect();
    expect(await run({ env: ENV, root: repo(["101-export"]), fetchImpl: fakeAmax(() => ({ status: 403, body: { error: "forbidden", message: "not allowed to act for this person" } })).fetchImpl, out: broken.out })).toBe(1);
    expect(broken.errors).toEqual(["amax answered 403: not allowed to act for this person"]);
  });

  // 089 review round 1 (B3, B6): only "nothing set up" passes without syncing; half a setup, or a read of nothing, fails.
  it.each([
    ["only some secrets are set", { AMAX_URL: ENV.AMAX_URL }, ["101-export"], /only partly set up: AMAX_SYNC_API_KEY, AMAX_SYNC_ACT_FOR missing/],
    ["the key is set but empty", { ...ENV, AMAX_SYNC_API_KEY: "" }, ["101-export"], /only partly set up: AMAX_SYNC_API_KEY missing/],
    ["main has no specclaw changes", ENV, [], /read no specclaw changes on main: nothing was pushed/],
  ])("AC-4 fails without pushing when %s", async (_, env, dirs, error) => {
    const { calls, fetchImpl } = fakeAmax(() => ({ body: { result: ok() } })), o = collect();
    expect(await run({ env: env as Record<string, string>, root: repo(dirs as string[]), fetchImpl, out: o.out })).toBe(1);
    expect([calls.length, o.errors]).toEqual([0, [expect.stringMatching(error as RegExp)]]);
  });

  // 089 review round 2: a held withdrawal is confirmed by running the workflow by hand with its count; branches never carry it.
  it.each([
    ["the count is given", "5", 5],
    ["no count", "", undefined],
    ["not a number", "all", undefined],
  ])("AC-6 confirm_withdraw reaches main's push only: %s", async (_, given, expected) => {
    const { calls, fetchImpl } = fakeAmax(() => ({ body: { result: ok() } }));
    await run({ env: { ...ENV, AMAX_CONFIRM_WITHDRAW: given as string }, root: repo(["101-export"], { name: "specclaw/102-import", dirs: ["101-export", "102-import"] }), fetchImpl, out: collect().out });
    expect(calls.map((c) => [c.args.ref, c.args.confirmWithdraw])).toEqual([["main", expected], ["specclaw/102-import", undefined]]);
  });

  // 091 AC-1: a merged branch, or one whose change main has archived, still says "PR raised"; CI leaves it out.
  function branchedRepo() {
    const root = mkdtempSync(join(tmpdir(), "specclaw-ci-091-"));
    const git = (...a: string[]) => execFileSync("git", a, { cwd: root, encoding: "utf8" }).trim();
    const change = (dir: string, archived = false) => {
      const base = join(root, ".specclaw/changes", archived ? "archive" : "", dir);
      mkdirSync(base, { recursive: true });
      writeFileSync(join(base, "change.md"), `# ${dir}\n\n**Change:** ${dir}\n\n\n`);
    };
    const commit = () => { git("add", "-A"); git("commit", "-qm", "fixture"); };
    const remote = (name: string) => git("update-ref", `refs/remotes/origin/${name}`, git("rev-parse", "HEAD"));
    git("init", "-q", "-b", "main");
    git("config", "user.email", "fixture@example.test");
    git("config", "user.name", "Fixture");
    git("remote", "add", "origin", "https://github.com/example/fleet-tracker.git");
    mkdirSync(join(root, ".specclaw"), { recursive: true });
    writeFileSync(join(root, ".specclaw/config.yaml"), "amax:\n  project: FLT\n");
    change("101-base"); commit();
    git("checkout", "-qb", "specclaw/102-merged"); change("102-merged"); commit(); remote("specclaw/102-merged");
    git("checkout", "-q", "main"); git("merge", "-q", "--ff-only", "specclaw/102-merged");
    git("checkout", "-qb", "specclaw/103-archived"); change("103-archived"); commit(); remote("specclaw/103-archived");
    git("checkout", "-q", "main"); change("103-archived", true); commit();
    git("checkout", "-qb", "specclaw/104-open"); change("104-open"); commit(); remote("specclaw/104-open");
    git("checkout", "-q", "main");
    git("checkout", "-qb", "specclaw/101-reused"); change("101-reused"); commit(); remote("specclaw/101-reused");
    git("checkout", "-q", "main");
    // A squash merge: main gets the branch's folder in a commit of its own, so the branch isn't in main's history.
    git("checkout", "-qb", "specclaw/105-squashed"); change("105-squashed"); commit(); remote("specclaw/105-squashed");
    git("checkout", "-q", "main"); change("105-squashed"); commit();
    // ...and main edits the folder again before archiving it (a verify note): still merged.
    writeFileSync(join(root, ".specclaw/changes/105-squashed/change.md"), "# 105-squashed\n\n## Verify\n"); commit();
    // A branch named after no change folder (a typo): pushed, so amax flags it, never counted as merged.
    git("checkout", "-qb", "specclaw/106-typo"); change("106-typoo"); commit(); remote("specclaw/106-typo");
    git("checkout", "-q", "main");
    // 092 AC-4: a stacked PR brought main an older copy of 107 later; the branch has moved on, so it's still pushed.
    git("checkout", "-qb", "specclaw/107-stacked"); change("107-stacked"); commit(); writeFileSync(join(root, ".specclaw/changes/107-stacked/change.md"), "# 107 v2\n"); commit(); remote("specclaw/107-stacked");
    git("checkout", "-q", "main"); change("107-stacked"); commit();
    return root;
  }

  it("AC-1 pushes main and open branches only, and says what it left out", async () => {
    const { calls, fetchImpl } = fakeAmax(() => ({ body: { result: ok() } })), o = collect();
    expect(await run({ env: ENV, root: branchedRepo(), fetchImpl, out: o.out })).toBe(0);
    expect(calls.map((c) => c.args.ref)).toEqual(["main", "specclaw/104-open", "specclaw/106-typo", "specclaw/107-stacked"]);
    expect(o.lines).toContain("left out 3 merged or archived branches");
    expect(o.warnings).toContain("specclaw/101-reused: left out, its number is already used on the default branch by 101-base; renumber it");
  }, 30_000);
});
