import { beforeAll, describe, expect, it } from "vitest";
import { canEverIn, setGrants, type Viewer } from "../src/index";

// 072 review round 1: the shared rule behind Time's approvesIn and notifications' approver routing. The role that
// grants the action must itself reach the entity; an unscoped role that doesn't grant it never lends its reach.
const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";
const v = (assignments: Viewer["assignments"]) => ({ assignments }) as unknown as Viewer;

describe("072 canEverIn: an action through an assignment that reaches the entity", () => {
  beforeAll(() => setGrants([{ grants: { PM: ["time:approve@managed"], Employee: ["time:log@own"] } } as never]));

  it.each([
    ["approver scoped to A, entity A", [{ role: "PM", legalEntityIds: [A], departments: null }], A, true],
    ["approver scoped to A, entity B", [{ role: "PM", legalEntityIds: [A], departments: null }], B, false],
    ["approver scoped to A plus unscoped Employee, entity B", [{ role: "PM", legalEntityIds: [A], departments: null }, { role: "Employee", legalEntityIds: null, departments: null }], B, false],
    ["unscoped approver, entity B", [{ role: "PM", legalEntityIds: null, departments: null }], B, true],
    ["approver scoped to A, no entity", [{ role: "PM", legalEntityIds: [A], departments: null }], null, false],
    ["unscoped approver, no entity", [{ role: "PM", legalEntityIds: null, departments: null }], null, true],
    ["Admin scoped to A, entity B", [{ role: "Admin", legalEntityIds: [A], departments: null }], B, false],
    ["Admin scoped to A, entity A", [{ role: "Admin", legalEntityIds: [A], departments: null }], A, true],
  ] as const)("%s", (_, assignments, entity, want) => {
    expect(canEverIn(v([...assignments] as Viewer["assignments"]), "time:approve", entity)).toBe(want);
  });
});
