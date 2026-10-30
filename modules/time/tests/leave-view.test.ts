import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@amax/db";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import { weekAnomalies } from "../server/anomalies";
import { teamGrid } from "../server/grid";
import { dayState } from "../server/reminders";
import type { WeekRow } from "../server/weeks";
import { T, timeDb } from "./db";

// 073 final review (blocker), fixed after the cap: Time shows approved leave only where Leave's own rule lets the viewer
// see it. Ayesha is on approved leave Fri Oct 16 (W42). Maya, her manager, sees it. Sahan viewed as Finance sees her
// week (time:team) but not her leave (Finance has no leave:team), so for him that day is never shown as leave: the
// Team time cell, the approve check and the reminder card all treat it as unknown.
describe.skipIf(!hasDb)("073 leave is shown only to those who may see it (Postgres)", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  beforeAll(async () => { db = await timeDb(); }, 60_000);
  afterAll(() => db?.t.drop());
  const W42 = { year: 2026, week: 42 };
  const FRI = "2026-10-16";
  const viewers = async () => ({ manager: await db.as("maya"), finance: await db.as("sahan", "Finance") });

  it.each([["manager", true], ["finance", false]] as const)("Team time, as the %s: Ayesha's Friday shown as leave: %s", async (who, seesLeave) => {
    const v: Viewer = (await viewers())[who];
    const g = await teamGrid(v, W42, {});
    const ayesha = g.grid.find((r) => r.personName === "Ayesha Rahman")!;
    expect(ayesha).toBeDefined();
    expect(ayesha.cells.find((c) => c.day === FRI)!.state === "leave").toBe(seesLeave);
  }, 60_000);

  it.each([["manager", false], ["finance", true]] as const)("the approve check, as the %s: Friday flagged as possibly leave: %s", async (who, hidden) => {
    const v: Viewer = (await viewers())[who];
    const [week] = await db.q(sql`select w.* from time.week w join auth.user u on u.id = w.user_id where u.email = 'ayesha@lumenlabs.test' and w.iso_week = 42`);
    const checks = await withTenant(db.app, T, (tx) => weekAnomalies(tx, week as WeekRow, v));
    const missing = checks.find((c) => c.startsWith("missing")) ?? "";
    expect(missing.includes("Fri Oct 16")).toBe(hidden);
    expect(missing.includes("their leave isn't visible to you")).toBe(hidden);
  }, 60_000);

  it.each([["manager", true], ["finance", false]] as const)("the reminder card, as the %s: Ayesha skipped as on leave: %s", async (who, onLeave) => {
    const v: Viewer = (await viewers())[who];
    const ayesha = await db.idOf("ayesha");
    const state = await withTenant(db.app, T, (tx) => dayState(tx, T, FRI, [ayesha], v));
    expect(state.onLeave.has(ayesha)).toBe(onLeave);
  }, 60_000);
});
