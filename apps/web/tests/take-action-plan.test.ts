import { describe, expect, it } from "vitest";
import { NO_PLAN_NOTE, planNote, withUnplanned } from "../lib/take-action";

const grid = {
  months: [{ month: "2026-12-01" }, { month: "2027-01-01" }],
  people: [{ personId: "p1", lines: [{ label: "Contoso", percents: [50, 50] }, { label: "Fleet", percents: [null, 40] }] }],
};

describe("Take action says what it knows about the plan", () => {
  it.each([
    ["the read failed", null, "p1", "2026-12", [], NO_PLAN_NOTE],
    ["the person is not in the grid", grid, "p9", "2026-12", [], NO_PLAN_NOTE],
    ["the month is outside the window", grid, "p1", "2027-09", [], NO_PLAN_NOTE],
    ["no person or month is named", grid, undefined, undefined, [], NO_PLAN_NOTE],
    ["a project has nothing planned", grid, "p1", "2026-12", ["Fleet"], ""],
    ["everything is planned", grid, "p1", "2027-01", [], ""],
  ])("%s", (_name, g, person, month, unplanned, note) => {
    expect(planNote(g, person, month)).toEqual({ unplanned, note });
  });

  it("names the unplanned projects in the detail", () => {
    expect(withUnplanned("Ayesha is at 120%.", ["Fleet"])).toBe("Ayesha is at 120%. Fleet not planned.");
  });
});
