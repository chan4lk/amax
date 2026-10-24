import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { ctxFor } from "../server/context";
import { approveWeek, remindWeek } from "../server/decide";
import { logTime } from "../server/log";
import { reopenWeek } from "../server/reopen";
import { submitWeek } from "../server/submit";
import { timeDb } from "./db";

describe.skipIf(!hasDb)("070 week guards (Postgres)", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  beforeAll(async () => { db = await timeDb(); }, 60_000);
  afterAll(() => db?.t.drop());

  const weekId = async (key: string, week = 42) => (await db.q(sql`select w.id from time.week w join auth.user u on u.id = w.user_id where u.email = ${`${key}@lumenlabs.test`} and w.iso_week = ${week}`))[0].id as string;

  it("AC8 an Admin can't reopen their own approved week; another Admin can", async () => {
    const [maya, sahan] = await Promise.all([db.as("maya"), db.as("sahan")]);
    await logTime(ctxFor(maya), { projectKey: "CON", day: "2026-10-20", hours: 2 });
    await submitWeek(ctxFor(maya), { week: "2026-W43" });
    await approveWeek(ctxFor(sahan), { person: "maya@lumenlabs.test", week: "2026-W43" });
    await expect(reopenWeek(ctxFor(maya), { person: "maya@lumenlabs.test", week: "2026-W43", reason: "Fix Tuesday" })).rejects.toThrow(/your own week/);
    await expect(reopenWeek(ctxFor(sahan), { person: "maya@lumenlabs.test", week: "2026-W43", reason: "Fix Tuesday" })).resolves.toMatchObject({ status: "draft" });
  });

  it("AC9 a write without a week is refused, never a guessed UTC week", async () => {
    const [tharushi, sahan] = await Promise.all([db.as("tharushi"), db.as("sahan")]);
    await expect(submitWeek(ctxFor(tharushi), {})).rejects.toThrow(/say which ISO week/);
    for (const run of [approveWeek, remindWeek]) await expect(run(ctxFor(sahan), { person: "kasun@lumenlabs.test" })).rejects.toThrow(/say which ISO week/);
    await expect(reopenWeek(ctxFor(sahan), { person: "kasun@lumenlabs.test", reason: "Fix Friday" })).rejects.toThrow(/say which ISO week/);
  });

  it("AC10 a missing week and one you can't act on give the same error, before any lock; a namesake's email never shows", async () => {
    const nimal = await db.as("nimal");
    const ayesha = await weekId("ayesha");
    const missing = await approveWeek(ctxFor(nimal), { weekId: randomUUID() }).catch((e: Error) => e.message);
    const theirs = await approveWeek(ctxFor(nimal), { weekId: ayesha }).catch((e: Error) => e.message);
    expect([missing, theirs]).toEqual([expect.stringMatching(/data scope/), missing]);
    let release = () => {};
    const held = new Promise<void>((r) => { release = r; });
    const locker = db.t.owner.begin(async (tx) => { await tx`select 1 from time.week where id = ${ayesha} for update`; await held; });
    try {
      const fast = await Promise.race([approveWeek(ctxFor(nimal), { weekId: ayesha }).catch((e: Error) => e.message), new Promise((r) => setTimeout(() => r("waited on the lock"), 3000))]);
      expect(fast).toBe(missing);
    } finally {
      release();
      await locker;
    }
    await db.q(sql`update time.week set person_name = 'Kasun Dias' where person_name = 'Dinesh Wickrama' and iso_week = 42`);
    const twins = await approveWeek(ctxFor(await db.as("sahan")), { person: "Kasun Dias", week: "2026-W42" }).catch((e: Error) => e.message);
    expect(twins).toMatch(/more than one Kasun Dias .* use their email/);
    expect(twins).not.toMatch(/@/);
  });
});
