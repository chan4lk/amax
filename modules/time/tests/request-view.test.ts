import { describe, expect, it } from "vitest";
import { answerPrompt, quickReplies, stateOf, steps, withdrawPrompt } from "../ui/request-view";

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
});
