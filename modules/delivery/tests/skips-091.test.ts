import { describe, expect, it } from "vitest";
import { groupSkips } from "../ui/skips";

const released = (n: number) => Array.from({ length: n }, (_, i) => `AMX-${String(i + 1).padStart(3, "0")}: released comes from Prod deployments`);

// 091 AC-5: the Repo sync card groups a push's skips by reason.
describe("091 groupSkips", () => {
  it.each([
    ["one reason, many keys", released(65), ["released comes from Prod deployments (65): AMX-001, AMX-002, AMX-003, AMX-004, AMX-005, +60 more"]],
    ["one reason, five keys", released(5), ["released comes from Prod deployments (5): AMX-001, AMX-002, AMX-003, AMX-004, AMX-005"]],
    ["two reasons keep their order", ["AMX-062: two changes numbered 062: 062-a, 062-b", "AMX-001: released comes from Prod deployments", "AMX-002: released comes from Prod deployments"],
      ["two changes numbered 062: 062-a, 062-b (1): AMX-062", "released comes from Prod deployments (2): AMX-001, AMX-002"]],
    ["a line naming a branch, not a key", ["specclaw/063-x: not the default branch (main) and no change is named 063-x"], ["not the default branch (main) and no change is named 063-x (1): specclaw/063-x"]],
    ["nothing skipped", [], []],
  ])("AC-5 %s", (_, lines, grouped) => {
    expect(groupSkips(lines as string[])).toEqual(grouped);
  });
});
