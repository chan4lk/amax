import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { csvText } from "../server/csv";
import type { Report } from "../server/view";
import { reportsDb } from "./db";

const pick = (r: Report) => r.rows.map((x) => [x.name, x.availableHours, x.leaveLabel, x.loggedHours, x.billableHours, x.utilisation]);

describe.skipIf(!hasDb)("utilisation (Postgres)", () => {
  let db: Awaited<ReturnType<typeof reportsDb>>;
  beforeAll(async () => { db = await reportsDb(); }, 240_000);
  afterAll(() => db?.t.drop());

  it("AC1 billable ÷ available after leave and holidays gives the team 84% for October to date, only to those who may see it", async () => {
    const r = await db.call<Report>("maya", "get_utilisation", {});
    expect(pick(r)).toEqual([["Nimal Silva", 96, null, 98.5, 88, 92], ["Kasun Dias", 80, "2 days medical", 78, 70, 88], ["Ayesha Rahman", 88, "1 day casual", 84, 64, 73]]);
    expect(r.team).toMatchObject({ availableHours: 264, loggedHours: 260.5, billableHours: 222, utilisation: 84 });
    expect(r.lede).toBe("Billable hours from submitted and approved time ÷ available hours, October to date (Oct 1–16, 12 working days, 96 h per full-time person). Team: 222 ÷ 264 = 84%, against an 80% target.");
    expect(r.trend.map((t) => t.utilisation)).toEqual([72, 68, 74, 77, 79, 81, 78, 83, 82, 80, 84, 84]);
    expect(r.availability.rows.map((x) => [x.name, x.workdays, x.availableHours, x.allocated])).toEqual([["Nimal Silva", 9, 72, 100], ["Kasun Dias", 9, 72, 100], ["Ayesha Rahman", 6, 48, 100]]);
    const finance = await db.call<Report>("sahan", "get_utilisation", {}, "Finance");
    expect([finance.rows, finance.team.utilisation]).toEqual([[], null]);
    expect((await db.call<Report>("sahan", "get_utilisation", {}, "PM")).rows).toEqual([]);
    await expect(db.call("nimal", "get_utilisation", {})).rejects.toThrow(/forbidden/);
    await db.call("tharushi", "log_time", { projectKey: "FLT", day: "2026-10-16", hours: 4, billable: true });
    await db.tick();
    const after = await db.call<Report>("maya", "get_utilisation", {});
    // 072 AC-6 (D1): her week is still a draft, so its hours don't count yet.
    expect(after.rows.find((x) => x.name === "Tharushi Wijesinghe")).toBeUndefined();
  }, 120_000);

  it("AC2 exports the table as CSV through the same read, with formula cells neutralised", async () => {
    const out = await db.call<{ filename: string; csv: string }>("maya", "get_utilisation", { month: "2026-09", format: "utilisation-csv" });
    expect(out.filename).toBe("utilisation-2026-09.csv");
    expect(out.csv.split("\r\n")).toEqual([
      '"Person","Available h","Leave","Logged h","Billable h","Utilisation %"',
      '"Ayesha Rahman","176","","169.84","147.84","84"', '"Kasun Dias","176","","169.84","147.84","84"', '"Nimal Silva","176","","169.84","147.84","84"',
      '"Team","528","","509.52","443.52","84"',
    ]);
    expect(csvText([["=SUM(A1)", "+1", "-1", "@me", 'say "hi"']])).toBe(`"'=SUM(A1)","'+1","'-1","'@me","say ""hi"""`);
    await expect(db.call("sahan", "get_utilisation", { format: "utilisation-csv" }, "PM")).resolves.toMatchObject({ csv: expect.not.stringContaining("Kasun") });
  }, 60_000);
});
