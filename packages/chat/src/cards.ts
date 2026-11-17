import { z } from "zod";
import type { Tool } from "@amax/ai";
import type { PendingAction } from "./engine";
import { summaryLine } from "./addall";

type Act = { edit: (id: string, changes: Record<string, unknown>) => Promise<PendingAction>; drop: (id: string) => Promise<void> };

export const openCardsNote = (open: PendingAction[]) => (open.length
  ? `\n\nChanges waiting for the user, numbered as they see them:\n${open.map((p, i) => `${i + 1}. ${summaryLine(p.input, p.title)}`).join("\n")}\nIf the user asks to change or drop one of these ("make Kasun 40%", "drop Nimal", "move the second one to January"), call change_card or drop_card with its number. Never make a new card for a change that is already waiting.`
  : "");

export function echoOf(changed: PendingAction[], dropped: number) {
  const parts = [...changed.map((c) => `Now: ${summaryLine(c.input, c.title)}.`), ...(dropped ? [`Dropped ${dropped === 1 ? "that one" : `those ${dropped}`}.`] : [])];
  return parts.length ? `${parts.join(" ")}\nPress Add all if that looks right, or tell me what to change.` : "";
}

const failed = (e: unknown) => ({ status: "not_changed", note: e instanceof Error ? e.message : "that didn't work" });

export function cardTools(open: PendingAction[], act: Act): Tool[] {
  const pick = (n: number) => open[n - 1];
  return [
    { name: "change_card", description: "Change a change that is waiting for the user, by its number in the waiting list. changes holds only the fields to change, named as on the card (for example percent, month, through, projectKey, person). It stays waiting for the user's confirm.",
      input: z.object({ card: z.number().int().min(1), changes: z.record(z.string(), z.unknown()) }),
      run: async (a: { card: number; changes: Record<string, unknown> }) => {
        const c = pick(a.card);
        if (!c) return { status: "not_changed", note: "There's no waiting change with that number." };
        try { const next = await act.edit(c.id, a.changes); return { status: "changed", now: summaryLine(next.input, next.title) }; } catch (e) { return failed(e); }
      } },
    { name: "drop_card", description: "Drop a change that is waiting for the user, by its number in the waiting list, when the user says to drop, remove or cancel it.",
      input: z.object({ card: z.number().int().min(1) }),
      run: async (a: { card: number }) => {
        const c = pick(a.card);
        if (!c) return { status: "not_changed", note: "There's no waiting change with that number." };
        try { await act.drop(c.id); return { status: "dropped" }; } catch (e) { return failed(e); }
      } },
  ] as unknown as Tool[];
}
