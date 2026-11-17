import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { windowMonths } from "@amax/allocations/contracts";
import type { Pulse } from "../server/pulse-types";
import type { Report } from "../server/view";
import { reportsDb } from "./db";

describe.skipIf(!hasDb)("delivery pulse (Postgres)", () => {
  let db: Awaited<ReturnType<typeof reportsDb>>;
  beforeAll(async () => { db = await reportsDb(); }, 240_000);
  afterAll(() => db?.t.drop());

  it("AC4 AC5 AC6 AC7 AC9 each card reads through one tool, whole or one card", async () => {
    const p = await db.call<Pulse>("maya", "get_delivery_pulse", {});
    expect(p.utilisation).toBe(84);
    expect(p.capacity.months.map((m) => m.month)).toEqual(windowMonths(new Date(), 6));
    expect(p.allocation.months.map((m) => m.month)).toEqual(windowMonths(new Date(), 6));
    expect(p.allocation.months.find((m) => m.label === "December")?.over).toEqual([{ name: "Ayesha Rahman", percent: 120 }]);
    expect(p.hours.rows.map((r) => r.name)).toEqual(["Contoso Portal", "Fleet Tracker", "HR Insights"]);
    expect(p.hours.rows.every((r) => r.drift !== null && (Math.abs(r.drift) > p.hours.limit) === Boolean(r.flag))).toBe(true);
    expect(p.away.rows.map((r) => [r.name, r.startsOn])).toEqual(expect.arrayContaining([["Ayesha Rahman", "2026-10-16"], ["Ayesha Rahman", "2026-10-19"]]));
    const one = await db.call<{ months: unknown[] }>("maya", "get_delivery_pulse", { card: "capacity" });
    expect(one.months).toHaveLength(6);
  }, 120_000);

  it("AC15 an Admin sees everyone allocated this month; a PM sees only the people on their projects", async () => {
    const everyone = (await db.call<Report>("maya", "get_utilisation", {})).rows;
    await db.t.owner`update delivery.project set manager_user_id = (select id from auth.user where email = 'sahan@lumenlabs.test') where key = 'FLT'`;
    const pm = (await db.call<Report>("sahan", "get_utilisation", {}, "PM")).rows;
    expect(everyone.length).toBeGreaterThan(pm.length);
    expect(pm.length).toBeGreaterThan(0);
    expect(pm.every((r) => everyone.some((e) => e.personId === r.personId))).toBe(true);
    expect((await db.call<Report>("maya", "get_utilisation", {})).team.utilisation).toBe(84);
  }, 120_000);

  it("087 the group is chosen: Everyone for a PM, Your people for an Admin, each carried on the report", async () => {
    await db.t.owner`update delivery.project set manager_user_id = (select id from auth.user where email = 'sahan@lumenlabs.test') where key = 'FLT'`;
    const mine = await db.call<Report>("sahan", "get_utilisation", {}, "PM");
    const all = await db.call<Report>("sahan", "get_utilisation", { group: "everyone" }, "PM");
    expect([mine.group, all.group]).toEqual(["mine", "everyone"]);
    expect(all.rows.length).toBeGreaterThanOrEqual(mine.rows.length);
    expect(mine.rows.every((r) => all.rows.some((e) => e.personId === r.personId))).toBe(true);
    const admin = await db.call<Report>("maya", "get_utilisation", {});
    const adminMine = await db.call<Report>("maya", "get_utilisation", { group: "mine" });
    expect([admin.group, adminMine.group]).toEqual(["everyone", "mine"]);
    expect(adminMine.rows.length).toBeLessThanOrEqual(admin.rows.length);
    expect(adminMine.rows.every((r) => admin.rows.some((e) => e.personId === r.personId))).toBe(true);
    const pulse = await db.call<Pulse>("sahan", "get_delivery_pulse", { group: "everyone", card: "utilisation" });
    expect(pulse).toMatchObject({ target: expect.any(Number) });
  }, 120_000);

  it("AC11 a viewer who may see no one's hours gets cards with no people in them", async () => {
    const p = await db.call<Pulse>("sahan", "get_delivery_pulse", {}, "Finance");
    expect([p.utilisation, p.away.rows, p.allocation.months.flatMap((m) => m.over)]).toEqual([null, [], []]);
  }, 120_000);
});
