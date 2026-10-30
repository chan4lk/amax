import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@amax/db";
import { hasDb, repoRoot } from "@amax/db/testdb";
import { createRegistry } from "@amax/mcp";
import type { Viewer } from "@amax/auth";
import manifest from "../module";
import { projectHours, weekTotals } from "../contracts";
import { ctxFor } from "../server/context";
import { approveWeek } from "../server/decide";
import { submitWeek } from "../server/submit";
import { workDay } from "../server/guards";
import { logTime } from "../server/log";
import { wantedWeek } from "../server/weeks";
import { csvCell } from "../ui/Timesheets";
import { T, timeDb } from "./db";

const W = { year: 2026, week: 42 };
const range = { from: "2026-10-12", to: "2026-10-16" };

describe("week and day inputs", () => {
  it.each([
    [undefined, undefined],
    ["", undefined],
    ["2026-W42", { year: 2026, week: 42 }],
    ["2020-W53", { year: 2020, week: 53 }],
  ])("wantedWeek(%j) is %j", (key, want) => expect(wantedWeek(key)).toEqual(want));

  it.each(["2026-W54", "2021-W53", "2026-W00", "2026-42", "next week"])("wantedWeek(%j) throws instead of falling back to another week", (key) => {
    expect(() => wantedWeek(key)).toThrow(/isn't an ISO week/);
  });

  it.each([["2026-10-17", /weekend/], ["2026-10-18", /weekend/], ["2026-10-11", /weekend/], ["2026-02-30", /real date/], ["2026-13-01", /real date/]])(
    "workDay(%s) is refused", (day, err) => expect(() => workDay(day)).toThrow(err));

  it.each(["2026-10-12", "2026-10-16", "2027-01-01"])("workDay(%s) is a weekday", (day) => expect(workDay(day).getUTCDay()).toBeGreaterThan(0));
});

describe("no UTC 'today' on the server", () => {
  const dir = join(repoRoot, "modules/time");
  const files = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? (["node_modules", "tests", "test-results"].includes(e.name) ? [] : files(join(d, e.name))) : /\.tsx?$/.test(e.name) ? [join(d, e.name)] : []);
  it.each([
    ["isoDate(new Date())", /isoDate\(new Date\(\)\)/],
    ["new Date().toISOString().slice", /new Date\(\)\.toISOString\(\)\.slice/],
    ["a today() helper", /\btoday\s*=\s*\(/],
  ])("no source file derives a calendar day from server time via %s", (_name, re) => {
    expect(files(dir).filter((f) => re.test(readFileSync(f, "utf8"))).map((f) => f.slice(dir.length + 1))).toEqual([]);
  });
});

describe("CSV export cells", () => {
  it.each([
    ["Kasun Dias", '"Kasun Dias"'],
    ['Dinesh "DJ" Wickrama', '"Dinesh ""DJ"" Wickrama"'],
    ["=HYPERLINK(1)", `"'=HYPERLINK(1)"`],
    ["+1", `"'+1"`],
    ["-2", `"'-2"`],
    ["@SUM(A1)", `"'@SUM(A1)"`],
  ])("csvCell(%j) is %s", (v, want) => expect(csvCell(v)).toBe(want));
});

describe.skipIf(!hasDb)("review fixes (Postgres)", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  beforeAll(async () => { db = await timeDb(); }, 60_000);
  afterAll(() => db?.t.drop());

  it.each([
    ["maya", ["Ayesha Rahman", "Dinesh Wickrama", "Kasun Dias", "Nimal Silva", "Tharushi Wijesinghe"]],
    ["nimal", ["Dinesh Wickrama", "Kasun Dias", "Nimal Silva", "Tharushi Wijesinghe"]],
    ["ayesha", ["Ayesha Rahman", "Dinesh Wickrama"]],
    ["liam", []],
  ])("weekTotals applies %s's data scope", async (key, names) => {
    const v = await db.as(key);
    expect((await withTenant(db.app, T, (tx) => weekTotals(tx, v, W))).map((p) => p.personName)).toEqual(names);
  });

  it.each(["maya", "nimal", "ayesha", "liam"])("projectHours and weekTotals apply the same week-level scope for %s", async (key) => {
    const v = await db.as(key);
    const [weeks, projects] = await withTenant(db.app, T, async (tx) => [await weekTotals(tx, v, W), await projectHours(tx, v, range)] as const);
    const sum = (xs: { hours: number }[]) => Math.round(xs.reduce((n, x) => n + x.hours, 0) * 100) / 100;
    expect(sum(projects)).toBeCloseTo(sum(weeks), 5);
  });

  it("a project approver sees the whole of a visible week, including projects they don't manage", async () => {
    const ayesha = await db.as("ayesha");
    const dinesh = (await withTenant(db.app, T, (tx) => weekTotals(tx, ayesha, W))).find((p) => p.personName === "Dinesh Wickrama")!;
    expect(dinesh.hours).toBeCloseTo(25, 5);
    const names = new Set((await withTenant(db.app, T, (tx) => projectHours(tx, ayesha, range))).map((p) => p.projectId));
    expect(names.size).toBeGreaterThan(1);
  });

  it.each(["nimal", "kasun", "ayesha"])("%s can't add time to their submitted week", async (key) => {
    const v = await db.as(key);
    await expect(logTime(ctxFor(v), { projectKey: "CON", day: "2026-10-16", hours: 0.5 })).rejects.toThrow(/submitted and waiting/);
  });

  it.each(["2026-10-17", "2026-10-18"])("logTime refuses the weekend day %s", async (day) => {
    await expect(logTime(ctxFor(await db.as("tharushi")), { projectKey: "FLT", day, hours: 1 })).rejects.toThrow(/weekend/);
  });

  it("logTime needs a day: the server never guesses today in UTC", async () => {
    await expect(logTime(ctxFor(await db.as("tharushi")), { projectKey: "FLT", hours: 1 } as never)).rejects.toThrow(/invalid input/);
  });

  describe("an Admin's own approved week", () => {
    beforeAll(async () => {
      const [maya, sahan] = await Promise.all([db.as("maya"), db.as("sahan")]);
      await logTime(ctxFor(maya), { projectKey: "CON", day: "2026-10-20", hours: 2 });
      await submitWeek(ctxFor(maya), { week: "2026-W43" });
      await expect(approveWeek(ctxFor(sahan), { person: "maya@lumenlabs.test", week: "2026-W43" })).resolves.toMatchObject({ status: "approved", chain: "admin" });
    });

    it.each([
      ["on screen", (maya: Viewer) => logTime(ctxFor(maya), { projectKey: "CON", day: "2026-10-21", hours: 1 })],
      ["naming herself", (maya: Viewer) => logTime(ctxFor(maya), { projectKey: "CON", day: "2026-10-21", hours: 1, userId: maya.userId })],
      ["through MCP as agent time", (maya: Viewer) => createRegistry([manifest]).call(maya, "log_time", { projectKey: "CON", day: "2026-10-21", hours: 1 }, { source: "mcp" })],
      ["through chat", (maya: Viewer) => createRegistry([manifest]).call(maya, "log_time", { projectKey: "CON", day: "2026-10-22", hours: 1 }, { source: "chat" })],
    ])("is refused %s", async (_how, run) => {
      await expect(run(await db.as("maya"))).rejects.toThrow(/your own approved week/);
    });

    it("another Admin can still change it, audited", async () => {
      const [maya, sahan] = await Promise.all([db.as("maya"), db.as("sahan")]);
      await expect(logTime(ctxFor(sahan), { projectKey: "CON", day: "2026-10-21", hours: 1, userId: maya.userId })).resolves.toMatchObject({ week: "2026-W43" });
      expect(await db.q(sql`select count(*)::int as n from core.audit_event where action = 'time.week.locked_change'`)).toEqual([{ n: 1 }]);
    });
  });

  it.each(["Kasun Dias", "kasun dias", "KASUN DIAS"])("a name shared by two people (%s) is refused; the email still works", async (name) => {
    await db.q(sql`update time.week set person_name = 'Kasun Dias' where person_name = 'Dinesh Wickrama' and iso_year = 2026 and iso_week = 42`);
    const sahan = await db.as("sahan");
    await expect(approveWeek(ctxFor(sahan), { person: name, week: "2026-W42" })).rejects.toThrow(/more than one .* use their email/);
  });

  it("the email picks the right namesake", async () => {
    await expect(approveWeek(ctxFor(await db.as("sahan")), { person: "kasun@lumenlabs.test", week: "2026-W42" })).resolves.toMatchObject({ status: "approved", person: "Kasun Dias" });
  });
});
