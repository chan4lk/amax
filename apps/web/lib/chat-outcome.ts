import { ActionFailedError, NotPendingError } from "@amax/chat";
import { movedOf, type Moved } from "./chat-move";

export { movedOf } from "./chat-move";

/** The card's state after a decision; the page draws exactly this. */
export type CardOutcome = { state: "done" | "cancelled" | "open" | "error"; note: string; reveal?: Reveal; moved?: Moved };

/** 035: a value shown once on the card (a new API key). It goes nowhere else: not the model, the conversation or the logs. */
export type Reveal = { label: string; value: string };
export const revealOf = (result: unknown): Reveal | undefined => {
  const r = (result as { reveal?: Partial<Reveal> } | null)?.reveal;
  return r && typeof r.label === "string" && typeof r.value === "string" ? { label: r.label, value: r.value } : undefined;
};

/**
 * What a failed confirm or cancel means for the card (review rounds 3 to 8). "cancelled" only when it
 * really was cancelled; anything unknown is an error, never a silent close.
 */
export function outcomeOf(e: unknown): CardOutcome {
  if (e instanceof ActionFailedError) {
    if (e.kind === "retry") return { state: "open", note: `That didn't work: ${e.message}. Try again or cancel.` };
    if (e.kind === "failed") return { state: "error", note: `This couldn't be done: ${e.message}. Nothing was changed.` };
    return { state: "error", note: e.message };
  }
  if (e instanceof NotPendingError) {
    if (e.decision === "confirmed") return { state: "done", note: "This was already done." };
    if (e.decision === "cancelled") return { state: "cancelled", note: "This was already cancelled. Nothing was changed." };
    if (e.decision === "failed") return { state: "error", note: "This couldn't be done. Nothing was changed." };
    if (e.decision === "expired") return { state: "error", note: "This request expired. If it was confirmed earlier, check the record before asking again." };
    if (e.decision === "unknown") return { state: "error", note: "It wasn't clear whether this was done. Check the record before trying again." };
  }
  return { state: "error", note: e instanceof Error ? e.message : String(e) };
}

/**
 * The card after a write that has committed, with `moved` so the page follows a renamed record (057).
 * Pins need nothing: they name records by id and their labels are read fresh (059).
 */
export function doneOutcome(title: string, result: unknown): CardOutcome {
  const reveal = revealOf(result);
  if (reveal) return { state: "done", note: `Done. Copy the ${reveal.label.toLowerCase()} now: it is shown only this once.`, reveal };
  const key = (result as { key?: string } | null)?.key;
  const moved = movedOf(result);
  const many = summaryOf(result);
  return { state: "done", note: many ?? (key ? `Done: ${key} added.` : `Done: ${title}.`), ...(moved ? { moved } : {}) };
}

/** 070 amendment 4: a write over several records reports a summary and a result per record. */
function summaryOf(result: unknown): string | null {
  const r = result as { summary?: unknown; results?: { person?: unknown; status?: unknown; note?: unknown }[] } | null;
  if (typeof r?.summary !== "string" || !Array.isArray(r.results)) return null;
  const each = r.results.map((x) => `${String(x.person)}: ${String(x.status)}${x.note ? ` (${String(x.note)})` : ""}`).join("; ");
  return `Done: ${r.summary}.${each ? ` ${each}.` : ""}`;
}
