import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { Report } from "../server/view";
import { reportsDb } from "./db";

describe.skipIf(!hasDb)("072 AC-6 utilisation counts submitted and approved weeks (Postgres)", () => {
  let db: Awaited<ReturnType<typeof reportsDb>>;
  beforeAll(async () => { db = await reportsDb(); }, 240_000);
  afterAll(() => db?.t.drop());

  const hers = async () => (await db.call<Report>("maya", "get_utilisation", {})).rows.find((x) => x.name === "Tharushi Wijesinghe")?.billableHours ?? null;
  const step = async (key: string, tool: string, args: object) => { await db.call(key, tool, args); await db.tick(); await db.tick(); return hers(); };
  const week = { person: "tharushi@lumenlabs.test", week: "2026-W42" };

  it("AC6 a week's hours count while it's submitted or approved, and drop out while it's a draft, sent back or reopened", async () => {
    expect(await step("tharushi", "log_time", { projectKey: "FLT", day: "2026-10-16", hours: 4, billable: true })).toBeNull();
    expect(await step("tharushi", "submit_week", { week: "2026-W42" })).toBe(4);
    expect(await step("maya", "reject_week", { ...week, comment: "Split Friday" })).toBeNull();
    expect(await step("tharushi", "submit_week", { week: "2026-W42" })).toBe(4);
    expect(await step("sahan", "approve_week", week)).toBe(4);
    expect(await step("sahan", "reopen_week", { ...week, reason: "Fix Friday" })).toBeNull();
    const lede = (await db.call<Report>("maya", "get_utilisation", {})).lede;
    expect(lede).toMatch(/^Billable hours from submitted and approved time ÷ available hours/);
  }, 240_000);
});
