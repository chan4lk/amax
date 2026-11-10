import { describe, expect, it } from "vitest";
import { hasModule, provided, setInstalledModules, setProvided, slotsSet } from "../src/installed";

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

// 081 review round 1: a module fills another module's slot; a slot no installed module fills is empty.
describe("081 provided slots", () => {
  const time = { id: "time", provides: { "delivery.proposal-time": "time's lines" } };
  const other = { id: "other", provides: { "delivery.proposal-time": "other's lines", "x.slot": 1 } };
  it.each([
    ["nothing set", null, []],
    ["one provider", [time], ["time's lines"]],
    ["two providers, in module order", [time, other], ["time's lines", "other's lines"]],
    ["the provider switched off", [{ id: "leave" }], []],
  ] as const)("%s", (_, modules, want) => {
    if (modules) setProvided(modules);
    expect(provided("delivery.proposal-time")).toEqual(want);
    // 087 AC-8: "never set" reads apart from "nobody fills it".
    expect(slotsSet()).toBe(modules !== null);
  });
});
