import { z } from "zod";
import { describe, expect, it } from "vitest";
import type { CardForm, McpToolDef } from "@amax/core";
import { defineService } from "@amax/core/server";
import type { RegisteredTool } from "@amax/mcp";
import { proposeWrite } from "../src/engine";
import { withEdits } from "../src/edits";

const service = defineService({ name: "sample.draft", action: "x", resource: "x", input: z.object({ key: z.string() }), run: async (_tx, i) => ({ result: i, resourceId: null, after: i }) });
const tool = (card: McpToolDef["card"]) => ({ name: "set_up", description: "Set up.", input: z.object({ key: z.string() }), draft: z.object({ key: z.string().optional() }),
  permission: "", scope: "write", module: "t", service, card, run: async () => null }) as unknown as RegisteredTool;

describe("106 final pass: a draft tool's card and a required choice", () => {
  it.each([
    ["its card throws", async () => { throw new Error("db down"); }],
    ["its card has no fields", async () => ({ title: "Set up", lines: [] })],
    ["it has no card at all", undefined],
  ])("B3 a tool proposed with its draft makes no card when %s", async (_name, card) => {
    const p = await proposeWrite(tool(card as McpToolDef["card"]), {} as never, {});
    expect(p).toEqual({ refused: expect.objectContaining({ status: "not_proposed", note: expect.stringMatching(/fields couldn't be prepared/) }) });
  });

  it.each([
    ["a draft-only input with no fields is refused", async () => ({ title: "Set up", lines: [] }), {}, true],
    ["a complete input needs no fields", async () => ({ title: "Set up", lines: [] }), { key: "NWP" }, false],
    ["a draft-only input with its fields is a card", async () => ({ title: "Set up", lines: [], form: { fields: [{ name: "key", label: "Key", kind: "text" }] } }), {}, false],
  ])("107 B2 %s", async (_name, card, input, refused) => {
    const p = await proposeWrite(tool(card as McpToolDef["card"]), {} as never, input);
    const note = "refused" in p ? p.refused.note : "";
    expect(/fields couldn't be prepared/.test(note)).toBe(refused);
  });

  const branch: CardForm = { fields: [{ name: "repoUrl", label: "Repo", kind: "text" }, { name: "defaultBranch", label: "Branch", kind: "chips", options: [], other: "other…", required: true },
    { name: "client", label: "Client", kind: "chips", options: [], other: "+ new…" }] };
  it.each([
    ["an empty required choice stays empty, to be refused, never a default", { defaultBranch: "" }, { defaultBranch: "" }],
    ["a required choice typed with spaces round it", { defaultBranch: " release " }, { defaultBranch: "release" }],
    ["an empty optional choice is left out", { client: "" }, {}],
    ["an empty text field is left out", { repoUrl: " " }, {}],
  ])("B6 %s", (_name, edits, expected) => {
    expect(withEdits(branch, {}, edits)).toEqual(expected);
  });
});
