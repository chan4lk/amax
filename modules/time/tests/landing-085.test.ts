import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { reviewsTime } from "../server/landing";
import { myWeek } from "../server/my";
import { isoWeekOf, weekKey } from "../week";
import { TeamPage } from "../ui/TeamPage";
import { timeDb } from "./db";

// 085: Time opens your own week first when you review nobody's time; reviewers keep Team time.
describe.skipIf(!hasDb)("085 Time opens your own week first (Postgres)", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  beforeAll(async () => { db = await timeDb(); }, 120_000);
  afterAll(() => db?.t.drop());

  const redirectOf = async (page: Promise<unknown>) => {
    try { await page; return null; } catch (e) { return String((e as { digest?: string }).digest ?? e); }
  };

  it("AC1 AC2 an engineer with nobody to review doesn't review time; a PM, Leadership and an Admin do", async () => {
    expect(reviewsTime(await db.as("kasun"))).toBe(false);
    expect(reviewsTime(await db.as("maya", "PM"))).toBe(true);
    expect(reviewsTime(await db.as("sarah"))).toBe(true);
    expect(reviewsTime(await db.as("sahan"))).toBe(true);
  });

  it("AC1 AC2 /time sends the engineer to My timesheet; the Team tab (?view=team), a week link and a PM stay on Team time", async () => {
    const kasun = await db.as("kasun");
    expect(await redirectOf(TeamPage({ viewer: kasun, params: {}, searchParams: {} }))).toMatch(/NEXT_REDIRECT.*\/time\/my/);
    expect(await redirectOf(TeamPage({ viewer: kasun, params: {}, searchParams: { view: "team" } }))).toBeNull();
    expect(await redirectOf(TeamPage({ viewer: kasun, params: { week: "2026-W42" }, searchParams: {} }))).toBeNull();
    expect(await redirectOf(TeamPage({ viewer: await db.as("maya", "PM"), params: {}, searchParams: {} }))).toBeNull();
  });

  it("AC1 My timesheet with no week is the person's current week, not their latest one with a timesheet", async () => {
    const kasun = await db.as("kasun");
    const [today] = await db.q(sql`select to_char((now() at time zone 'Asia/Colombo')::date, 'YYYY-MM-DD') as d`);
    expect((await myWeek(kasun)).key).toBe(weekKey(isoWeekOf(new Date(`${today.d as string}T12:00:00Z`))));
  });
});
