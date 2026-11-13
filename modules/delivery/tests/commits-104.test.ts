import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { authorsOf } from "../sync/authors";
import { commitsOf, foldsCommits } from "../sync/commits";
import { SpecRecordInput } from "../server/push";

function repo() {
  const root = mkdtempSync(join(tmpdir(), "amax-commits-"));
  const git = (...a: string[]) => execFileSync("git", a, { cwd: root, encoding: "utf8" }).trim();
  git("init", "-q", "-b", "main");
  const commit = (who: string, msg: string, at: string) => {
    git("add", "-A");
    git("-c", `user.email=${who}`, "-c", "user.name=Fixture", "commit", "-q", "--allow-empty", "-m", msg, "--date", at);
    return git("rev-parse", "HEAD");
  };
  mkdirSync(join(root, ".specclaw/changes/101-export"), { recursive: true });
  writeFileSync(join(root, ".specclaw/changes/101-export/change.md"), "# 101\n");
  const a = commit("kasun@example.test", "specclaw(101-export): propose: export", "2026-11-12T09:00:00+05:30");
  const b = commit("kasun@example.test", "[specclaw] 101-export build T1\n\nmentions another change in the body only", "2026-11-12T10:30:00+05:30");
  commit("kasun@example.test", "chore: unrelated, mentions specclaw(101-export) in the body\n\nspecclaw(101-export): not the subject", "2026-11-12T11:00:00+05:30");
  commit("ayesha@example.test", "specclaw(101-exporter): another change whose name starts the same", "2026-11-12T11:30:00+05:30");
  git("checkout", "-qb", "side"); writeFileSync(join(root, "side.txt"), "x\n"); commit("ayesha@example.test", "specclaw(101-export): side work", "2026-11-12T12:00:00+05:30");
  const side = git("rev-parse", "HEAD");
  git("checkout", "-q", "main");
  git("-c", "user.email=kasun@example.test", "-c", "user.name=Fixture", "merge", "-q", "--no-ff", "-m", "specclaw(101-export): merge side", "side");
  // Review round 1: a squash merge lists the folded subjects in its body (GitHub's form), and a hand-written one may
  // join several on one line; neither is work of its own.
  commit("kasun@example.test", "specclaw(101-export): export (#120)\n\n* specclaw(101-export): propose: export\n* [specclaw] 101-export build T1", "2026-11-14T09:00:00+05:30");
  commit("kasun@example.test", "specclaw(101-export): T1: one specclaw(101-export): T2: two", "2026-11-14T09:30:00+05:30");
  return { root, sha: git("rev-parse", "HEAD"), a, b, side };
}

// 104 AC-2: the reader sends each change's commits: those whose subject names it, merges left out; an older payload
// without them still parses.
describe("104 AC-2 the commits named for a change", () => {
  it("AC-2 lists id, author email and time of the commits whose subject names the change, newest first, no merges; a record without them still parses", () => {
    const { root, sha, a, b, side } = repo();
    const [r] = authorsOf(root, sha, [{ dir: "101-export", phase: "building" }]);
    expect(r.commits).toEqual([
      { id: side, email: "ayesha@example.test", at: "2026-11-12T06:30:00.000Z" },
      { id: b, email: "kasun@example.test", at: "2026-11-12T05:00:00.000Z" },
      { id: a, email: "kasun@example.test", at: "2026-11-12T03:30:00.000Z" },
    ]);
    const base = { number: "101", dir: "101-export", title: "Export", lane: "", module: "", phase: "building", approved: true, claim: null, hard: [], optional: [], tasksDone: 0, tasksTotal: 1,
      tasks: [], acs: 1, pr: null, verdict: null, done: false, status: "ready", waiting: [], updatedAt: null, releasedAt: null, source: `main@${sha}`, unreadable: false };
    expect(SpecRecordInput.parse(base).commits).toBeUndefined();
    expect(SpecRecordInput.parse({ ...base, commits: r.commits }).commits).toHaveLength(3);
    expect(SpecRecordInput.safeParse({ ...base, commits: [{ id: "not-a-sha", email: "x@y.test", at: "2026-11-12T05:00:00Z" }] }).success).toBe(false);
  });

  // Review round 1: a commit that folds others isn't counted, and a read git couldn't make says so (no `commits`).
  it.each([
    ["GitHub's squash body", "specclaw(101-export): export (#120)\n\n* specclaw(101-export): propose\n* specclaw(101-export): T1", true],
    ["several subjects joined on one line", "specclaw(101-export): T1 specclaw(101-export): T2", true],
    ["[specclaw] and specclaw() forms mixed", "[specclaw] 101-export T1\n\nspecclaw(101-export): T2", true],
    ["one subject, another change named in the body", "specclaw(101-export): T1\n\nsee specclaw(102-other)", true],
    ["one subject, no other", "specclaw(101-export): T1\n\nwhy it changed", false],
  ])("review-1 foldsCommits: %s", (_, message, folds) => {
    expect(foldsCommits(message)).toBe(folds);
  });

  it("review-1 a repo git can't read sends no commits, rather than none", () => {
    const root = mkdtempSync(join(tmpdir(), "amax-nogit-"));
    expect(commitsOf(root, "HEAD", "101-export")).toBeUndefined();
  });
});
