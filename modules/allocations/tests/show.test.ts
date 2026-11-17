import { describe, expect, it } from "vitest";
import { viewFor } from "../server/route";
import { showLine, showOf, showPath } from "../server/show";

describe("allocations show", () => {
  it("AC3 turns settings into a shareable path and a one-line description, and reads them back safely", () => {
    const show = showOf({ view: "everyone", q: "  Amal ", filter: "over", bench: "2027-03-01" });
    expect(showPath(show)).toBe("/allocations?view=everyone&filter=over&q=Amal&bench=2027-03-01");
    expect(showLine(show)).toBe("Showing people starting with Amal and over-allocated people and the bench in March in Everyone");
    expect(showPath(showOf({ filter: "nonsense", bench: "March" }))).toBe("/allocations");
    expect(showLine(showOf({}))).toBe("");
  });

  it("AC5 prefers My projects, falls back to Everyone, and stays put when nobody matches", () => {
    const mine = ["Ayesha Rahman"], all = [...mine, "Amal Perera", "Kasun Dias"];
    expect(viewFor("a", mine, all, true)).toBe(false);
    expect(viewFor("kas", mine, all, false)).toBe(true);
    expect(viewFor("zzz", mine, all, true)).toBe(true);
    expect(viewFor("", mine, all, false)).toBe(false);
  });
});
