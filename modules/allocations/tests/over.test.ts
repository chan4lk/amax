import { describe, expect, it } from "vitest";
import type { Grid } from "../server/grid";
import { allOver, overLine } from "../server/over";

const line = (projectId: string, projectKey: string, percent: number) => ({ projectId, projectKey, label: projectKey, manages: false, editable: true, percents: [percent + 20, percent] });
const months = [{ month: "2026-10-01", forecast: false }, { month: "2026-12-01", forecast: false }];
const grid = { scope: "managed", hidden: 0, months, people: [{ personId: "k", employeeNo: "LL-0417", name: "Kasun Dias", initials: "KD", totals: [140, 120], capacity: [100, 100], lines: [line("f", "FLT", 80), line("c", "CON", 40)] }] } as Grid;

describe("over-allocated line", () => {
  it("AC23 finds the first over month after this one and the biggest project the viewer may change", () => {
    expect(overLine(grid, "Kasun", () => true)).toMatchObject({ found: true, month: "2026-12", projectKey: "FLT", percent: 80, trimTo: 60 });
    expect(overLine(grid, "Kasun", (id) => id === "c")).toMatchObject({ projectKey: "CON", trimTo: 20 });
    expect(overLine(grid, "Kasun", () => false)).toMatchObject({ found: false });
  });

  it("AC32 lists every over-allocated person with a fix, for 'fix everyone'", () => {
    const fine = { ...grid.people[0], personId: "a", employeeNo: "LL-0291", name: "Ayesha Rahman", totals: [100, 100] };
    const both = { ...grid, people: [...grid.people, fine] } as Grid;
    expect(allOver(both, () => true).map((o) => o.found && [o.person, o.projectKey, o.trimTo])).toEqual([["Kasun Dias", "FLT", 60]]);
  });
});
