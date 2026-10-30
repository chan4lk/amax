import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { configureAi } from "@amax/ai";
import { fakeProvider } from "@amax/ai/fake";
import { chatTurn } from "@amax/chat";
import { createRegistry } from "@amax/mcp";
import manifest from "../module";
import { ctxFor } from "../server/context";
import { logTime } from "../server/log";
import { T, timeDb } from "./db";

describe.skipIf(!hasDb)("071 possible duplicates are flagged, never refused (Postgres)", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  const registry = createRegistry([manifest]);
  beforeAll(async () => {
    db = await timeDb();
    await db.t.owner`insert into ai.settings (tenant_id, zdr_confirmed) values (${T}, true) on conflict do nothing`;
  }, 60_000);
  afterAll(() => db?.t.drop());

  it("AC12 a log matching a live entry's project, day and note warns on the card, and is still logged", async () => {
    const dinesh = await db.as("dinesh");
    const first = await logTime(ctxFor(dinesh), { projectKey: "FLT", day: "2026-10-26", hours: 2, note: "API work" });
    const input = { projectKey: "FLT", day: "2026-10-26", hours: 1, note: "API work" };
    configureAi({ provider: fakeProvider([() => ({ toolCalls: [{ type: "tool_use", id: "c1", name: "log_time", input }] }), () => ({ text: "Confirm?" })]), db: db.app, model: "claude-haiku-5-5" });
    const [p] = (await chatTurn(db.app, registry, dinesh, { text: "log it" })).pending;
    expect(p.lines).toContainEqual({ label: "Already logged", value: "Fleet Tracker, Mon Oct 26, 2 h, same note" });
    const again = (await registry.call(dinesh, "log_time", input, { source: "mcp" })) as { id: string; possibleDuplicateOf?: string };
    expect(again.id).not.toBe(first.id);
    expect(again.possibleDuplicateOf).toBe(first.id);
    const other = (await registry.call(dinesh, "log_time", { ...input, note: "Release notes" }, { source: "mcp" })) as { possibleDuplicateOf?: string };
    expect(other.possibleDuplicateOf).toBeUndefined();
  }, 60_000);
});
