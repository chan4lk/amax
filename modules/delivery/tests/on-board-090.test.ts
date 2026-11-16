import { describe, expect, it } from "vitest";
import { onBoard } from "../sync/duplicates";

const rec = (dir: string, over: { duplicate?: boolean; unreadable?: boolean } = {}) =>
  ({ number: dir.slice(0, 3), dir, source: "main@4f2c9a1", unreadable: false, ...over });

// 090 review (B4): what the e2e board check expects is the self-sync's own rule, so the two can't drift apart.
describe("090 onBoard", () => {
  it.each([
    ["a readable change with its own number", [rec("101-a")], ["101-a"]],
    ["two folders sharing a number", [rec("074-a"), rec("074-b"), rec("101-a")], ["101-a"]],
    ["an unreadable state.json", [rec("101-a", { unreadable: true }), rec("102-b")], ["102-b"]],
    ["a number the client flagged as shared", [rec("075-a", { duplicate: true }), rec("102-b")], ["102-b"]],
  ])("AC-1 %s", (_, records, kept) => {
    expect(onBoard(records).map((r) => r.dir)).toEqual(kept);
  });
});
