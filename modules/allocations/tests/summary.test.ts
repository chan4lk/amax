import { describe, expect, it } from "vitest";
import { summaryOf } from "../server/summary";
import { grid, known, points } from "./people";

describe("allocations summary", () => {
  it("AC17 writes one paste-ready paragraph from the same numbers as the screen", () => {
    const out = summaryOf(grid, points, known);
    expect(out.text).toBe("Ayesha Rahman is over-allocated in December (120% of 100%). Kasun Dias has nothing planned in December, January, February. Zed Nobody has nothing planned in January, February. Demand stays within capacity. Most spare: 10 in December.");
    expect(out.over).toHaveLength(1);
    expect(summaryOf({ ...grid, people: [] }, [points[0]], new Map()).text).toBe("Nobody is over-allocated, and everyone has work planned. Demand stays within capacity. Most spare: 10 in December.");
  });
});
