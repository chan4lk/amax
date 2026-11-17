import { describe, expect, it } from "vitest";
import { benchMonths } from "../server/bench";
import { known, months, points } from "./people";

describe("allocations bench", () => {
  it("AC12 lists each person with every month they are on the bench, and only people on it in all the months asked for", () => {
    const some = benchMonths(points, known, [], false).map((p) => [p.name, p.months.length]);
    expect(some).toEqual([["Kasun Dias", 3], ["Zed Nobody", 2]]);
    const both = benchMonths(points, known, ["2026-12", "2027-02"], true).map((p) => p.name);
    expect(both).toEqual(["Kasun Dias"]);
    expect(benchMonths(points, known, ["2027-01"], true).map((p) => p.months)).toEqual([[months[1]], [months[1]]]);
  });
});
