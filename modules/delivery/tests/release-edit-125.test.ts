import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import { configureAi } from "@amax/ai";
import { fakeProvider } from "@amax/ai/fake";
import { createRegistry } from "@amax/mcp";
import { chatTurn, checkCardEdits, confirmAction } from "@amax/chat";
import delivery from "../module";
import { createRelease, recordDeployment, updateRelease } from "../server/services";
import { ctxFor } from "../server/context";
import { proposalDb, T } from "./proposal-db";

const OPEN = { name: "Winter", category: "uat", startDate: "2026-10-01", targetDate: "2099-12-31" };

describe.skipIf(!hasDb)("125 the edit card in chat (Postgres)", () => {
  let db: Awaited<ReturnType<typeof proposalDb>>;
  let maya: Viewer;
  const registry = createRegistry([delivery]);
  const turn = (input: Record<string, unknown>) => {
    configureAi({ db: db.app, model: "m", provider: fakeProvider([() => ({ toolCalls: [{ type: "tool_use" as const, id: "c", name: "update_release", input }] }), () => ({ text: "Check the card." })]) });
    return chatTurn(db.app, registry, maya, { text: "Edit the release" });
  };
  beforeAll(async () => {
    db = await proposalDb();
    await db.t.owner`insert into ai.settings (tenant_id, zdr_confirmed) values (${T}, true) on conflict do nothing`;
    maya = await db.as("maya", "PM");
    await createRelease(ctxFor(maya), { ...OPEN, projectKey: "CON", version: "e1" });
    await createRelease(ctxFor(maya), { ...OPEN, projectKey: "CON", version: "e2", category: "dev" });
    await recordDeployment(ctxFor(maya), { projectKey: "CON", version: "e2", environment: "Dev" });
  }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC-9 the edit card is filled from the release, checks each edit, saves, and says what it updated", async () => {
    const t = await turn({ projectKey: "CON", version: "e1" });
    const card = t.pending[0];
    expect(card).toMatchObject({ tool: "update_release", title: "Edit CON e1 · Winter" });
    expect(card.form!.fields.map((f) => [f.name, f.value])).toEqual([["name", "Winter"], ["category", "uat"], ["startDate", "2026-10-01"], ["targetDate", "2099-12-31"]]);
    const check = (edits: Record<string, string>) => checkCardEdits(db.app, registry, maya, t.conversationId, card.id, edits);
    expect(await check({ targetDate: "2026-09-01" })).toMatchObject({ field: "targetDate", message: expect.stringMatching(/before the start date/) });
    expect(await check({ name: "x".repeat(121) })).toMatchObject({ field: "name" });
    const done = await confirmAction(db.app, registry, maya, t.conversationId, card.id, { edits: { name: "Winter Release", targetDate: "2099-06-30" } });
    expect(done.action.look?.done).toBe("Updated Winter Release (e1)");
    expect((await db.t.owner`select name, target_date::text as target from delivery.release where version = 'e1'`)[0]).toEqual({ name: "Winter Release", target: "2099-06-30" });
  });

  it("AC-9 the card shows what chat passed; an untracked release is tracked with its category and dates, its name kept, and refused on the field without them", async () => {
    const given = await turn({ projectKey: "CON", version: "e1", targetDate: "2099-07-31" });
    expect(given.pending[0].form!.fields.find((f) => f.name === "targetDate")!.value).toBe("2099-07-31");
    const t = await turn({ projectKey: "CON", version: "v2.5.0" });
    const check = (edits: Record<string, string>) => checkCardEdits(db.app, registry, maya, t.conversationId, t.pending[0].id, edits);
    expect(await check({ category: "uat" })).toMatchObject({ field: "startDate" });
    await confirmAction(db.app, registry, maya, t.conversationId, t.pending[0].id, { edits: { category: "uat", startDate: "2026-10-01", targetDate: "2099-12-31" } });
    expect((await db.t.owner`select name, category, status from delivery.release where version = 'v2.5.0'`)[0]).toEqual({ name: "v2.5.0", category: "uat", status: "in_progress" });
  });

  // One rule for a partial first tracking (missingForTracking): the card and the service refuse the same field, in the same words.
  it.each([
    [{ category: "uat" }, "startDate"],
    [{ startDate: "2026-10-01" }, "category"],
    [{ targetDate: "2099-12-31" }, "category"],
    [{ category: "uat", startDate: "2026-10-01" }, "targetDate"],
    [{ startDate: "2026-10-01", targetDate: "2099-12-31" }, "category"],
  ])("AC-9 a partial first tracking %o is refused on %s by the card and by update_release alike", async (edits, field) => {
    await db.t.owner`insert into delivery.release (tenant_id, project_id, version) select ${T}, id, 'u1' from delivery.project where key = 'CON' on conflict do nothing`;
    const t = await turn({ projectKey: "CON", version: "u1" });
    const message = "CON u1 isn't tracked yet: give its category, start and target together";
    expect(await checkCardEdits(db.app, registry, maya, t.conversationId, t.pending[0].id, edits)).toMatchObject({ field, message });
    await expect(updateRelease(ctxFor(maya), { projectKey: "CON", version: "u1", ...edits })).rejects.toThrow(message);
    expect((await db.t.owner`select category from delivery.release where version = 'u1'`)[0].category).toBeNull();
  });

  it("AC-9 AC-10 no edit card for a completed release, nor for a PM of another project", async () => {
    expect((await turn({ projectKey: "CON", version: "e2" })).pending).toEqual([]);
    expect((await turn({ projectKey: "FLT", version: "v1.8.0" })).pending).toEqual([]);
  });
});
