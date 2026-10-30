import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Tool } from "@amax/ai";
import type { Registry } from "@amax/mcp";
import type { Viewer } from "@amax/auth";
import { AWAITING, proposeWrite, type PendingAction } from "./engine";

// 076: when what the user asked fits several writes, the model offers them on one choice card instead of listing them
// in text. Each option is checked and carded exactly as a single write call is (`proposeWrite`), and the options share
// a `choice`, so the person picks one and confirms it in one step; only one of them can ever run (engine.ts).
export const CHOICE_TOOL = "offer_choices";

export const CHOICE_INSTRUCTIONS = `
When there are 2 to 4 reasonable ways to do what the user asked and each one is a write (for example, which of two
entries to change), don't list them in text: call ${CHOICE_TOOL} with one short question and one option per write, each
with its write tool and full input. Use plain text instead when the alternatives aren't writes, or when you need
something only the user can tell you that a card can't ask for (a date, which record they mean when you can't list
them). When every option also needs one short value only the user can type, such as a reason, don't ask for it in
text: leave that field out of each option's input and set ask to { field, label } (for example { field: "reason",
label: "Why is this entry wrong?" }); the card asks for it. The card appears right after your reply, so reply with one
short line at most, such as "Pick one below."`;

// 076 amendment 1: the stand-in an `ask` field is checked with before the person types it; never stored or shown.
const TO_TYPE = "(typed on the card)";

const Input = z.object({
  question: z.string().trim().min(3).max(200).describe("One short question, e.g. \"Which entry should change so Wednesday is 6 h?\""),
  options: z.array(z.object({
    label: z.string().trim().min(1).max(80).describe("What this option does, in a few words, e.g. \"Agent entry: 5.3 h → 3.3 h\""),
    tool: z.string().describe("The write tool this option calls"),
    input: z.record(z.string(), z.unknown()).describe("That tool's full input"),
  })).min(2).max(4),
  ask: z.object({
    field: z.string().min(1).max(60).describe("The input field every option needs from the user, e.g. \"reason\""),
    label: z.string().trim().min(3).max(80).describe("The question the card shows for it, e.g. \"Why is this entry wrong?\""),
  }).optional().describe("One short value only the user can type, asked on the card instead of in text"),
});

export function choiceTool(registry: Registry, viewer: Viewer, add: (action: PendingAction) => void): Tool {
  return {
    name: CHOICE_TOOL,
    description: "Offer the user 2 to 4 alternative writes on one choice card; they pick one and confirm it. Nothing runs until they confirm.",
    input: Input,
    run: async (raw: z.infer<typeof Input>) => {
      const choice = { id: randomUUID(), question: raw.question, ...(raw.ask ? { ask: raw.ask } : {}) };
      const kept: PendingAction[] = [];
      const dropped: string[] = [];
      for (const o of raw.options) {
        const why = await offer(registry, viewer, o, { ...choice, label: o.label }, kept);
        if (why) dropped.push(`${o.label}: ${why}`);
      }
      const notes = dropped.length ? { left_out: dropped } : {};
      if (!kept.length) return { status: "not_proposed", note: "No card was made: none of the options can be done.", ...notes };
      // With an `ask`, one option left is still a choice card: only the card can collect the typed value.
      if (kept.length === 1 && !raw.ask) {
        const { choice: _, ...single } = kept[0];
        add(single);
        return { ...AWAITING, note: "Only one option can be done, so the user sees an ordinary confirm card for it. Don't say it's done.", ...notes };
      }
      kept.forEach(add);
      return { status: "awaiting_choice", note: "The user now sees one card with these options and picks one. Don't say anything is done.", ...notes };
    },
  } as Tool;
}

/** Adds the option's card to `kept`, or says why it can't be offered. */
async function offer(registry: Registry, viewer: Viewer, o: { tool: string; input: Record<string, unknown> }, choice: PendingAction["choice"], kept: PendingAction[]) {
  const t = registry.toolsFor(viewer).find((x) => x.name === o.tool);
  if (!t || t.scope !== "write") return `${o.tool} isn't a write tool you can use`;
  if (t.secretInput) return "it needs a value only the user types, so ask for it with a single card";
  const ask = choice?.ask;
  const parsed = t.input.safeParse(ask ? { ...o.input, [ask.field]: TO_TYPE } : o.input);
  if (!parsed.success) return `its input doesn't fit ${o.tool}`;
  const p = await proposeWrite(t, viewer, parsed.data as Record<string, unknown>, choice);
  if ("refused" in p) return p.refused.note;
  kept.push(ask ? withoutStandIn(p.action, ask.field) : p.action);
  return null;
}

/** The option as stored and shown: the asked field is left out of its input, its fields and its card's lines. */
function withoutStandIn(a: PendingAction, field: string): PendingAction {
  const { [field]: _, ...input } = a.input;
  return { ...a, input, fields: a.fields.filter((f) => f !== field), ...(a.lines ? { lines: a.lines.filter((l) => l.value !== TO_TYPE) } : {}) };
}
