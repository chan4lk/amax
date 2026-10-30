import { describe, expect, it } from "vitest";
import { bandOf, myBandOf } from "../ui/band";

// 075: Team time's status band, from a week's rows and the people with no timesheet.
const row = (status: "draft" | "submitted" | "approved" | "rejected", total: number, agentHours: number) => ({ status, total, agentHours });

describe("075 status band", () => {
  it("AC7 counts everyone by status, in the band's order, and splits the hours between agents and people", () => {
    const b = bandOf([row("approved", 31.5, 20), row("submitted", 32.5, 30), row("submitted", 23.5, 10), row("draft", 29, 20.2), row("rejected", 21, 10)], 1);
    expect({ everyone: b.everyone, sent: b.sent, hours: b.hours, agent: b.agent, people: b.people, agentPct: b.agentPct, peoplePct: b.peoplePct }).toEqual(
      { everyone: 6, sent: 3, hours: 137.5, agent: 90.2, people: 47.3, agentPct: 66, peoplePct: 34 });
    expect(b.segments.map((s) => [s.label, s.count, s.filter])).toEqual([
      ["approved", 1, "approved"], ["submitted", 2, "submitted"], ["sent back", 1, "rejected"], ["draft", 1, "not_submitted"], ["not started", 1, "not_submitted"]]);
    expect(bandOf([], 0)).toMatchObject({ everyone: 0, hours: 0, agentPct: 0, peoplePct: 0, segments: [] });
    expect(bandOf([row("draft", 0, 0)], 0)).toMatchObject({ everyone: 1, sent: 0, hours: 0, peoplePct: 0, segments: [{ label: "draft", count: 1 }] });
  });

  it("AC10 My timesheet's band: hours against the target, and agents against the person", () => {
    expect(myBandOf({ total: 24.9, agentHours: 19.2, target: 40 })).toEqual({ hours: 24.9, target: 40, pct: 62, agent: 19.2, mine: 5.7, agentPct: 77, minePct: 23 });
    expect(myBandOf({ total: 0, agentHours: 0, target: 24 })).toMatchObject({ hours: 0, pct: 0, agentPct: 0, minePct: 0 });
    expect(myBandOf({ total: 47, agentHours: 0, target: 40 })).toMatchObject({ pct: 118, agentPct: 0, minePct: 100 });
  });
});
