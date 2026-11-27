import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import { configureAi } from "@amax/ai";
import { fakeProvider } from "@amax/ai/fake";
import { createRegistry } from "@amax/mcp";
import { cancelAction, chatTurn, checkCardEdits, confirmAction } from "@amax/chat";
import delivery from "../module";
import { chatIntents } from "../chat";
import { createRelease } from "../server/services";
import { ctxFor } from "../server/context";
import { proposalDb, T } from "./proposal-db";

const FULL = { name: "November Release", category: "uat", startDate: "2026-10-01", targetDate: "2099-12-31" };

describe.skipIf(!hasDb)("124 the New release card in chat (Postgres)", () => {
  let db: Awaited<ReturnType<typeof proposalDb>>;
  let maya: Viewer;
  const registry = createRegistry([delivery]);
  const turn = (input: Record<string, unknown>) => {
    configureAi({ db: db.app, model: "m", provider: fakeProvider([() => ({ toolCalls: [{ type: "tool_use" as const, id: "c", name: "create_release", input }] }), () => ({ text: "Check the card." })]) });
    return chatTurn(db.app, registry, maya, { text: "Create a new release" });
  };
  const releases = async () => Number((await db.t.owner`select count(*)::int as n from delivery.release`)[0].n);
  beforeAll(async () => {
    db = await proposalDb();
    await db.t.owner`insert into ai.settings (tenant_id, zdr_confirmed) values (${T}, true) on conflict do nothing`;
    maya = await db.as("maya", "PM");
  }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC-1 New release needs only the project, and the first reply is the card", async () => {
    expect(chatIntents.find((i) => i.id === "delivery.new-release")).toMatchObject({ tool: "create_release", required: ["projectKey"] });
    expect((await turn({ projectKey: "CON" })).pending[0]).toMatchObject({ tool: "create_release", title: "New release for CON · Contoso Portal" });
  });

  it("AC-2 the card's fields, the next version and today's start filled in, the eligible proposals to tick", async () => {
    const fields = (await turn({ projectKey: "CON", name: "November Release" })).pending[0].form!.fields;
    expect(fields.map((f) => f.name)).toEqual(["name", "version", "category", "startDate", "targetDate", "proposalKeys", "reassign"]);
    expect(fields.find((f) => f.name === "version")!.value).toMatch(/^v\d+\.\d+\.0$/);
    expect(fields.find((f) => f.name === "startDate")!.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const ticks = fields.find((f) => f.name === "proposalKeys");
    expect(ticks?.kind === "checks" ? ticks.options.find((o) => o.value === "CON-012") : null).toMatchObject({ detail: "in v2.4.0 · Untracked" });
    expect(ticks?.kind === "checks" ? ticks.options.map((o) => o.value) : []).not.toContain("CON-014");
  });

  it("AC-6 AC-7 each edit is checked on its field, and a ticked proposal in an open release is warned about", async () => {
    const t = await turn({ projectKey: "CON" });
    const check = (edits: Record<string, string>) => checkCardEdits(db.app, registry, maya, t.conversationId, t.pending[0].id, edits);
    expect(await check({ startDate: "2026-12-02", targetDate: "2026-12-01" })).toMatchObject({ field: "targetDate", message: expect.stringMatching(/before the start date/) });
    expect(await check({ startDate: "2026-02-30" })).toMatchObject({ field: "startDate" });
    expect(await check({ version: "v2.4.0" })).toMatchObject({ field: "version", message: "CON already has a release v2.4.0" });
    expect(await check({ proposalKeys: "CON-014" })).toMatchObject({ field: "proposalKeys", message: "CON-014 is Building; only Verified or Released proposals can go in a release" });
    expect(await check({ proposalKeys: "CON-012" })).toMatchObject({ field: "proposalKeys", message: "CON-012 is already in CON v2.4.0 (Untracked); confirm moving it, or take it out there first" });
    expect(await check({ proposalKeys: "CON-012", reassign: "CON-012" })).toEqual({ note: "CON-012 is already in CON v2.4.0 (Untracked): it moves to this release" });
  });

  it("AC-5 AC-8 AC-9 an unticked move is refused and the card stays; ticked, it creates the release, says so and links to it", async () => {
    const t = await turn({ projectKey: "CON", version: "v8.1.0" });
    const confirm = (edits: Record<string, string>) => confirmAction(db.app, registry, maya, t.conversationId, t.pending[0].id, { edits: { ...FULL, ...edits } });
    await expect(confirm({ proposalKeys: "CON-012" })).rejects.toThrow(/CON-012 is already in CON v2.4.0 \(Untracked\); confirm moving it/);
    const done = await confirm({ proposalKeys: "CON-012", reassign: "CON-012" });
    expect(done.action.look?.done).toBe("Created November Release (v8.1.0) · 1 proposal");
    expect(done.result).toMatchObject({ moved: [{ key: "CON-012", from: "v2.4.0" }], open: { label: "Open the release", url: "/delivery/releases/CON/v8.1.0" } });
  });

  it("AC-9 no card without the right; cancel writes nothing; a version taken meanwhile is refused and leaves the card open", async () => {
    const refused = await turn({ projectKey: "FLT" });
    expect(refused.pending).toEqual([]);
    const cancelled = await turn({ projectKey: "CON", version: "v8.2.0" });
    const before = await releases();
    await cancelAction(db.app, maya, cancelled.conversationId, cancelled.pending[0].id);
    expect(await releases()).toBe(before);
    const raced = await turn({ projectKey: "CON", version: "v8.3.0" });
    await createRelease(ctxFor(maya), { ...FULL, projectKey: "CON", version: "v8.3.0" });
    await expect(confirmAction(db.app, registry, maya, raced.conversationId, raced.pending[0].id, { edits: FULL })).rejects.toThrow(/already has a release v8.3.0/);
    await expect(confirmAction(db.app, registry, maya, raced.conversationId, raced.pending[0].id, { edits: { ...FULL, version: "v8.4.0" } })).resolves.toBeTruthy();
  });
});
