import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import type { McpToolDef } from "@amax/core";
import { configureRuntime, defineService } from "@amax/core/server";
import { installAuthorizer, upsertPasswordUser, viewerForUser, type Viewer } from "@amax/auth";
import { configureAi } from "@amax/ai";
import { fakeProvider } from "@amax/ai/fake";
import { createRegistry } from "@amax/mcp";
import { chatTurn } from "../src/engine";

const T = "00000000-0000-4000-8000-000000000a74";
const save = defineService({ name: "sample.thing.save", action: "sample.thing.create", resource: "sample.thing", input: z.object({ id: z.string(), hours: z.number() }),
  run: async (_tx, input) => ({ result: input, resourceId: input.id, after: input }) });
const write = (name: string, card?: McpToolDef["card"]) => ({ name, description: "Save one thing. More words.", input: z.object({ id: z.string(), hours: z.number() }).strict(),
  permission: "sample.thing.create", scope: "write", service: save, card,
  run: async (v: Viewer, input: { id: string; hours: number }) => save({ tenantId: v.tenantId, actor: { id: `user:${v.userId}`, kind: "user" }, source: "chat", viewer: v }, input) });
const tools = [
  write("worded", async () => ({ title: "Fix Widget, Wed Oct 14", lines: [{ label: "Hours", value: "2.7 h → 2 h" }] })),
  write("plain"),
  write("broken", async () => { throw new Error("card store down"); }),
] as unknown as McpToolDef[];

describe.skipIf(!hasDb)("070 amendment 2: a tool's own confirm card", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  let maya: Viewer;
  const registry = createRegistry([{ id: "sample", mcpTools: tools }]);

  beforeAll(async () => {
    t = await migratedDatabase();
    app = t.app();
    configureRuntime({ db: app, auditKey: "k".repeat(32) });
    installAuthorizer();
    await t.owner`insert into core.tenant (id, name) values (${T}, 'amax')`;
    await t.owner`insert into ai.settings (tenant_id, zdr_confirmed) values (${T}, true)`;
    const id = await upsertPasswordUser(app, T, { email: "maya@amax.test", name: "Maya (fictional)", roles: ["Admin"], password: "a-long-password-1234" });
    maya = (await withTenant(app, T, (tx) => viewerForUser(tx, T, id)))!;
  });
  afterAll(() => t?.drop());

  it("AC20 a card hook words the card; without one, or when it throws, the card is today's", async () => {
    const input = { id: "w-1", hours: 2 };
    configureAi({ db: app, model: "m", provider: fakeProvider([
      () => ({ toolCalls: ["worded", "plain", "broken"].map((name, i) => ({ type: "tool_use" as const, id: `c${i}`, name, input })) }),
      () => ({ text: "Confirm?" }),
    ]) });
    const { pending } = await chatTurn(app, registry, maya, { text: "fix it" });
    expect(Object.fromEntries(pending.map((p) => [p.tool, [p.title, p.lines, p.input]]))).toEqual({
      worded: ["Fix Widget, Wed Oct 14", [{ label: "Hours", value: "2.7 h → 2 h" }], input],
      plain: ["Save one thing: w-1, 2", undefined, input],
      broken: ["Save one thing: w-1, 2", undefined, input],
    });
  });

  it("AC40 the page goes to the model as \"Current page\" on every turn, and only when there is one", async () => {
    const seen: string[] = [];
    configureAi({ db: app, model: "m", provider: fakeProvider((req) => { seen.push(JSON.stringify(req)); return { text: "ok" }; }) });
    const page = { module: "time", page: "My timesheet", label: "My timesheet · Week of Oct 12", params: { week: "2026-W42" }, suggestions: [{ label: "Fix an entry", prompt: "Fix: " }] };
    const first = await chatTurn(app, registry, maya, { text: "change Wednesday to 6 h", page });
    await chatTurn(app, registry, maya, { conversationId: first.conversationId, text: "and Thursday", page: { ...page, params: { week: "2026-W43" } } });
    await chatTurn(app, registry, maya, { text: "hello" });
    // The turn's own data comes before the stored history, so the first block is the page the user is on now.
    const latest = (s: string) => [...s.matchAll(/data label=\\"Current page\\">([\s\S]*?)<\/data>/g)][0]?.[1] ?? "";
    expect(seen.map((s) => [latest(s).includes("2026-W42"), latest(s).includes("2026-W43")])).toEqual([[true, false], [false, true], [false, false]]);
  });
});
