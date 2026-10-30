import { describe, expect, it } from "vitest";
import { weekPill } from "../week";

// 075 amendment 1: the pill beside the title says which week this is and how far it is from now.
const today = new Date("2026-10-25T10:00:00Z"); // Sunday of 2026-W43

describe("075 week pill", () => {
  it.each([
    [{ year: 2026, week: 43 }, { name: "Week 43", when: "This week", now: true }],
    [{ year: 2026, week: 42 }, { name: "Week 42", when: "Last week", now: false }],
    [{ year: 2026, week: 44 }, { name: "Week 44", when: "Next week", now: false }],
    [{ year: 2026, week: 40 }, { name: "Week 40", when: "3 weeks ago", now: false }],
    [{ year: 2026, week: 46 }, { name: "Week 46", when: "In 3 weeks", now: false }],
    [{ year: 2025, week: 52 }, { name: "Week 52, 2025", when: "43 weeks ago", now: false }],
  ])("AC9 %o", (week, want) => expect(weekPill(week, today)).toEqual(want));
});
