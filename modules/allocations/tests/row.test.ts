import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@amax/auth";

const grid = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("../server/grid", () => ({ gridFor: async () => grid.value }));
const { getAllocation } = await import("../server/row");

const person = (employeeNo: string, name: string) => ({ personId: employeeNo, employeeNo, name, initials: "", totals: [50], capacity: [100],
  lines: [{ projectId: "p-1", label: "Contoso Portal", manages: false, editable: true, percents: [50] }] });
const v = {} as Viewer;

// 057: get_allocation never answers with whichever namesake comes first.
describe("057 get_allocation resolves one person or refuses", () => {
  beforeEach(() => {
    grid.value = { months: [{ month: "2026-10", forecast: false }], hidden: 1, scope: "everyone",
      people: [person("LL-0001", "Nimal Silva"), person("LL-0002", "Nimal Silva"), person("LL-0003", "Kasun Dias")] };
  });

  it.each([
    ["an employee number", "LL-0002", "LL-0002"],
    ["a unique name", "Kasun Dias", "LL-0003"],
    ["a unique name, other case and spacing", " kasun dias ", "LL-0003"],
  ])("finds the person by %s", async (_n, who, no) => expect(await getAllocation(v, { person: who })).toMatchObject({ employeeNo: no }));

  it.each([["a shared name", "Nimal Silva"], ["a shared name, lower case", "nimal silva"], ["a shared name on a project row", "NIMAL SILVA"]])(
    "refuses %s and names the employee numbers", async (_n, who) => {
      await expect(getAllocation(v, { person: who, projectId: "p-1" })).rejects.toThrow(/more than one .*LL-0001, LL-0002.*employee number/);
    });

  it.each([["nobody by that name", "Tharushi"], ["a hidden person", "LL-0999"], ["a known person on a project they're not on", "LL-0003", "p-2"]])(
    "returns null for %s", async (_n, who, projectId?: string) => expect(await getAllocation(v, { person: who, projectId })).toBeNull());
});
