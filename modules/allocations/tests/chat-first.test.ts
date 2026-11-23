import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, onTestFinished, vi } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { configureAi } from "@amax/ai";
import { fakeProvider } from "@amax/ai/fake";
import { createRegistry } from "@amax/mcp";
import { chatTurn, confirmAction } from "@amax/chat";
import manifest from "../module";
import { allocationsDatabase, T, TODAY } from "./setup";

const root = join(import.meta.dirname, "..");

describe("054 AC-1 allocations screens have no forms or direct writes", () => {
  it("AC1 no form, dialog or server action in the allocations UI", () => {
    expect(existsSync(join(root, "actions.ts"))).toBe(false);
    for (const f of readdirSync(join(root, "ui")).filter((n) => n.endsWith(".tsx"))) {
      const src = readFileSync(join(root, "ui", f), "utf8");
      expect([f, /<form|<dialog|"use server"|from "\.\.\/actions"|from "\.\.\/server\/services"/.test(src)]).toEqual([f, false]);
    }
  });
});

describe.skipIf(!hasDb)("054 copy month waits for chat's confirm; a grid row pin reads one row (Postgres)", () => {
  let db: Awaited<ReturnType<typeof allocationsDatabase>>;
  let registry: ReturnType<typeof createRegistry>;
  beforeAll(async () => {
    db = await allocationsDatabase();
    registry = createRegistry([...(await Promise.all((manifest.dependsOn ?? []).map((id) => import(`@amax/${id}/module`).then((m) => m.default)))), manifest]);
    await db.t.owner`insert into ai.settings (tenant_id, zdr_confirmed) values (${T}, true) on conflict do nothing`;
  }, 60_000);
  afterAll(() => db?.t.drop());

  const march = async () => Number((await db.tx((tx) => tx.execute(sql`select count(*)::int as n from allocations.allocation where month = '2027-03-01'`)))[0].n);

  it("AC2 copy_allocations_to_next_month becomes a confirm card and copies only once confirmed, audited as chat", async () => {
    const maya = await db.as("maya", "PM");
    configureAi({ provider: fakeProvider([() => ({ toolCalls: [{ type: "tool_use", id: "c1", name: "copy_allocations_to_next_month", input: { from: "2027-02" } }] }), () => ({ text: "Confirm?" })]), db: db.app, model: "claude-haiku-5-5" });
    const before = await march();
    const turn = await chatTurn(db.app, registry, maya, { text: "Copy Delivery team allocations from February (2027-02) to the next month" });
    expect(turn.pending.map((p) => p.tool)).toEqual(["copy_allocations_to_next_month"]);
    expect(await march()).toBe(before);
    await confirmAction(db.app, registry, maya, turn.conversationId, turn.pending[0].id);
    expect(await march()).toBeGreaterThan(before);
    const [audit] = await db.tx((tx) => tx.execute(sql`select source from core.audit_event where action = 'allocations.month.copy' order by seq desc limit 1`));
    expect(audit.source).toBe("chat");
  }, 60_000);

  it("AC3 get_allocation resolves a grid row to exactly that person and project, and a total row to the person", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: TODAY });
    onTestFinished(() => { vi.useRealTimers(); });
    const maya = await db.as("maya", "PM");
    const [con] = await db.tx((tx) => tx.execute(sql`select id from delivery.project where key = 'CON'`));
    const row = await registry.call(maya, "get_allocation", { person: "LL-0417", projectId: con.id }, { source: "chat" });
    expect(row).toMatchObject({ person: "Kasun Dias", project: "Contoso Portal", percents: [20, 20, 20, null, null, null] });
    expect(await registry.call(maya, "get_allocation", { person: "LL-0417" }, { source: "chat" })).toMatchObject({ employeeNo: "LL-0417", totals: [100, 100, 100, 0, 0, 0] });
  }, 60_000);
});
