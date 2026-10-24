import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { EVENTS as TIME } from "@amax/time/contracts";
import { timeHandlers } from "../server/time-sync";
import { financeDb, T } from "./db";

describe.skipIf(!hasDb)("072 Finance follows reopened weeks and locked changes (Postgres)", () => {
  let db: Awaited<ReturnType<typeof financeDb>>;
  beforeAll(async () => { db = await financeDb(); await db.tick(); }, 120_000);
  afterAll(() => db?.t.drop());

  const call = async (key: string, tool: string, args: object) => db.registry.call(await db.as(key), tool, args, { source: "mcp" }) as Promise<Record<string, unknown>>;
  const billable = async () => Number((await db.q(sql`select b.hours from finance.billable b join finance.contract c on c.id = b.contract_id join delivery.project p on p.id = c.project_id
    where p.key = 'FLT' and b.period = '2026-10' and b.source = 'time'`))[0]?.hours ?? 0);
  const settle = async () => { await db.tick(); await db.tick(); };
  const week = { person: "tharushi@lumenlabs.test", week: "2026-W42" };

  it("AC1 AC2 TIM-T07 approve, reopen and approve again move billable to H and back; an applied change request moves it; repeats change nothing", async () => {
    const before = await billable();
    const [{ h }] = await db.q(sql`select coalesce(sum(e.hours), 0)::float as h from time.entry e join time.week w on w.id = e.week_id join auth.user u on u.id = e.user_id
      join delivery.project p on p.id = e.project_id where u.email = 'tharushi@lumenlabs.test' and w.iso_week = 42 and p.key = 'FLT' and e.billable and e.deleted_at is null`);
    await call("tharushi", "submit_week", { week: "2026-W42" });
    await call("sahan", "approve_week", week);
    await settle();
    const H = await billable();
    expect(H).toBeCloseTo(before + Number(h), 2);

    await call("sahan", "reopen_week", { ...week, reason: "Fix Wednesday" });
    await settle();
    expect(await billable()).toBeCloseTo(before, 2);
    await call("tharushi", "submit_week", { week: "2026-W42" });
    await call("sahan", "approve_week", week);
    await settle();
    expect(await billable()).toBeCloseTo(H, 2);

    const [e] = await db.q(sql`select e.id, e.hours::float as hours from time.entry e join auth.user u on u.id = e.user_id join delivery.project p on p.id = e.project_id
      join time.week w on w.id = e.week_id where u.email = 'tharushi@lumenlabs.test' and w.iso_week = 42 and p.key = 'FLT' and e.billable and e.hours >= 1 and e.deleted_at is null limit 1`);
    const { id } = await call("tharushi", "request_time_change", { entryId: e.id, hours: Number(e.hours) - 1, reason: "Left an hour early" });
    await call("sahan", "decide_change_request", { requestId: id, decision: "apply" });
    await settle();
    expect(await billable()).toBeCloseTo(H - 1, 2);

    const approved = { id: randomUUID(), name: TIME.weekApproved, payload: { week: "2026-W42" } };
    for (let i = 0; i < 2; i++) await db.tx((tx) => timeHandlers[0].handle({ tx, tenantId: T, event: approved }));
    expect(await billable()).toBeCloseTo(H - 1, 2);
  }, 120_000);
});
