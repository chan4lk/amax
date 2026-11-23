import { describe, expect, it } from "vitest";
import { monthNote } from "../src/engine";

describe("085 the model is told the month", () => {
  it("AC-1 names this month from the user's day, so it is never guessed", () => {
    const note = monthNote("2026-11-06");
    expect(note).toContain('"This month" is November 2026');
    expect(note).toContain('"next month" the one after');
    expect(note).toContain("Never work out the date from timesheets");
  });

  it("AC-1 follows the day it is given, so a month edge never moves the month", () => {
    expect(monthNote("2026-12-31")).toContain("December 2026");
    expect(monthNote("2027-01-01")).toContain("January 2027");
  });
});
