import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { contextFor } from "@amax/core/server";
import { createRegistry } from "@amax/mcp";
import manifest from "../module";
import { ctxFor } from "../server/context";
import { setProjectReminders } from "../server/project-reminders";
import { remindDaily, remindDrafts } from "../server/schedules";
import { setSettings } from "../server/settings";
import { T, timeDb } from "./db";

describe.skipIf(!hasDb)("073 scheduled reminders (Postgres)", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  const registry = createRegistry([manifest]);
  beforeAll(async () => { db = await timeDb(); }, 60_000);
  afterAll(() => db?.t.drop());

  const job = () => contextFor.job(T, "time.reminders");
  const entity = async (key: string) => (await db.q(sql`select legal_entity_id as id from auth.user where email = ${`${key}@lumenlabs.test`}`))[0].id as string;
  const daily = async (now: string) => (await remindDaily(job(), { legalEntityId: await entity("kasun"), now })).reminded;
  const dayRows = (day: string) => db.q(sql`select u.name from time.reminder r join auth.user u on u.id = r.user_id where r.day = ${day} order by u.name`);

  it("AC5 off until set; at the entity's local time on a working day it reminds those with nothing logged, once; a PM can switch a project off", async () => {
    expect(await daily("2026-10-21T11:00:00Z")).toBe(0);
    const maya = await db.as("maya");
    await setSettings(ctxFor(maya), { dailyReminderAt: "16:00" });
    expect(await daily("2026-10-21T10:00:00Z")).toBe(0);
    const first = await daily("2026-10-21T11:00:00Z");
    expect(first).toBeGreaterThan(0);
    expect((await dayRows("2026-10-21")).map((r) => r.name)).toEqual(expect.arrayContaining(["Kasun Dias", "Tharushi Wijesinghe"]));
    expect(await daily("2026-10-21T11:15:00Z")).toBe(0);
    expect(await daily("2026-10-24T11:00:00Z")).toBe(0);
    await expect(setProjectReminders(ctxFor(await db.as("kasun")), { projectKey: "FLT", enabled: false })).rejects.toThrow();
    const projects = await db.q(sql`select distinct p.key from time.entry e join delivery.project p on p.id = e.project_id join auth.user u on u.id = e.user_id
      where u.email = 'dinesh@lumenlabs.test' and e.deleted_at is null`);
    for (const p of projects) await setProjectReminders(ctxFor(maya), { projectKey: p.key as string, enabled: false });
    await registry.call(await db.as("kasun"), "log_time", { projectKey: "CON", day: "2026-10-22", hours: 8 }, { source: "mcp" });
    await daily("2026-10-22T11:00:00Z");
    const names = (await dayRows("2026-10-22")).map((r) => r.name);
    expect(names).not.toContain("Dinesh Wickrama");
    expect(names).not.toContain("Kasun Dias");
    await setSettings(ctxFor(maya), { dailyReminderAt: null });
    expect(await daily("2026-10-23T11:00:00Z")).toBe(0);
  }, 60_000);

  it("AC6 TIM-T03 Monday's weekly reminder covers each entity's own people and last week, once per week", async () => {
    await registry.call(await db.as("tharushi"), "log_time", { projectKey: "FLT", day: "2026-10-20", hours: 2 }, { source: "mcp" });
    await registry.call(await db.as("liam"), "log_time", { projectKey: "CON", day: "2026-10-20", hours: 3 }, { source: "mcp" });
    const [lk, au] = [await entity("tharushi"), await entity("liam")];
    const monday = "2026-10-26T03:00:00Z";
    expect(await remindDrafts(job(), { legalEntityId: lk, now: monday })).toMatchObject({ week: "2026-W43" });
    expect(await remindDrafts(job(), { legalEntityId: au, now: monday })).toMatchObject({ week: "2026-W43", reminded: 1 });
    const weekly = await db.q(sql`select u.email from time.reminder r join auth.user u on u.id = r.user_id where r.slot = 'auto:week:2026-W43' order by u.email`);
    expect(weekly.map((r) => r.email)).toEqual(expect.arrayContaining(["liam@lumenlabs.test", "tharushi@lumenlabs.test"]));
    expect(await remindDrafts(job(), { legalEntityId: au, now: monday })).toMatchObject({ reminded: 0 });
    expect((manifest.schedules as { name: string; cron: string; timezone?: string }[] | undefined)?.map((s) => [s.name, s.cron, s.timezone])).toEqual([["time.daily-reminders", "*/15 * * * 1-5", "entity"], ["time.draft-reminders", "0 9 * * 1", "entity"]]);
  }, 60_000);
});
