import { describe, expect, it } from "vitest";
import { answerPrompt, decidePromptFor, quickReplies, reviewOrder, reviewStateOf, stateOf, steps, withdrawPrompt } from "../ui/request-view";

// 073: the owner's change-request card: one-click replies, where the request stands, and prompts naming it by id.
describe("the owner's change-request card", () => {
  it("offers billable answers, a plain yes or no, or nothing for an open question", () => {
    expect(quickReplies("Thanks. Was the time being removed billable? Please confirm whether it was billable or non-billable.")).toEqual(["It was billable", "It wasn't billable"]);
    expect(quickReplies("Did you leave before the standup?")).toEqual(["Yes", "No"]);
    expect(quickReplies("What did you work on that afternoon?")).toEqual([]);
    expect(quickReplies("Was it Monday? Or Tuesday?")).toEqual([]);
    expect(quickReplies(null)).toEqual([]);
  });

  it("shows Requested, the question step once asked, and the decision", () => {
    expect(steps({ status: "pending", question: null })).toEqual([{ label: "Requested", state: "done" }, { label: "Decision", state: "now" }]);
    expect(steps({ status: "needs_info", question: "Billable?" }).map((s) => s.state)).toEqual(["done", "now", "next"]);
    expect(steps({ status: "declined", question: "Billable?" }).at(-1)).toEqual({ label: "Declined", state: "done" });
    expect(stateOf({ status: "needs_info", answer: null })).toEqual(["warn", "Needs your answer"]);
    expect(stateOf({ status: "pending", answer: "Yes" })).toEqual(["", "Answered, waiting for review"]);
    expect(stateOf({ status: "completed", answer: null })).toEqual(["good", "Change applied"]);
  });

  it("names the request by id in every prompt", () => {
    const r = { id: "11111111-2222-4333-8444-555555555555", before: { projectName: "Fleet Tracker" } as never, dayLabel: "Thu Oct 22" };
    expect(answerPrompt(r, "It was billable")).toBe("Answer my change request for Fleet Tracker, Thu Oct 22 (request id 11111111-2222-4333-8444-555555555555): It was billable");
    expect(withdrawPrompt(r)).toBe("Withdraw my change request for Fleet Tracker, Thu Oct 22 (request id 11111111-2222-4333-8444-555555555555)");
  });

  it("puts the person's answer first for the reviewer, ready for a decision, with the decisions as prompts", () => {
    const base = { id: "11111111-2222-4333-8444-555555555555", personName: "Kasun Dias", before: { projectName: "Fleet Tracker", hours: 8, billable: true, note: null } as never,
      dayLabel: "Thu Oct 22", day: "2026-10-22", week: "2026-W43", weekStatus: "submitted", weekId: "w", userId: "u", entryId: "e", kind: "correct" as const, proposed: { hours: 7 },
      revision: 1, reason: "Left early", question: "Was the removed time billable?", decisionNote: null, decidedBy: "user:maya", deciderName: "Maya Fernando", decidedAt: null, createdAt: "2026-10-24T08:00:00Z" };
    const answered = { ...base, status: "pending" as const, answer: "It wasn't billable" };
    const waiting = { ...base, status: "needs_info" as const, answer: null };
    expect(reviewStateOf(answered)).toEqual(["good", "Kasun answered"]);
    expect(reviewStateOf(waiting)).toEqual(["", "Waiting for Kasun's answer"]);
    expect(reviewStateOf({ ...base, status: "pending", answer: null })).toEqual(["warn", "New request"]);
    const order = [waiting, { ...base, status: "pending" as const, answer: null }, answered].sort(reviewOrder).map((x) => reviewStateOf(x)[1]);
    expect(order).toEqual(["Kasun answered", "New request", "Waiting for Kasun's answer"]);
    expect(decidePromptFor(base, "apply")).toBe("Decide on Kasun Dias's change request for Fleet Tracker, Thu Oct 22 (request id 11111111-2222-4333-8444-555555555555): apply it");
  });
});
