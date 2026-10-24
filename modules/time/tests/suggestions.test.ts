import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import { createRegistry } from "@amax/mcp";
import { chatSuggestions, pageLabel } from "../chat-suggestions";
import manifest from "../module";
import { timeDb } from "./db";

// What the page offers a viewer: the suggestions for the route whose tool they hold and whose check passes,
// in order (apps/web's pageInfo then keeps the first three).
describe.skipIf(!hasDb)("070 amendment 4: Time's chat suggestions (Postgres)", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  const registry = createRegistry([manifest]);
  beforeAll(async () => { db = await timeDb(); }, 60_000);
  afterAll(() => db?.t.drop());

  const offered = async (v: Viewer, route: string, params: Record<string, string>) => {
    const tools = new Set(registry.toolsFor(v).map((t) => t.name));
    const out: string[] = [];
    for (const s of chatSuggestions.filter((x) => x.routes.includes(route) && tools.has(x.tool))) if (!s.when || (await s.when(v as never, params))) out.push(s.label);
    return out;
  };

  it("AC42 and AC45 a draft week offers a fix and a submit, a locked one a change request; Team time offers approvals and reminders only to approvers", async () => {
    const [tharushi, kasun, maya] = await Promise.all([db.as("tharushi"), db.as("kasun"), db.as("maya")]);
    const week = { week: "2026-W42" };
    expect(await offered(tharushi, "my/:week", week)).toEqual(["Fix an entry", "Submit my week", "What did I log this week?"]);
    expect(await offered(kasun, "my/:week", week)).toEqual(["Ask for a change", "What did I log this week?"]);
    expect(await offered(kasun, "w/:week", week)).toEqual(["Who hasn't submitted?"]);
    expect(await offered(maya, "w/:week", week)).toEqual(["Approve submitted timesheets", "Remind everyone who hasn't submitted", "Fix someone's hours", "Who hasn't submitted?"]);
    expect([pageLabel(week), pageLabel({})]).toEqual(["Week of Oct 12", null]);
  });
});
