import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import { configureRuntime } from "@amax/core/server";
import { installAuthorizer, upsertPasswordUser, viewerForUser, type Viewer } from "@amax/auth";
import { configureAi } from "@amax/ai";
import { fakeProvider } from "@amax/ai/fake";
import { createRegistry } from "@amax/mcp";
import { chatTurn, todayNote } from "../src/engine";
import { ANSWER_INSTRUCTIONS, answerTool } from "../src/answers";

// 084: quick replies. The model offers answers to its question; the turn returns them; nothing is written.
const T = "00000000-0000-4000-8000-000000000a84";

describe("084 offer_answers", () => {
  it("AC1 takes 2 to 6 answers of at most 60 characters, drops repeats, and writes nothing", async () => {
    let got: unknown;
    const tool = answerTool((a) => { got = a; });
    const schema = tool.input as unknown as { safeParse: (x: unknown) => { success: boolean } };
    expect(schema.safeParse({ question: "Which project?", answers: ["CON"] }).success).toBe(false);
    expect(schema.safeParse({ question: "Which project?", answers: Array(7).fill("x").map((x, i) => x + i) }).success).toBe(false);
    expect(schema.safeParse({ question: "Which project?", answers: ["a", "b".repeat(61)] }).success).toBe(false);
    expect(await tool.run({ question: "Which project?", answers: ["CON", "CON"] } as never)).toMatchObject({ status: "not_offered" });
    expect(got).toBeUndefined();
    expect(await tool.run({ question: "Which project?", answers: ["CON · Contoso Portal", "FLT · Fleet Tracker"] } as never)).toMatchObject({ status: "awaiting_answer" });
    expect(got).toEqual({ question: "Which project?", options: ["CON · Contoso Portal", "FLT · Fleet Tracker"] });
    expect(ANSWER_INSTRUCTIONS).toMatch(/instead of listing them in text/);
    expect(ANSWER_INSTRUCTIONS).toMatch(/Never offer answers to\ssomething the user already said/);
  });
});

describe.skipIf(!hasDb)("084 a turn with quick replies (Postgres)", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  let maya: Viewer;
  const registry = createRegistry([]);
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

  it("AC1 AC2 the turn returns the answers, offer_answers isn't counted as a tool run, and the next turn has none", async () => {
    configureAi({ db: app, model: "m", provider: fakeProvider([
      () => ({ toolCalls: [{ type: "tool_use" as const, id: "a1", name: "offer_answers", input: { question: "Which project is it for?", answers: ["CON · Contoso Portal", "FLT · Fleet Tracker"] } }] }),
      () => ({ text: "Which project is it for?" }),
      () => ({ text: "Got it: Contoso Portal." }),
    ]) });
    const first = await chatTurn(app, registry, maya, { text: "Export invoices to PDF, estimate 16 h" });
    expect(first.answers).toEqual({ question: "Which project is it for?", options: ["CON · Contoso Portal", "FLT · Fleet Tracker"] });
    expect(first.toolsRun).toEqual([]);
    expect(first.pending).toEqual([]);
    const next = await chatTurn(app, registry, maya, { conversationId: first.conversationId, text: "CON · Contoso Portal" });
    expect(next.answers).toBeUndefined();
  });

  it("AC6 every turn tells the model the user's date in their entity's zone, so \"today\" needs no question", async () => {
    const seen: string[] = [];
    configureAi({ db: app, model: "m", provider: fakeProvider([(req) => { seen.push(JSON.stringify(req)); return { text: "Logged." }; }]) });
    await chatTurn(app, registry, maya, { text: "Log 2 h on Contoso Portal today" });
    const now = new Date("2026-11-05T20:00:00Z");
    expect(await todayNote(app, maya, now)).toContain("Today is Thursday 2026-11-05 for the user (UTC)");
    expect(seen[0]).toContain("Today is ");
    expect(seen[0]).toContain("never ask for a date the user already gave that way");
  });
});
