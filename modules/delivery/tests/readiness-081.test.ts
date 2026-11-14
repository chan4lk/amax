import { describe, expect, it } from "vitest";
import { needsOf } from "../server/attention";
import type { ProposalRow } from "../server/queries";
import { isReadyToVerify, isWithdrawn, overEstimate } from "../server/readiness";

// Review 081 round 1 (B4): "ready to verify" and "over the estimate" are one rule each. The list (needsOf), the agent's
// suggestion and the Overview panel all ask readiness.ts, so a spec proposal is never shown as ready when the agent
// won't suggest it and move_proposal refuses it.
const row = (over: Partial<ProposalRow>): ProposalRow => ({
  id: "p1", key: "CON-1", title: "Fictional", phase: "building", tasksDone: 3, tasksTotal: 3, hours: 0, estimateHours: null, waitingHours: 0, ownerName: "Maya", ownerUserId: "u1",
  description: null, withdrawn: false, agent: null, projectKey: "CON", projectName: "Contoso", projectColor: "#000", release: null, shippedTo: null, shippedStatus: null, inProd: false,
  source: null, meta: {}, createdAt: null, updatedAt: null, ...over,
});

describe("081 review round 1: one readiness rule", () => {
  it.each([
    ["a hand-made proposal in Building with every task done", {}, true],
    ["a spec proposal in Building with every task done", { source: "specclaw" }, false],
    ["a task still open", { tasksDone: 2 }, false],
    ["no tasks yet", { tasksDone: 0, tasksTotal: 0 }, false],
    ["withdrawn", { withdrawn: true }, false],
    ["Verified already", { phase: "verified" as const }, false],
  ])("%s: ready is %s, in the list and the rule alike", (_label, over, ready) => {
    const p = row(over);
    expect(isReadyToVerify(p)).toBe(ready);
    expect(needsOf(p, new Set()).includes("ready")).toBe(ready);
  });

  it.each([
    [{ hours: 13, estimateHours: 12 }, true],
    [{ hours: 12, estimateHours: 12 }, false],
    [{ hours: 40, estimateHours: null }, false],
  ])("over the estimate %o is %s, in the list and the rule alike", (h, over) => {
    expect(overEstimate(h)).toBe(over);
    expect(needsOf(row({ ...h, tasksDone: 1 }), new Set()).includes("over")).toBe(over);
  });
});

// 087 review rounds 2 and 3: one withdrawn rule for every path (writes, lists, the board, the sync), reading meta as SQL does.
describe("087 one withdrawn rule", () => {
  it.each([
    ["withdrawn by hand", { withdrawn_at: "2026-11-07T10:00:00Z", meta: {} }, true],
    ["withdrawn by the repo", { withdrawn_at: null, meta: { withdrawn: true } }, true],
    ["withdrawn by the repo, as a string", { withdrawn_at: null, meta: { withdrawn: "true" } }, true],
    ["marked false", { withdrawn_at: null, meta: { withdrawn: false } }, false],
    ["any other truthy value", { withdrawn_at: null, meta: { withdrawn: "yes" } }, false],
    ["open, no meta", { withdrawn_at: null, meta: null }, false],
  ])("%s → %s", (_label, row, want) => expect(isWithdrawn(row)).toBe(want));
});
