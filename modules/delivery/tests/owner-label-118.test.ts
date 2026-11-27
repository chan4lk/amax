import { describe, expect, it } from "vitest";
import { attention } from "../server/attention";
import type { ProposalRow } from "../server/queries";
import { needsOwner, ownerLabel } from "../server/readiness";

const row = (id: string, phase: string, withdrawn: boolean, owner: string | null) =>
  ({ id, phase, withdrawn, ownerName: owner, ownerUserId: null, hours: 0, estimateHours: null, tasksDone: 0, tasksTotal: 0 }) as unknown as ProposalRow;

// 118: "Unassigned" means an open proposal needs an owner; a released or withdrawn one with none is "Not recorded".
describe("118 the owner label and the Unassigned count agree", () => {
  it.each([
    ["proposed, no owner", "proposed", false, null, "Unassigned", true],
    ["verified, no owner", "verified", false, null, "Unassigned", true],
    ["released, no owner", "released", false, null, "Not recorded", false],
    ["withdrawn, no owner", "proposed", true, null, "Not recorded", false],
    ["proposed, owned", "proposed", false, "Kasun Dias", "Kasun Dias", false],
    ["released, owned", "released", false, "Kasun Dias", "Kasun Dias", false],
  ])("AC1 AC2 %s", (_n, phase, withdrawn, owner, label, needs) => {
    const p = row("p", phase, withdrawn, owner);
    expect([ownerLabel(p), needsOwner(p)]).toEqual([label, needs]);
  });

  it("AC3 AMX's mix: 3 proposed and 5 verified count, 64 released don't, and every counted row reads Unassigned", () => {
    const rows = [
      ...Array.from({ length: 3 }, (_, i) => row(`p${i}`, "proposed", false, null)),
      ...Array.from({ length: 5 }, (_, i) => row(`v${i}`, "verified", false, null)),
      ...Array.from({ length: 64 }, (_, i) => row(`r${i}`, "released", false, null)),
    ];
    const { counts, needs } = attention(rows, new Set());
    const counted = rows.filter((p) => needs.get(p.id)!.includes("unassigned"));
    expect([counts.unassigned, counted.every((p) => ownerLabel(p) === "Unassigned"), rows.filter((p) => ownerLabel(p) === "Unassigned").length]).toEqual([8, true, 8]);
  });
});
