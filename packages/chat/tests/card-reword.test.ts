import { z } from "zod";
import { describe, expect, it } from "vitest";
import type { McpToolDef } from "@amax/core";
import type { RegisteredTool } from "@amax/mcp";
import { rewordCard, type PendingAction } from "../src/engine";

const proposed: PendingAction = {
  id: "a1", tool: "make_thing", title: "Make NWP", input: { key: "NWP" }, fields: ["key"], createdAt: new Date().toISOString(),
  lines: [{ label: "Key", value: "NWP" }], look: { kind: "Make", confirm: "Make NWP", done: "Made NWP" }, form: { fields: [{ name: "key", label: "Key", kind: "text" }] },
};
const tool = (card: McpToolDef["card"]) => ({ name: "make_thing", description: "Make a thing.", input: z.object({ key: z.string() }), permission: "", scope: "write", module: "t", card, run: async () => null }) as unknown as RegisteredTool;

describe("106 review round 1: a card worded again after its edits", () => {
  it.each([
    ["the card throws", async () => { throw new Error("db down"); }],
    ["the card rejects", () => Promise.reject(new Error("timeout"))],
    ["the tool has no card", undefined],
  ])("B3 when %s, the proposed receipt and lines are dropped, never kept for the edited input", async (_name, card) => {
    const a = await rewordCard(tool(card as McpToolDef["card"]), {} as never, proposed, { key: "NWX" });
    expect(a.input).toEqual({ key: "NWX" });
    expect(a.look?.done).toBeUndefined();
    expect(a.lines).toBeUndefined();
    expect(a.title).toBe("Make a thing: NWX");
  });

  it("B3 a card that words itself names the edited input", async () => {
    const a = await rewordCard(tool(async (_v: never, i: { key: string }) => ({ title: `Make ${i.key}`, lines: [], look: { done: `Made ${i.key}` } }) as never), {} as never, proposed, { key: "NWX" });
    expect(a.look?.done).toBe("Made NWX");
  });
});
