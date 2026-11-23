import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import type { McpToolDef } from "@amax/core";
import { configureRuntime, defineService } from "@amax/core/server";
import { installAuthorizer, upsertPasswordUser, viewerForUser, type Viewer } from "@amax/auth";
import { configureAi } from "@amax/ai";
import { fakeProvider } from "@amax/ai/fake";
import { createRegistry, ToolError } from "@amax/mcp";
import { ActionFailedError, chatTurn, checkCardEdits, confirmAction } from "../src/engine";

const T = "00000000-0000-4000-8000-000000000106";
const made: { key: string; name: string; owner?: string }[] = [];
const Input = z.object({ key: z.string().regex(/^[A-Z]{2,10}$/, "2–10 capitals"), name: z.string().min(1), owner: z.string().optional() }).strict();
const make = defineService({ name: "sample.thing.make", action: "sample.thing.create", resource: "sample.thing", input: Input,
  run: async (_tx, input) => { made.push(input); return { result: input, resourceId: input.key, after: input }; } });
const makeThing = { name: "make_thing", description: "Make a thing.", input: Input, permission: "sample.thing.create", scope: "write", service: make,
  propose: async (_v: Viewer, i: { key: string }) => { if (i.key === "TAKEN") throw new ToolError("TAKEN is taken", "invalid_input", "key"); },
  card: async (_v: Viewer, i: { key: string; name: string }) => ({ title: `Make ${i.key}`, lines: [], look: { done: `Made ${i.key} · ${i.name}` },
    form: { fields: [{ name: "name", label: "Name", kind: "text" }, { name: "key", label: "Key", kind: "text", upper: true, follow: "name" }] } }),
  run: async (v: Viewer, input: z.infer<typeof Input>) => make({ tenantId: v.tenantId, actor: { id: `user:${v.userId}`, kind: "user" }, source: "chat", viewer: v }, input) } as unknown as McpToolDef;

describe.skipIf(!hasDb)("106 editable card fields", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  let maya: Viewer;
  const registry = createRegistry([{ id: "sample", mcpTools: [makeThing] }]);
  const propose = async () => {
    configureAi({ db: app, model: "m", provider: fakeProvider([
      () => ({ toolCalls: [{ type: "tool_use" as const, id: "c1", name: "make_thing", input: { key: "NWP", name: "Northwind" } }] }),
      () => ({ text: "Check the card." }),
    ]) });
    return chatTurn(app, registry, maya, { text: "make a thing for Northwind" });
  };

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

  it("AC4 a field is checked as it changes: the schema, then the tool's own check, each naming its field", async () => {
    const turn = await propose();
    const card = turn.pending[0];
    expect(card.form?.fields.map((f) => f.name)).toEqual(["name", "key"]);
    const check = (edits: Record<string, string>) => checkCardEdits(app, registry, maya, turn.conversationId, card.id, edits);
    expect(await check({ key: "TAKEN" })).toEqual({ field: "key", message: "TAKEN is taken" });
    expect(await check({ key: "x" })).toEqual({ field: "key", message: "2–10 capitals" });
    expect(await check({ key: "FREE" })).toEqual({});
    const refused = await confirmAction(app, registry, maya, turn.conversationId, card.id, { edits: { name: "" } }).catch((e: unknown) => e);
    expect(refused).toMatchObject({ kind: "retry", field: "name", message: "Fill this in" });
  });

  it("AC8 a refusal keeps the card open by its field; the edited input runs once, only declared fields change, and the receipt says what ran", async () => {
    const turn = await propose();
    const id = turn.pending[0].id;
    const refused = await confirmAction(app, registry, maya, turn.conversationId, id, { edits: { key: "TAKEN" } }).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(ActionFailedError);
    expect(refused).toMatchObject({ kind: "retry", field: "key", message: "TAKEN is taken" });
    expect(made).toEqual([]);
    const edits = { key: "NWX", name: "Northwind X", owner: "someone else" };
    const done = await confirmAction(app, registry, maya, turn.conversationId, id, { edits });
    expect(made).toEqual([{ key: "NWX", name: "Northwind X" }]);
    expect(done.action.look?.done).toBe("Made NWX · Northwind X");
    await confirmAction(app, registry, maya, turn.conversationId, id, { edits }).catch(() => undefined);
    expect(made).toHaveLength(1);
  });
});
