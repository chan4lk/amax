import { beforeAll, describe, expect, it } from "vitest";
import { setGrants, type Viewer } from "@amax/auth";
import manifest from "../module";
import { chainFor } from "../server/chain";

// 071 review round 1: a manager reaches a report's week only through an assignment that both grants time:approve
// and covers the report's legal entity; an unscoped base role must not lend its reach to a scoped approver role.
const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";
const REPORT = "cccccccc-0000-4000-8000-000000000003";
const viewer = (assignments: Viewer["assignments"]) =>
  ({ userId: "dddddddd-0000-4000-8000-000000000004", tenantId: "t", assignments, actualRoles: assignments.map((a) => a.role), reports: [REPORT], managedProjects: [], assignedProjects: [] }) as unknown as Viewer;

describe("071 a manager's approval reach follows the approving role's entity", () => {
  beforeAll(() => setGrants([manifest]));

  it.each([
    ["approver in A, report in A", [{ role: "PM", legalEntityIds: [A], departments: null }], A, "manager"],
    ["approver in A plus an unscoped Employee role, report in B", [{ role: "PM", legalEntityIds: [A], departments: null }, { role: "Employee", legalEntityIds: null, departments: null }], B, null],
    ["approver in A, report with no entity", [{ role: "PM", legalEntityIds: [A], departments: null }, { role: "Employee", legalEntityIds: null, departments: null }], null, null],
    ["unscoped approver, report in B", [{ role: "PM", legalEntityIds: null, departments: null }], B, "manager"],
    ["only an unscoped Employee role, report in B", [{ role: "Employee", legalEntityIds: null, departments: null }], B, null],
  ] as const)("%s", (_, assignments, entity, want) => {
    expect(chainFor(viewer([...assignments] as Viewer["assignments"]), REPORT, [], entity)).toBe(want);
  });
});
