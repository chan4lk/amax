import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { myWeek } from "../server/my";
import { myDayMarks } from "../server/my-days";
import { timeDb } from "./db";

describe.skipIf(!hasDb)("073: My timesheet marks Missing and On leave days as Team time does (Postgres)", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  beforeAll(async () => { db = await timeDb(); }, 60_000);
  afterAll(() => db?.t.drop());

  it("a past working day with nothing logged is missing; approved leave is leave, never missing", async () => {
    const ayesha = await db.as("ayesha");
    const m = await myWeek(ayesha, { year: 2026, week: 42 });
    expect(await myDayMarks(ayesha, m.days, m.perDay)).toEqual({ leave: ["2026-10-16"], missing: ["2026-10-14"] });
    const kasun = await db.as("kasun");
    const k = await myWeek(kasun, { year: 2026, week: 42 });
    expect(await myDayMarks(kasun, k.days, k.perDay)).toEqual({ leave: [], missing: [] });
  }, 60_000);
});
