import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { myWeek } from "../server/my";
import { myLeaveDays } from "../server/my-days";
import { timeDb } from "./db";

describe.skipIf(!hasDb)("073: My timesheet marks approved leave days, as Team time does (Postgres)", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  beforeAll(async () => { db = await timeDb(); }, 60_000);
  afterAll(() => db?.t.drop());

  it("only approved leave days are marked", async () => {
    const ayesha = await db.as("ayesha");
    const m = await myWeek(ayesha, { year: 2026, week: 42 });
    expect(await myLeaveDays(ayesha, m.days)).toEqual(["2026-10-16"]);
    const kasun = await db.as("kasun");
    const k = await myWeek(kasun, { year: 2026, week: 42 });
    expect(await myLeaveDays(kasun, k.days)).toEqual([]);
  }, 60_000);
});
