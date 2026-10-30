import { z } from "zod";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import type { McpToolDef } from "@amax/core";
import { configureRuntime, defineService } from "@amax/core/server";
import { installAuthorizer, upsertPasswordUser, viewerForUser, type Viewer } from "@amax/auth";
import { configureAi } from "@amax/ai";
import { fakeProvider } from "@amax/ai/fake";
import { createRegistry, ToolError } from "@amax/mcp";
import { claimChoice, ActionFailedError, cancelAction, chatTurn, confirmAction, NotPendingError } from "../src/engine";

// 076: a choice card is 2–4 ordinary pending cards sharing a `choice`; each is checked like a write call, and only one runs.
const T = "00000000-0000-4000-8000-000000000a76";
const ran: number[] = [];
const save = defineService({ name: "sample.hours.set", action: "sample.thing.create", resource: "sample.thing", input: z.object({ id: z.string(), hours: z.number() }),
  run: async (_tx, input) => { ran.push(input.hours); return { result: input, resourceId: input.id, after: input }; } });
const setHours = { name: "set_hours", description: "Set an entry's hours.", input: z.object({ id: z.string(), hours: z.number() }).strict(), permission: "sample.thing.create", scope: "write", service: save,
  propose: async (_v: Viewer, i: { hours: number }) => { if (i.hours > 24) throw new ToolError("a day can't have more than 24 h", "invalid_input"); },
  run: async (v: Viewer, input: { id: string; hours: number }) => save({ tenantId: v.tenantId, actor: { id: `user:${v.userId}`, kind: "user" }, source: "chat", viewer: v }, input) } as unknown as McpToolDef;
const option = (label: string, hours: number) => ({ label, tool: "set_hours", input: { id: label, hours } });
// 076 amendment 1: a write that needs a reason only the person can type.
const asked: { hours: number; reason: string }[] = [];
const fix = defineService({ name: "sample.hours.ask", action: "sample.thing.create", resource: "sample.thing", input: z.object({ id: z.string(), hours: z.number(), reason: z.string() }),
  run: async (_tx, input) => { asked.push({ hours: input.hours, reason: input.reason }); return { result: input, resourceId: input.id, after: input }; } });
const askFix = { name: "ask_fix", description: "Ask for an entry's hours to change.", input: z.object({ id: z.string(), hours: z.number(), reason: z.string().trim().min(3) }).strict(),
  permission: "sample.thing.create", scope: "write", service: fix,
  card: async (_v: Viewer, i: { hours: number; reason: string }) => ({ title: `Ask to set ${i.hours} h`, lines: [{ label: "Hours", value: `${i.hours} h` }, { label: "Reason", value: i.reason }] }),
  run: async (v: Viewer, input: { id: string; hours: number; reason: string }) => fix({ tenantId: v.tenantId, actor: { id: `user:${v.userId}`, kind: "user" }, source: "chat", viewer: v }, input) } as unknown as McpToolDef;
const ask = { field: "reason", label: "Why is this entry wrong?" };

describe.skipIf(!hasDb)("076 choice cards", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  let maya: Viewer;
  const registry = createRegistry([{ id: "sample", mcpTools: [setHours, askFix] }]);
  const offer = async (options: { label: string; tool: string; input: Record<string, unknown> }[], extra: Record<string, unknown> = {}) => {
    const seen: unknown[] = [];
    configureAi({ db: app, model: "m", provider: fakeProvider([
      () => ({ toolCalls: [{ type: "tool_use" as const, id: "c1", name: "offer_choices", input: { question: "Which entry should change?", options, ...extra } }] }),
      (req) => { seen.push(JSON.stringify(req)); return { text: "Pick one." }; },
    ]) });
    return { turn: await chatTurn(app, registry, maya, { text: "change Wednesday to 6 h" }), seen };
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

  it("AC7 options are checked like write calls: a refused one is left out; one left is a plain card; none is no card", async () => {
    const { turn, seen } = await offer([option("agent", 3.3), option("mine", 0.7), option("too much", 30)]);
    expect(turn.pending.map((p) => [p.input.id, p.choice?.label])).toEqual([["agent", "agent"], ["mine", "mine"]]);
    expect(new Set(turn.pending.map((p) => p.choice?.id)).size).toBe(1);
    expect(seen[0]).toContain("a day can't have more than 24 h");
    expect(turn.toolsRun).not.toContain("offer_choices");
    const single = (await offer([option("ok", 2), option("no", 40)])).turn.pending;
    expect(single.map((p) => [p.input.id, p.choice])).toEqual([["ok", undefined]]);
    expect((await offer([option("no", 40), option("nor", 50)])).turn.pending).toEqual([]);
  });

  it("AC7 confirming one option runs only it; the other is then refused as cancelled", async () => {
    const { turn } = await offer([option("a", 1), option("b", 2)]);
    ran.length = 0;
    await confirmAction(app, registry, maya, turn.conversationId, turn.pending[0].id);
    await expect(confirmAction(app, registry, maya, turn.conversationId, turn.pending[1].id)).rejects.toMatchObject({ decision: "cancelled" });
    expect(ran).toEqual([1]);
  });

  // 073 review round 1: exactly one write, never none: of options confirmed at once, the loser never cancels the winner.
  it.each([2, 3])("AC7 %i options confirmed at once: exactly one writes, the others are refused as cancelled", async (n) => {
    const { turn } = await offer([option("c", 3), option("d", 4), option("e", 5)].slice(0, n));
    ran.length = 0;
    const out = await Promise.allSettled(turn.pending.map((p) => confirmAction(app, registry, maya, turn.conversationId, p.id)));
    expect(ran).toHaveLength(1);
    expect(out.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    expect(out.filter((o) => o.status === "rejected").map((o) => (o as PromiseRejectedResult).reason.decision)).toEqual(Array(n - 1).fill("cancelled"));
  });

  // 073 review round 2: a claim that fails (here the idempotency store refuses the insert) surfaces as an error. It is
  // never taken as "another option already ran": nothing is written, no option is recorded as not chosen, and the card
  // stays open, so the same confirm works once the store is back. (Before the fix, a swallowed failure still surfaced
  // here only because Postgres aborts the transaction on a failed insert; the claim no longer relies on that.)
  it("AC7 a failed claim is an error, not a decision; the card stays open and confirms afterwards", async () => {
    const { turn } = await offer([option("h", 8), option("i", 9)]);
    ran.length = 0;
    await t.owner.unsafe(`create function core.t073_fail() returns trigger language plpgsql as $$ begin raise exception 'idempotency store down'; end $$;
      create trigger t073_fail before insert on core.idempotency for each row execute function core.t073_fail()`);
    try {
      const failed = await confirmAction(app, registry, maya, turn.conversationId, turn.pending[0].id).catch((e: unknown) => e);
      expect(failed).toBeInstanceOf(Error);
      expect((failed as { decision?: string }).decision).not.toBe("cancelled");
      expect(ran).toEqual([]);
      const [row] = await withTenant(app, T, (tx) => tx.execute(sql`select pending, decided from chat.conversation where id = ${turn.conversationId}`));
      expect([(row.pending as unknown[]).length, Object.values((row.decided ?? {}) as object)]).toEqual([2, []]);
    } finally {
      await t.owner.unsafe("drop trigger t073_fail on core.idempotency; drop function core.t073_fail()");
    }
    await confirmAction(app, registry, maya, turn.conversationId, turn.pending[0].id);
    expect(ran).toEqual([8]);
  });

  // 073 review round 3: the same option confirmed twice at once (a double tap) writes once and both confirms succeed;
  // neither is reported as cancelled, and the sibling option is the one cancelled. The exact interleaving is covered
  // by the claimChoice decision table below.
  it("AC7 the same option confirmed twice at once writes once; both confirms succeed", async () => {
    const { turn } = await offer([option("j", 10), option("k", 11)]);
    ran.length = 0;
    const out = await Promise.allSettled([0, 1].map(() => confirmAction(app, registry, maya, turn.conversationId, turn.pending[0].id)));
    expect(ran).toEqual([10]);
    expect(out.map((o) => o.status)).toEqual(["fulfilled", "fulfilled"]);
    await expect(confirmAction(app, registry, maya, turn.conversationId, turn.pending[1].id)).rejects.toMatchObject({ decision: "cancelled" });
  });

  // 073 review round 4: what claimChoice decides for an option that is no longer pending, by its own recorded decision.
  // Only "cancelled" (a sibling won) means lost. Any other (the same option tried before: confirmed, unknown, failed)
  // goes on, so its own key reports what really happened, and its recorded decision is never rewritten as cancelled.
  // This drives the decision directly with the option already settled: the moment a second confirm reaches it after
  // the first settled, which concurrent calls can't be made to hit on purpose.
  it.each([["cancelled", false], ["confirmed", true], ["unknown", true], ["failed", true]] as const)(
    "AC7 an option no longer pending, recorded %s: goes on %s, and its decision stays", async (decision, goesOn) => {
      const { turn } = await offer([option("m", 12), option("n", 13)]);
      const [a] = turn.pending;
      await withTenant(app, T, (tx) => tx.execute(sql`update chat.conversation set pending = ${JSON.stringify(turn.pending.slice(1))}::jsonb,
        decided = coalesce(decided, '{}'::jsonb) || ${JSON.stringify({ [a.id]: decision })}::jsonb where id = ${turn.conversationId}`));
      expect(await claimChoice(app, maya, turn.conversationId, a)).toBe(goesOn);
      const [row] = await withTenant(app, T, (tx) => tx.execute(sql`select decided from chat.conversation where id = ${turn.conversationId}`));
      expect((row.decided as Record<string, string>)[a.id]).toBe(decision);
    });

  it("AC7 cancel on a choice card cancels every option", async () => {
    const { turn } = await offer([option("e", 5), option("f", 6), option("g", 7)]);
    await cancelAction(app, maya, turn.conversationId, turn.pending[0].id);
    const [row] = await withTenant(app, T, (tx) => tx.execute(sql`select pending, decided from chat.conversation where id = ${turn.conversationId}`));
    expect([(row.pending as unknown[]).length, Object.values(row.decided as object)]).toEqual([0, ["cancelled", "cancelled", "cancelled"]]);
    await expect(confirmAction(app, registry, maya, turn.conversationId, turn.pending[2].id)).rejects.toBeInstanceOf(NotPendingError);
  });

  it("AC12 an asked value: options are carded without it; confirm needs it, checks it, and passes it to the write", async () => {
    const opt = (label: string, hours: number) => ({ label, tool: "ask_fix", input: { id: label, hours } });
    const { turn } = await offer([opt("agent", 4.7), opt("mine", 1.3)], { ask });
    expect(turn.pending.map((p) => [p.input, p.lines, p.choice?.ask])).toEqual([
      [{ id: "agent", hours: 4.7 }, [{ label: "Hours", value: "4.7 h" }], ask], [{ id: "mine", hours: 1.3 }, [{ label: "Hours", value: "1.3 h" }], ask]]);
    const [a, b] = turn.pending;
    for (const answer of [undefined, "  ", "ab"]) {
      await expect(confirmAction(app, registry, maya, turn.conversationId, a.id, answer === undefined ? {} : { answer })).rejects.toMatchObject({ kind: "retry" });
    }
    await expect(confirmAction(app, registry, maya, turn.conversationId, a.id, { answer: "ab" })).rejects.toBeInstanceOf(ActionFailedError);
    asked.length = 0;
    await confirmAction(app, registry, maya, turn.conversationId, b.id, { answer: "  Logged a meeting twice " });
    expect(asked).toEqual([{ hours: 1.3, reason: "Logged a meeting twice" }]);
    await expect(confirmAction(app, registry, maya, turn.conversationId, a.id, { answer: "another reason" })).rejects.toBeInstanceOf(NotPendingError);
    const single = (await offer([opt("only", 2), { label: "too much", tool: "set_hours", input: { id: "x", hours: 99 } }], { ask })).turn.pending;
    expect(single.map((p) => [p.input.id, p.choice?.ask?.field])).toEqual([["only", "reason"]]);
  });
});
