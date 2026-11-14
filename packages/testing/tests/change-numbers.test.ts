import { readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type Check = (base: string[], head: string[], mergeBase?: string[]) => { failures: string[]; known: string[] };

describe("089 change numbers", () => {
  it("AC-10 fails a PR's new folder that reuses a base or PR number; base pairs and archived moves pass", async () => {
    const { check } = (await import(pathToFileURL(join(__dirname, "../../../scripts/check-change-numbers.mjs")).href)) as { check: Check };
    const base = ["073-time", "074-dev-demo-data", "074-fork-pr-review-gate", "088-quiet-hours"];
    expect(check(base, [...base, "089-sync"])).toEqual({ failures: [], known: ["074: 074-dev-demo-data, 074-fork-pr-review-gate (already on the base branch)"] });
    expect(check(base, [...base, "088-agent-draft"]).failures).toEqual([expect.stringMatching(/^088-agent-draft: number 088 is already used by 088-quiet-hours/)]);
    expect(check(base, [...base, "090-a", "090-b"]).failures).toHaveLength(2);
    expect(check(base, ["073-time", "074-dev-demo-data", "074-fork-pr-review-gate", "088-quiet-hours"]).failures).toEqual([]);
  });

  // 089 review rounds 1 and 2 (B1): the PR branch was cut before main gained a folder, so that folder's number is still
  // taken; a folder the PR itself renamed or removed (in the merge base, gone from the PR) gives its number up.
  it.each([
    ["main gained 089 after the branch was cut", ["088-a", "089-main-only"], ["088-a", "089-mine"], ["088-a"], ["089-mine: number 089 is already used by 089-main-only"]],
    ["main gained 089 and 090; the PR adds 090", ["088-a", "089-x", "090-y"], ["088-a", "090-mine"], ["088-a"], ["090-mine: number 090 is already used by 090-y"]],
    ["main moved on with other numbers", ["088-a", "091-z"], ["088-a", "089-mine"], ["088-a"], []],
    ["the PR renames its own folder", ["088-a", "089-old-name"], ["088-a", "089-new-name"], ["088-a", "089-old-name"], []],
    ["the PR removes a folder and reuses its number", ["088-a", "089-dropped"], ["088-a", "089-reused"], ["088-a", "089-dropped"], []],
    // 089 final pass: what main did after the branch was cut is main's own, never the PR's.
    ["main renumbered a pair after the branch was cut", ["074-a", "090-b"], ["074-a", "074-b", "089-mine"], ["074-a", "074-b"], []],
    ["main removed a folder after the branch was cut", ["074-a"], ["074-a", "075-gone", "089-mine"], ["074-a", "075-gone"], []],
    ["main renamed a folder and the PR reuses the old number", ["088-a", "089-renamed"], ["088-a", "089-old", "089-mine"], ["088-a", "089-old"], ["089-mine: number 089 is already used by 089-renamed"]],
    ["a pair on main, untouched, while the PR adds elsewhere", ["074-a", "074-b"], ["074-a", "074-b", "089-mine"], ["074-a", "074-b"], []],
  ])("AC-10 %s", async (_, base, head, mergeBase, failures) => {
    const { check } = (await import(pathToFileURL(join(__dirname, "../../../scripts/check-change-numbers.mjs")).href)) as { check: Check };
    expect(check(base as string[], head as string[], mergeBase as string[]).failures.map((f) => f.replace(/; renumber.*$/, ""))).toEqual(failures);
  });
});

describe("098 change numbers", () => {
  it("AC-1 no two change folders, active or archived, share a number", () => {
    const root = join(__dirname, "../../../.specclaw/changes");
    const folders = [...readdirSync(root), ...readdirSync(join(root, "archive"))].filter((d) => /^\d{3,}-/.test(d));
    const byNumber = folders.reduce((m, d) => m.set(d.match(/^\d+/)![0], [...(m.get(d.match(/^\d+/)![0]) ?? []), d]), new Map<string, string[]>());
    expect([...byNumber.values()].filter((ds) => ds.length > 1)).toEqual([]);
  });
});
