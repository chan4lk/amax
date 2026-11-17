import { describe, expect, it } from "vitest";
import { briefingOf } from "../server/briefing";

const calm = {
  monthName: "October", target: 80, utilisation: 84,
  capacity: { state: "ok" as const, months: [{ month: "2026-12-01", label: "Dec", capacity: 142, demand: 140, over: 0 }] },
  allocation: { state: "ok" as const, months: [{ month: "2026-12-01", label: "December", over: [], bench: 0, skills: "" }] },
  hours: { state: "ok" as const, limit: 20, rows: [{ projectId: "p", name: "Fleet Tracker", planned: 100, logged: 98, drift: -2, flag: null }] },
};

describe("briefing", () => {
  it("AC2 says what is red in plain words, and AC14 says plainly when nothing is", () => {
    expect(briefingOf(calm)).toBe("October is on track: utilisation is 84% against an 80% target. Nothing needs attention.");
    const trouble = {
      ...calm,
      capacity: { ...calm.capacity, months: [{ ...calm.capacity.months[0], demand: 143, over: 1 }] },
      allocation: { ...calm.allocation, months: [{ ...calm.allocation.months[0], over: [{ name: "Ayesha Rahman", percent: 120 }] }] },
      hours: { ...calm.hours, rows: [{ ...calm.hours.rows[0], drift: -30, flag: "behind" as const }] },
    };
    expect(briefingOf(trouble)).toBe("October is on track: utilisation is 84% against an 80% target. December has demand 1 FTE over capacity; Ayesha Rahman is over-allocated in December; Fleet Tracker has logged 30% behind its plan.");
  });
});
