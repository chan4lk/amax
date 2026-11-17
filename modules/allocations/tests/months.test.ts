import { describe, expect, it } from "vitest";
import { monthLabel } from "../server/months";

describe("090 month names", () => {
  it("AC-1 names a month the same as before, short and long, and the same answer twice", () => {
    expect(monthLabel("2026-11-01")).toBe("Nov");
    expect(monthLabel("2026-12-01", "long")).toBe("December");
    expect(monthLabel("2027-02-01", "long")).toBe("February");
    expect(monthLabel("2026-11-01")).toBe(monthLabel("2026-11-01"));
  });
});
