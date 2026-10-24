import type { ChangeRequest } from "../server/requests-read";

// 073: what the owner's change-request card says and offers. Every action is a chat prompt naming the request by id,
// so chat answers or withdraws exactly that one, on a confirm card.
type R = Pick<ChangeRequest, "id" | "before" | "dayLabel">;
const named = (r: R) => `my change request for ${r.before.projectName}, ${r.dayLabel} (request id ${r.id})`;

export const requestPin = (r: Pick<ChangeRequest, "id" | "personName">) => ({ label: `${r.personName}, change request`, tool: "get_change_requests", args: { id: r.id } });
export const answerPrompt = (r: R, answer = "") => `Answer ${named(r)}: ${answer}`;
export const withdrawPrompt = (r: R) => `Withdraw ${named(r)}`;

/** One-click answers when the question can be answered that way: billable or not, or a plain yes or no. */
export function quickReplies(question: string | null): string[] {
  if (!question) return [];
  if (/\bnon-?billable\b|\bbillable\b/i.test(question)) return ["It was billable", "It wasn't billable"];
  const asks = question.split(/(?<=[.?!])\s+/).filter((s) => s.trim().endsWith("?"));
  return asks.length === 1 && /^(was|were|is|are|did|do|does|can|could|should|has|have|will|would)\b/i.test(asks[0].trim()) ? ["Yes", "No"] : [];
}

export type Step = { label: string; state: "done" | "now" | "next" };
/** Requested → (Question from approver) → Decided: where the request is. The question step shows only once asked. */
export function steps(r: Pick<ChangeRequest, "status" | "question">): Step[] {
  const decided = !["pending", "needs_info"].includes(r.status);
  const out: Step[] = [{ label: "Requested", state: "done" }];
  if (r.question) out.push({ label: "Question from approver", state: r.status === "needs_info" ? "now" : "done" });
  out.push({ label: decided ? DECIDED[r.status] ?? "Decided" : "Decision", state: decided ? "done" : r.status === "needs_info" ? "next" : "now" });
  return out;
}

const DECIDED: Record<string, string> = { applied: "Applied", completed: "Applied", reopened: "Week reopened", declined: "Declined" };
/** The card's status chip: [chip class, words]. */
export function stateOf(r: Pick<ChangeRequest, "status" | "answer">): [string, string] {
  if (r.status === "needs_info") return ["warn", "Needs your answer"];
  if (r.status === "pending") return ["", r.answer ? "Answered, waiting for review" : "Waiting for review"];
  if (r.status === "declined") return ["bad", "Declined"];
  if (r.status === "reopened") return ["warn", "Week reopened for you"];
  return ["good", "Change applied"];
}

const firstOf = (name: string) => name.split(" ")[0];
/** The reviewer's chip: an answered request is ready for a decision; a question waits on the person. */
export function reviewStateOf(r: Pick<ChangeRequest, "status" | "answer" | "personName">): [string, string] {
  if (r.status === "needs_info") return ["", `Waiting for ${firstOf(r.personName)}'s answer`];
  return r.answer ? ["good", `${firstOf(r.personName)} answered`] : ["warn", "New request"];
}
/** Answered first (they wait on the reviewer), then new, then those waiting on the person; oldest first within each. */
export const reviewOrder = (a: ChangeRequest, b: ChangeRequest) => {
  const rank = (r: ChangeRequest) => (r.status === "pending" ? (r.answer ? 0 : 1) : 2);
  return rank(a) - rank(b) || a.createdAt.localeCompare(b.createdAt);
};
type D = Pick<ChangeRequest, "id" | "personName" | "before" | "dayLabel">;
const DECISION = { apply: "apply it", ask: "ask: ", decline: "decline, because ", reopen: "reopen the week so they can fix it" } as const;
/** A decision as a chat prompt naming the request by id; ask and decline leave room for the note. */
export const decidePromptFor = (r: D, d: keyof typeof DECISION) =>
  `Decide on ${r.personName}'s change request for ${r.before.projectName}, ${r.dayLabel} (request id ${r.id}): ${DECISION[d]}`;
