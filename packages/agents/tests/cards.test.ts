import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { McpToolDef, ToolCard } from "@amax/core";
import { agentsTools } from "../src/mcp";
import { createSuggestion } from "../src/server";
import { agentFor, agentsDb, ANA, MAYA, proposal, viewer } from "./setup";

const cardOf = (name: string) => (agentsTools.find((t) => t.name === name) as McpToolDef & { card: (v: unknown, a: unknown) => Promise<ToolCard> }).card;

// 081 amendment 2: deciding a suggestion in chat shows the suggestion, not the tool and its id.
describe.skipIf(!hasDb)("081 the decision cards name the suggestion being decided", () => {
  let db: Awaited<ReturnType<typeof agentsDb>>;
  beforeAll(async () => { db = await agentsDb(); });
  afterAll(() => db?.t.drop());

  it("accept, dismiss, undo and query cards show the suggestion's title, kind and agent, with the decision on the button and in the receipt", async () => {
    const maya = viewer(MAYA, ["Admin"]);
    const one = await createSuggestion(agentFor(ANA), proposal());
    expect(await cardOf("accept_agent_suggestion")(maya, { id: one.id })).toMatchObject({
      title: "Accept: Raise the limit to 5",
      lines: expect.arrayContaining([{ label: "Suggestion", value: "Raise the limit to 5" }, { label: "Kind", value: "Setting change" }]),
      look: { confirm: "Accept", done: "Accepted: Raise the limit to 5", subject: "Raise the limit to 5" },
    });
    expect((await cardOf("dismiss_agent_suggestion")(maya, { id: one.id, note: "Not now" })).look).toMatchObject({ confirm: "Dismiss", done: "Dismissed: Raise the limit to 5" });
    expect((await cardOf("undo_agent_suggestion")(maya, { id: one.id })).look).toMatchObject({ confirm: "Undo", done: "Undone: Raise the limit to 5" });
    expect((await cardOf("query_agent_suggestion")(maya, { id: one.id, note: "Why 5?" })).lines).toContainEqual({ label: "Question", value: "Why 5?" });
    const bank = await createSuggestion(agentFor(ANA), proposal({ kind: "demo.bankfile", proposed: { key: "bank", value: 1 }, title: "Send the bank file" }));
    expect((await cardOf("accept_agent_suggestion")(maya, { id: bank.id })).look).toMatchObject({ confirm: "Approve", done: "Approved, waiting for a second approver: Send the bank file" });
    expect((await cardOf("accept_agent_suggestion")(viewer(ANA, []), { id: one.id })).lines).toEqual([{ label: "Suggestion", value: "not found, or not one you may decide" }]);
  });
});
