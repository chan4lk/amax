import { ActionFailedError, CHECK_FAILED, NotPendingError, type FieldCheck } from "@amax/chat";
import { logError } from "@amax/core/server";
import { SignedInElsewhere } from "./same-user";
import { movedOf, type Moved } from "./chat-move";

export { movedOf } from "./chat-move";

/** The card's state after a decision; the page draws exactly this. */
export type CardOutcome = { state: "done" | "cancelled" | "open" | "error"; note: string; field?: string; reveal?: Reveal; moved?: Moved; open?: Open };

/** 035: a value shown once on the card (a new API key). It goes nowhere else: not the model, the conversation or the logs. */
export type Reveal = { label: string; value: string };
export const revealOf = (result: unknown): Reveal | undefined => {
  const r = (result as { reveal?: Partial<Reveal> } | null)?.reveal;
  return r && typeof r.label === "string" && typeof r.value === "string" ? { label: r.label, value: r.value } : undefined;
};

/** 108: a link a write hands back to follow next (GitHub's authorize page), shown on the card once it is done. Only http(s). */
export type Open = { label: string; url: string };
export const openOf = (result: unknown): Open | undefined => {
  const o = (result as { open?: Partial<Open> } | null)?.open;
  return o && typeof o.label === "string" && typeof o.url === "string" && /^https?:\/\//.test(o.url) ? { label: o.label, url: o.url } : undefined;
};

/**
 * What a failed confirm or cancel means for the card (review rounds 3 to 8). "cancelled" only when it
 * really was cancelled; anything unknown is an error, never a silent close.
 */
export function outcomeOf(e: unknown): CardOutcome {
  if (e instanceof ActionFailedError) {
    if (e.kind === "retry" && e.field) return { state: "open", note: e.message, field: e.field };
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
 * 106: why a form card's field couldn't be checked. A card already decided or expired, or a sign-in changed in another tab,
 * can't be confirmed at all, so it says so and blocks; anything else is a passing failure (`transient`) that never blocks.
 */
export function checkFailure(e: unknown): FieldCheck {
  if (e instanceof NotPendingError) return { message: "This card is no longer open. Ask again for a new one." };
  if (e instanceof SignedInElsewhere) return { message: e.message };
  logError("chat.check", e);
  return CHECK_FAILED;
}

/**
 * The card after a write that has committed, with `moved` so the page follows a renamed record (057).
 * Pins need nothing: they name records by id and their labels are read fresh (059).
 */
export function doneOutcome(title: string, result: unknown, receipt?: string): CardOutcome {
  const reveal = revealOf(result);
  if (reveal) return { state: "done", note: `Done. Copy the ${reveal.label.toLowerCase()} now: it is shown only this once.`, reveal };
  const key = (result as { key?: string } | null)?.key;
  const moved = movedOf(result);
  const open = openOf(result);
  const many = summaryOf(result, receipt);
  // 073: a card's own past-tense receipt ("Logged 1.5 h · Fleet Tracker, Tue Oct 27") reads better than "Done: {title}".
  return { state: "done", note: many ?? receipt ?? (key ? `Done: ${key} added.` : `Done: ${title}.`), ...(moved ? { moved } : {}), ...(open ? { open } : {}) };
}

/** 070 amendment 4: a write over several records reports a summary and a result per record. */
function summaryOf(result: unknown, receipt?: string): string | null {
  const r = result as { summary?: unknown; results?: { person?: unknown; status?: unknown; note?: unknown }[] } | null;
  if (typeof r?.summary !== "string" || !Array.isArray(r.results)) return null;
  const each = r.results.map((x) => `${String(x.person)}: ${String(x.status)}${x.note ? ` (${String(x.note)})` : ""}`).join("; ");
  // A card with its own receipt already writes its summary in the past tense ("Approved 3 · skipped 0"), and it says what really happened.
  return `${receipt ? r.summary : `Done: ${r.summary}`}.${each ? ` ${each}.` : ""}`;
}
