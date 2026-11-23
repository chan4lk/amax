import { describe, expect, it } from "vitest";
import { fixFor } from "../server/fix";
import { grid, known, points } from "./people";

const skills = new Map([["a", ".NET"], ["k", ".NET"]]);

describe("allocations fix", () => {
  it("AC13 moves the extra from an over-allocated person to someone free, and the reverse for someone unplanned", () => {
    const over = fixFor(grid, points, known, skills, "ayesha");
    expect(over).toMatchObject({ found: true, moves: [{ person: "Ayesha Rahman", project: "HR Insights", month: "2026-12-01", from: 50, to: 30 }, { person: "Kasun Dias", from: 0, to: 20 }] });
    const free = fixFor(grid, points, known, skills, "kasun");
    expect(free).toMatchObject({ found: false });
    expect(fixFor(grid, points, known, skills, "nobody")).toMatchObject({ found: false });
    expect(fixFor(grid, points, known, skills, "nimal")).toMatchObject({ found: false });
  });
});
