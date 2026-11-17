import { describe, expect, it } from "vitest";
import { todayNote } from "../src/engine";

describe("085 the model is told the date", () => {
  it("AC-1 names today and its month, so this month is never guessed", () => {
    const note = todayNote(new Date("2026-11-06T09:00:00Z"));
    expect(note).toContain("Today is 2026-11-06 (November 2026)");
    expect(note).toContain('"This month" is that month');
    expect(note).toContain("Never work out the date from timesheets");
  });

  it("AC-1 uses UTC, so a late evening elsewhere doesn't move the month", () => {
    expect(todayNote(new Date("2026-12-31T23:30:00Z"))).toContain("(December 2026)");
    expect(todayNote(new Date("2027-01-01T00:10:00Z"))).toContain("(January 2027)");
  });
});
