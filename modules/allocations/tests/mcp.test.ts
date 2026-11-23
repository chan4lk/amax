import { describe, expect, it } from "vitest";
import { mcpTools } from "../mcp";

describe("allocations tools", () => {
  it("AC3 adds read-only tools under allocations:read and no new write tool", () => {
    const added = ["show_allocations", "get_bench", "get_over_allocation", "allocation_summary", "list_allocation_suggestions"];
    expect(mcpTools.find((t) => t.name === "suggest_fix")).toBeUndefined();
    expect(typeof mcpTools.find((t) => t.name === "allocate")?.propose).toBe("function");
    expect(typeof mcpTools.find((t) => t.name === "allocate_only")?.propose).toBe("function");
    for (const name of added) expect(mcpTools.find((t) => t.name === name)).toMatchObject({ scope: "read", readOnly: true, permission: "allocations:read" });
    expect(mcpTools.filter((t) => t.scope === "write").map((t) => t.name)).toEqual(["allocate", "allocate_only", "copy_allocations_to_next_month"]);
  });
});
