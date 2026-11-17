import { describe, expect, it } from "vitest";
import { inWindow } from "../server/months";

describe("a month named without its year", () => {
  it("AC63 moves to its next occurrence inside the screen's window, and a month already inside stays", () => {
    const window = ["2026-11-01", "2026-12-01", "2027-01-01", "2027-02-01", "2027-03-01"];
    expect(inWindow("2026-02", window)).toBe("2027-02");
    expect(inWindow("2026-04", window)).toBe("2027-04");
    expect(inWindow("2026-12", window)).toBe("2026-12");
    expect(inWindow("2027-01", window)).toBe("2027-01");
    expect(inWindow("2026-02", [])).toBe("2026-02");
  });
});
