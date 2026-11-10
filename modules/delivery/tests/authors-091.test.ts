import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { authorsOf, isShallow, ownerEmailOf } from "../sync/authors";

function repo() {
  const root = mkdtempSync(join(tmpdir(), "amax-authors-"));
  const git = (...a: string[]) => execFileSync("git", a, { cwd: root, encoding: "utf8" }).trim();
  git("init", "-q", "-b", "main");
  const commit = (who: string, msg: string) => { git("add", "-A"); git("-c", `user.email=${who}`, "-c", "user.name=Fixture", "commit", "-qm", msg); };
  const change = (dir: string) => { mkdirSync(join(root, ".specclaw/changes", dir), { recursive: true }); writeFileSync(join(root, ".specclaw/changes", dir, "change.md"), `# ${dir}\n`); };
  change("101-open"); commit("first@example.test", "add 101");
  change("102-done"); commit("second@example.test", "add 102");
  writeFileSync(join(root, ".specclaw/changes/101-open/change.md"), "# 101 edited\n"); commit("editor@example.test", "edit 101");
  mkdirSync(join(root, ".specclaw/changes/archive"), { recursive: true });
  renameSync(join(root, ".specclaw/changes/102-done"), join(root, ".specclaw/changes/archive/102-done")); commit("archiver@example.test", "archive 102");
  return { root, sha: git("rev-parse", "HEAD") };
}

// 091 AC-7 and review round 1: the author is who added the change, read the same way by the plugin, CI and the
// self-sync; when it can't be read it's unknown (undefined), never "nobody" (null).
describe("091 authorsOf", () => {
  it.each([
    ["the author of an open change, not a later editor", { dir: "101-open", phase: "planned" }, "first@example.test"],
    ["the author of an archived change, across the move", { dir: "102-done", phase: "released" }, "second@example.test"],
    ["a folder git has never seen", { dir: "199-missing", phase: "planned" }, undefined],
  ])("AC-7 %s", (_, record, author) => {
    const { root, sha } = repo();
    expect(authorsOf(root, sha, [record])[0].author).toBe(author);
  });

  // 091 review round 2: a folder in the working tree but not committed at the sha read is unknown, not "nobody".
  it("AC-7 an uncommitted folder is unknown, so it can't clear an owner", () => {
    const { root, sha } = repo();
    mkdirSync(join(root, ".specclaw/changes/103-draft"), { recursive: true });
    writeFileSync(join(root, ".specclaw/changes/103-draft/change.md"), "# 103\n");
    expect(authorsOf(root, sha, [{ dir: "103-draft", phase: "proposed" }])[0].author).toBeUndefined();
  });

  // 092 AC-3: a file in the tree whose add git can't find (here it came in with a merge commit, which git log's
  // --diff-filter=A doesn't show) is unknown, so the stored owner stays; it isn't "nobody". That a push keeps the stored
  // owner for an unknown author is owner-091's "an author git couldn't read keeps the stored owner".
  it("AC-3 a change that arrived inside a merge commit has an unknown author, not nobody", () => {
    const { root } = repo();
    const git = (...a: string[]) => execFileSync("git", a, { cwd: root, encoding: "utf8" }).trim();
    const id = ["-c", "user.email=merger@example.test", "-c", "user.name=Fixture"];
    git("checkout", "-qb", "side"); writeFileSync(join(root, "side.txt"), "side\n"); git("add", "-A"); git(...id, "commit", "-qm", "side");
    git("checkout", "-q", "main"); git(...id, "merge", "-q", "--no-ff", "--no-commit", "side");
    mkdirSync(join(root, ".specclaw/changes/104-in-merge"), { recursive: true });
    writeFileSync(join(root, ".specclaw/changes/104-in-merge/change.md"), "# 104\n"); git("add", "-A"); git(...id, "commit", "-qm", "merge side");
    expect(authorsOf(root, git("rev-parse", "HEAD"), [{ dir: "104-in-merge", phase: "planned" }])[0].author).toBeUndefined();
  });

  it("AC-7 a shallow clone can't tell who added a change, so every author is unknown", () => {
    const { root } = repo();
    const shallow = mkdtempSync(join(tmpdir(), "amax-shallow-"));
    execFileSync("git", ["clone", "-q", "--depth", "1", pathToFileURL(root).href, shallow]);
    expect(isShallow(shallow)).toBe(true);
    const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: shallow, encoding: "utf8" }).trim();
    expect(authorsOf(shallow, sha, [{ dir: "101-open", phase: "planned" }])[0].author).toBeUndefined();
  }, 30_000);

  it.each([
    ["the Owner line wins", { owner: "lead@example.test", author: "first@example.test" }, "lead@example.test"],
    ["else the author", { owner: null, author: "first@example.test" }, "first@example.test"],
    ["the repo names nobody", { owner: null, author: null }, null],
    ["the author is unknown", { owner: null, author: undefined }, undefined],
  ])("AC-7 ownerEmailOf: %s", (_, r, email) => {
    expect(ownerEmailOf(r)).toBe(email);
  });
});
