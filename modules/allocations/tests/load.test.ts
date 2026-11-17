import { describe, expect, it } from "vitest";
import { loadSummary } from "../server/load-summary";
import { grid, points } from "./people";

describe("085 the bot's load numbers are worked out in code", () => {
  const rows = loadSummary(grid, points, "your three people");

  it("AC-13 capacity is the people's FTE, planned is their allocations added up, spare is the difference", () => {
    expect(rows[0]).toMatchObject({ people: 3, capacityFte: 3, plannedFte: 3.2, spareFte: -0.2, loadPercent: 107 });
    expect(rows[1]).toMatchObject({ plannedFte: 2, spareFte: 1 });
  });

  it("AC-13 a short month is said as FTE short, never as a percent, and starts with who it covers", () => {
    expect(rows[0].sentence).toBe("December 2026, your three people: 3.2 FTE planned of 3.0 FTE capacity, 0.2 FTE short (1 over 100%).");
    expect(rows[1].sentence).toBe("January 2027, your three people: 2.0 FTE planned of 3.0 FTE capacity, 1.0 FTE spare (1 not planned).");
  });

  it("AC-13 80% planned does not lower capacity: capacity stays at the HR FTE and the rest is spare", () => {
    const eighty = { ...grid, people: grid.people.map((p, k) => (k === 1 ? { ...p, totals: [80, 80, 80] } : p)) };
    const r = loadSummary(eighty, points, "x")[1];
    expect(r.capacityFte).toBe(3);
    expect(r.free).toContainEqual({ name: "Nimal Silva", freePercent: 20 });
  });

  it("AC-13 over-allocated and not-planned people are named, and the team figures come alongside", () => {
    expect(rows[0].over).toEqual([{ name: "Ayesha Rahman", total: 120, capacity: 100 }]);
    expect(rows[1].notPlanned).toEqual(["Kasun Dias"]);
    expect(rows[0].team).toEqual({ capacityFte: 100, demandFte: 90, spareFte: 10 });
  });
});
