import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { McpToolDef } from "@amax/core";
import { createRegistry } from "@amax/mcp";
import { changeAction, chatPlatform, chatTurn, getConversation } from "../src";
import { chatWorld, scripted } from "./world";

const dial = { id: "dial", mcpTools: [{ name: "set_level", description: "Set the level.", input: z.object({ percent: z.number().int() }), scope: "write", permission: "",
  service: { spec: { name: "dial.level.set" } }, run: async () => ({ ok: true }) } as unknown as McpToolDef] };
const registry = createRegistry([chatPlatform, dial]);

describe.skipIf(!hasDb)("change a card's percent (Postgres)", () => {
  let world: Awaited<ReturnType<typeof chatWorld>>;
  beforeAll(async () => { world = await chatWorld(); }, 60_000);
  afterAll(() => world?.t.drop());

  it("AC28 changes only the percent of an open card, keeps it open, and refuses an out-of-range number", async () => {
    const maya = await world.as("maya");
    scripted(world.app, [() => ({ toolCalls: [{ type: "tool_use", id: "c1", name: "set_level", input: { percent: 60 } }] }), () => ({ text: "Ready." })]);
    const turn = await chatTurn(world.app, registry, maya, { text: "set the level to 60" });
    const changed = await changeAction(world.app, registry, maya, turn.conversationId, turn.pending[0].id, 40);
    expect([changed.input.percent, changed.title.endsWith("40")]).toEqual([40, true]);
    expect((await getConversation(world.app, maya, turn.conversationId))?.pending[0].input.percent).toBe(40);
    await expect(changeAction(world.app, registry, maya, turn.conversationId, turn.pending[0].id, 500)).rejects.toThrow();
  });
});
