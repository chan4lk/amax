import { describe, expect, it } from "vitest";
import { addAllNote, summaryLine } from "../src/addall";

describe("add all", () => {
  it("AC24 says how many were added and how many were left open", () => {
    expect(addAllNote(["done", "done", "done"], "done")).toBe("3 added.");
    expect(addAllNote(["done", "error", "done"], "done")).toBe("2 added, 1 didn't go through. They are still above.");
    expect(addAllNote(["cancelled", "cancelled"], "cancelled")).toBe("2 cancelled.");
  });

  it("AC25 sums up a card in one short line, with the month in words", () => {
    expect(summaryLine({ person: "Kasun Dias", projectKey: "CON", month: "2026-12", percent: 60 })).toBe("Kasun Dias on CON, Dec 2026: 60%");
    expect(summaryLine({ person: "Kasun Dias", projectKey: "CON", month: "2026-12", through: "2027-01", percent: 30 })).toBe("Kasun Dias on CON, Dec 2026 to Jan 2027: 30%");
    expect(summaryLine({ from: "2026-12", team: "Delivery team" })).toBe("Copy Dec 2026 into Jan 2027, Delivery team");
    expect(summaryLine({ from: "2026-11", team: "Delivery team" }, "Copy a month's allocations")).toBe("Copy Nov 2026 into Dec 2026, Delivery team");
  });
});
