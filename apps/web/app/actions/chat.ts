"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AiDisabledError, aiConfigured } from "@amax/ai";
import { logError } from "@amax/core/server";
import { currentViewer } from "@amax/auth";
import { cancelAction, chatTurn, confirmAction, resolvePins, type ChatTurn, type Pin } from "@amax/chat";
import { myChatUsage } from "../../lib/chat-usage";
import { doneOutcome, outcomeOf, type CardOutcome } from "../../lib/chat-outcome";
import { pageInfo, type PageInfo, type PinnedArgs } from "../../lib/page-context";
import { installed } from "../../lib/registry";
import { sameUser, SignedInElsewhere } from "../../lib/same-user";
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
    const turn = await chatTurn(getDb()!, toolRegistry(), viewer, { conversationId: input.conversationId, text: input.text.slice(0, 4000), pins: input.pins?.slice(0, 8), intent, page });
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

export async function confirmChat(conversationId: string, actionId: string, as?: string): Promise<CardOutcome> {
  let done: { title: string; result: unknown };
  try {
    const viewer = await currentViewer();
    sameUser(viewer, as);
    const { action, result } = await confirmAction(getDb()!, toolRegistry(), viewer, conversationId, actionId);
    done = { title: action.title, result };
  } catch (e) {
    return outcomeOf(e);
  }
  // The write has committed: nothing after this may turn the card into an error (057).
  try { revalidatePath("/", "layout"); } catch (e) { logError("chat.revalidate", e); }
  return doneOutcome(done.title, done.result);
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
