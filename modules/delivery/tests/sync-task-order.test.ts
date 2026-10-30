import { describe, expect, it } from "vitest";
import { fingerprint, type Task } from "../sync/import";

const task = (ref: string): Task => ({ ref, title: `task ${ref}`, done: false });
const row = (refs: string[]) => ({ title: "t", phase: "building", tasksDone: 0, tasksTotal: refs.length, tasks: refs.map(task), meta: { source: "main@abc1234" } });
const stored = (refs: string[]) => [...refs].sort((a, b) => a.length - b.length || a.localeCompare(b));

describe("079 AC-1 task order is not a change", () => {
  it.each([
    ["T26 before T25", ["T24", "T26", "T25", "T27"]],
    ["T10 before T9", ["T1", "T10", "T9"]],
    ["reversed", ["T3", "T2", "T1"]],
    ["already sorted", ["T1", "T2", "T10"]],
  ])("%s: the repo's order fingerprints the same as storage's", (_, refs) => {
    expect(fingerprint(row(refs))).toBe(fingerprint(row(stored(refs))));
  });

  it("a different task set is still a change", () => {
    expect(fingerprint(row(["T1", "T2"]))).not.toBe(fingerprint(row(["T1", "T3"])));
  });
});
