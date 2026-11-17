import { describe, expect, it } from "vitest";
import manifest from "../module";
import { EVENTS } from "../contracts";

describe("PM notifications", () => {
  it("AC41 tells the project's PM about over-capacity, someone else's change and a suggested fix, never their own change, with every field declared", () => {
    const rules = manifest.notifications ?? [];
    expect(rules.map((r) => [r.id, r.event, r.when, r.urgency ?? "normal"])).toEqual([
      ["allocations.over-capacity", EVENTS.allocationSet, { over: true }, "urgent"],
      ["allocations.changed", EVENTS.allocationSet, { over: false }, "normal"],
      ["allocations.fix-suggested", EVENTS.fixSuggested, undefined, "normal"],
    ]);
    for (const r of rules) {
      expect(r).toMatchObject({ to: [{ role: "PM" }], permission: "allocations:allocate", scope: { projectId: "projectId" } });
      const declared = manifest.events?.payloads?.[r.event] ?? {};
      for (const [, field] of `${r.title} ${r.body}`.matchAll(/\{(\w+)/g)) expect(declared[field as keyof typeof declared]).toBe("plain");
    }
    expect(rules.filter((r) => r.event === EVENTS.allocationSet).every((r) => r.except === "byUser")).toBe(true);
    expect(manifest.notificationClears).toEqual([{ id: "allocations.settled", event: EVENTS.monthSettled, rules: ["allocations.over-capacity", "allocations.fix-suggested"], match: ["personUserId", "month"] }]);
  });
});
