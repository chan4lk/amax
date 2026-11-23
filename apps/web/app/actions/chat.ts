"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AiDisabledError, aiConfigured } from "@amax/ai";
import { logError } from "@amax/core/server";
import { currentViewer } from "@amax/auth";
import { askFirst, cancelAction, changeAction, chatTurn, checkCardEdits, confirmAction, resolvePins, type ChatTurn, type FieldCheck, type PendingAction, type Pin } from "@amax/chat";
import { getSuggestion } from "@amax/agents/server";
import { summaryLine } from "@amax/chat/addall";
import { myChatUsage } from "../../lib/chat-usage";
import { checkFailure, doneOutcome, outcomeOf, type CardOutcome } from "../../lib/chat-outcome";
import { pageInfo, type PageInfo, type PinnedArgs } from "../../lib/page-context";
import { installed } from "../../lib/registry";
import { sameUser, SignedInElsewhere } from "../../lib/same-user";
import { planNote, withUnplanned } from "../../lib/take-action";
import { chatIntents, getDb, toolRegistry } from "../../lib/server";

export type ChatResult = ({ ok: true; usage: string | null } & ChatTurn) | { ok: false; error: string };

const friendly = (e: unknown) =>
  e instanceof AiDisabledError || e instanceof SignedInElsewhere ? e.message : e instanceof Error && /forbidden|scope/.test(e.message) ? e.message : "Sorry, something went wrong. Try again.";

export async function sendChat(input: { conversationId?: string; text: string; pins?: Pin[]; intentId?: string; path?: string; as?: string }): Promise<ChatResult> {
  try {
    const viewer = await currentViewer();
    sameUser(viewer, input.as);
    if (!aiConfigured()) return { ok: false, error: "AI is off: no API key is configured on the server." };
    const intent = input.intentId ? chatIntents().find((i) => i.id === input.intentId) : undefined;
    const page = input.path ? (await pageInfo(installed, toolRegistry(), viewer, input.path.slice(0, 300))) ?? undefined : undefined;
    const turn = await chatTurn(getDb()!, toolRegistry(), viewer, { conversationId: input.conversationId, text: input.text.slice(0, 4000), pins: input.pins?.slice(0, 8), intent, page, rules: installed.find((m) => m.id === page?.module)?.chatRules });
    return { ok: true, ...turn, usage: await myChatUsage(viewer) };
  } catch (e) {
    const id = logError("chat", e);
    return { ok: false, error: `${friendly(e)} (ref ${id.slice(0, 8)})` };
  }
}

export type { CardOutcome };

/** 070 amendment 4: the page chat's header and suggestions describe; null for a page with no module route. */
export async function pageContext(path: string, as?: string, pins: PinnedArgs[] = []): Promise<PageInfo | null> {
  try {
    if (typeof path !== "string" || path.length > 300) return null;
    const viewer = await currentViewer();
    sameUser(viewer, as);
    const safe = Array.isArray(pins) ? pins.slice(0, 10).filter((p) => p && typeof p.tool === "string" && p.args && typeof p.args === "object") : [];
    return await pageInfo(installed, toolRegistry(), viewer, path, safe);
  } catch (e) {
    logError("chat.page", e);
    return null;
  }
}

/** 106: a form card's fields as the person left them: a few short strings. */
const editsSchema = z.record(z.string().max(60), z.string().max(500)).refine((e) => Object.keys(e).length <= 20).optional();

/** `answer` (076 amendment 1): what the person typed on a choice card for its `ask` field (a reason, say). */
export async function confirmChat(conversationId: string, actionId: string, as?: string, answer?: string, edits?: Record<string, string>): Promise<CardOutcome> {
  let done: { title: string; result: unknown; receipt?: string };
  try {
    const typed = z.string().max(2000).optional().parse(answer);
    const fields = editsSchema.parse(edits);
    const viewer = await currentViewer();
    sameUser(viewer, as);
    const { action, result } = await confirmAction(getDb()!, toolRegistry(), viewer, conversationId, actionId, { ...(typed === undefined ? {} : { answer: typed }), ...(fields ? { edits: fields } : {}) });
    done = { title: summaryLine(action.input, action.title), result, receipt: action.look?.done };
  } catch (e) {
    return outcomeOf(e);
  }
  // The write has committed: nothing after this may turn the card into an error (057).
  try { revalidatePath("/", "layout"); } catch (e) { logError("chat.revalidate", e); }
  return doneOutcome(done.title, done.result, done.receipt);
}

/** 106: one form card's fields checked while they are edited; nothing is written. */
export async function checkCardField(conversationId: string, actionId: string, edits: Record<string, string>, as?: string): Promise<FieldCheck> {
  try {
    const fields = editsSchema.parse(edits) ?? {};
    const viewer = await currentViewer();
    sameUser(viewer, as);
    return await checkCardEdits(getDb()!, toolRegistry(), viewer, z.string().uuid().parse(conversationId), z.string().uuid().parse(actionId), fields);
  } catch (e) {
    return checkFailure(e);
  }
}

const pinList = z.array(z.object({ label: z.string().max(200), tool: z.string().max(80), args: z.record(z.string(), z.unknown()), facet: z.string().max(200).optional(), unavailable: z.literal(true).optional() })).max(8);

/**
 * The panel's pins read again with the viewer's permissions (059), after a confirm or whenever the
 * panel wants their labels as they are now. Only the pins come back, never the records.
 */
export async function refreshPins(pins: unknown, as?: string): Promise<Pin[] | null> {
  try {
    const viewer = await currentViewer();
    sameUser(viewer, as);
    return (await resolvePins(toolRegistry(), viewer, pinList.parse(pins))).map((r) => r.pin);
  } catch (e) {
    logError("chat.pins", e);
    return null;
  }
}

export async function cancelChat(conversationId: string, actionId: string, as?: string): Promise<CardOutcome> {
  try {
    const viewer = await currentViewer();
    sameUser(viewer, as);
    await cancelAction(getDb()!, viewer, conversationId, actionId);
    return { state: "cancelled", note: "Cancelled. Nothing was changed." };
  } catch (e) {
    return outcomeOf(e);
  }
}

export type ChangeResult = { ok: true; action: PendingAction } | { ok: false; note: string };

export async function changeChat(conversationId: string, actionId: string, percent: number): Promise<ChangeResult> {
  try {
    const viewer = await currentViewer();
    return { ok: true, action: await changeAction(getDb()!, toolRegistry(), viewer, conversationId, actionId, percent) };
  } catch (e) {
    logError("chat.change", e);
    return { ok: false, note: e instanceof z.ZodError ? "Use a whole number from 0 to 200." : "That card can't be changed any more. Ask again." };
  }
}

const secretForm = z.object({ secret: z.string().min(1).max(16_384) });

/**
 * Confirm a card whose tool takes a typed secret (047 AC-4). The value arrives only here, from the
 * card's masked field, and is handed to the tool for this one call: it is never stored, logged,
 * echoed back or sent to the model.
 */
export async function confirmSecretChat(conversationId: string, actionId: string, data: FormData): Promise<CardOutcome> {
  try {
    const parsed = secretForm.safeParse({ secret: data.get("secret") });
    if (!parsed.success) return { state: "open", note: "Type the value first." };
    const viewer = await currentViewer();
    sameUser(viewer, data.get("as") ?? undefined);
    await confirmAction(getDb()!, toolRegistry(), viewer, conversationId, actionId, { secret: parsed.data.secret });
    revalidatePath("/", "layout");
    return { state: "done", note: "Done: saved to the vault. The value can't be shown again." };
  } catch (e) {
    return outcomeOf(e);
  }
}

export async function takeAction(conversationId: string | undefined, suggestionId: string, as?: string): Promise<{ ok: true; conversationId: string; text: string } | { ok: false; error: string }> {
  try {
    const viewer = await currentViewer();
    sameUser(viewer, as);
    const s = await getSuggestion(viewer, z.uuid().parse(suggestionId));
    if (!s) return { ok: false, error: "That suggestion isn't there any more." };
    const p = s.proposed as { personId?: string; projectKey?: string; month?: string; percent?: number };
    const [who] = s.target.label.split(", ");
    const grid = (await toolRegistry().call(viewer, "list_allocations", { everyone: true }, { source: "chat" }).catch(() => null)) as Parameters<typeof planNote>[0];
    const { unplanned, note } = planNote(grid, p.personId, p.month);
    const text = `${s.title.replace(who, `**${who}**`)}. ${withUnplanned(s.detail ?? "", unplanned)}${note} What would you like to do?`;
    const context = `The person pressed Take action on this Allocation check suggestion: ${s.title}. ${s.detail ?? ""} The check's change: ${who} on ${p.projectKey} for ${String(p.month).slice(0, 7)} at ${p.percent}%. If they agree, make one allocate card with exactly that person, project, month and percent.`;
    const id = await askFirst(getDb()!, viewer, { conversationId, context, question: text });
    return { ok: true, conversationId: id, text };
  } catch (e) {
    const id = logError("chat.take", e);
    return { ok: false, error: `${friendly(e)} (ref ${id.slice(0, 8)})` };
  }
}
