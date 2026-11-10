import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { repoRoot } from "@amax/db/testdb";
import { readSpecclaw } from "../sync/specclaw";

describe("AC-1 specclaw parser", () => {
  const records = readSpecclaw(repoRoot);

  it("reads every change folder, archived and active", () => {
    expect(records.length).toBeGreaterThanOrEqual(39);
    const first = records.find((r) => r.number === "001")!;
    expect(first).toMatchObject({ phase: "released", approved: true, done: true, status: "done", acs: 7, tasksDone: 8, tasksTotal: 8 });
    expect(first.title).toMatch(/^Platform skeleton/);
    expect(records.find((r) => r.number === "039")).toMatchObject({ lane: "Delivery", hard: ["007", "002"], optional: ["004"] });
  });

  it("ready/blocked/claimed match scripts/queue/state.mjs on this repo", async () => {
    // The repo's own queue script is the reference (a tool, not a module import).
    const queue = await import(pathToFileURL(join(repoRoot, "scripts/queue/state.mjs")).href);
    const cwd = process.cwd();
    process.chdir(repoRoot);
    try {
      const expected = Object.fromEntries(queue.load().map((it: { id: string }) => [it.id, queue.describe(it)]));
      const ours = Object.fromEntries(records.filter((r) => r.number in expected).map((r) => [r.number, r.status === "blocked" ? `blocked on ${r.waiting.join(", ")}` : r.status === "claimed" ? `claimed by ${r.claim}` : r.status === "ready" ? "READY" : r.status]));
      expect(ours).toEqual(expected);
    } finally {
      process.chdir(cwd);
    }
  });
});

describe("change numbers past 999 (review rounds 6 and 7)", () => {
  it("are read in full and sorted as numbers", async () => {
    const { mkdirSync, mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const root = mkdtempSync(join(tmpdir(), "amax-num-"));
    for (const dir of ["1001-big", "999-last", "042-mid"]) {
      mkdirSync(join(root, ".specclaw/changes", dir), { recursive: true });
      writeFileSync(join(root, ".specclaw/changes", dir, "change.md"), `# ${dir}\n\n**Change:** ${dir}\n\n\n`);
    }
    expect(readSpecclaw(root).map((r) => r.number)).toEqual(["042", "999", "1001"]);
  });
});

describe("089 duplicate change numbers", () => {
  it("AC-8 keeps both folders of a shared number, each marked duplicate; an overlay of the same folder is the same change", async () => {
    const { mkdirSync, mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const repo = (dirs: Record<string, string>) => {
      const root = mkdtempSync(join(tmpdir(), "amax-dup-"));
      for (const [dir, tasks] of Object.entries(dirs)) {
        mkdirSync(join(root, ".specclaw/changes", dir), { recursive: true });
        writeFileSync(join(root, ".specclaw/changes", dir, "change.md"), `# ${dir}\n\n**Change:** ${dir}\n\n\n## Tasks\n${tasks}\n`);
      }
      return root;
    };
    const main = repo({ "074-invoice-export": "", "074-audit-filters": "", "076-late-fees": "" });
    const branch = repo({ "074-invoice-export": "- [x] `T1` — one", "076-late-fees": "- [x] `T1` — one" });
    const records = readSpecclaw(main, [{ dir: branch, ref: "specclaw/076-late-fees@51b9a07" }]);
    expect(records.map((r) => [r.dir, r.duplicate, r.phase])).toEqual([
      ["074-audit-filters", true, "proposed"], ["074-invoice-export", true, "building"], ["076-late-fees", false, "building"],
    ]);
  });
});
