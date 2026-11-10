import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertSha, isSha } from "../sync/sha";
import { refOf } from "../sync/withdraw";

// 091 AC-3: one commit-sha rule for sync_specclaw, sync:specclaw and the ref comparison withdrawal relies on.
describe("091 commit sha", () => {
  it.each([
    ["a short sha", "4f2c9a1", true],
    ["a full sha", "1dba57e5619f449a4ec5cdf90c6f0c2b44716c51", true],
    ["too short", "3", false],
    ["not hex", "e2e-run", false],
    ["41 characters", "a".repeat(41), false],
  ])("AC-3 %s", (_, sha, ok) => {
    expect(isSha(sha)).toBe(ok);
    expect(refOf(`main@${sha}`)).toBe(ok ? "main" : `main@${sha}`);
    if (ok) expect(() => assertSha(sha, "--sha")).not.toThrow();
    else expect(() => assertSha(sha, "--sha")).toThrow(/--sha must be a commit sha \(7 to 40 hex characters\)/);
  });

  it("AC-3 sync:specclaw refuses a bad --sha before it opens the database", () => {
    const bin = join(__dirname, "../sync/bin.ts");
    const env = { ...process.env, DATABASE_URL: "postgres://nobody@127.0.0.1:1/none", AMAX_SYNC_TOKEN: "x", AUDIT_HASH_KEY: "k".repeat(32) };
    const r = spawnSync(process.execPath, ["--import", "tsx", bin, "--repo", ".", "--sha", "3"], { env, encoding: "utf8", cwd: join(__dirname, "..") });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/--sha must be a commit sha/);
    expect(r.stderr).not.toMatch(/ECONNREFUSED|connect/);
  }, 30_000);
});
