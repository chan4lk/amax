import { describe, expect, it } from "vitest";
import { hasModule, setInstalledModules } from "../src/installed";

// 072 review round 3: the deployment's module list decides; before it's set, the caller's table check does.
describe("072 hasModule", () => {
  it.each([
    ["unset list, tables there", null, true, true],
    ["unset list, no tables", null, false, false],
    ["installed, tables there", ["time", "leave"], true, true],
    ["switched off though its tables remain", ["time"], true, false],
    ["listed but its tables are missing", ["time", "leave"], false, false],
  ] as const)("%s", (_, list, tables, want) => {
    if (list) setInstalledModules(list);
    expect(hasModule("leave", tables)).toBe(want);
  });
});
