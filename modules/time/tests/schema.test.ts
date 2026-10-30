import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@amax/db";
import { hasDb, tablesMissingRls } from "@amax/db/testdb";
import manifest from "../module";
import { teamWeek } from "../server/team";
import { T, timeDb } from "./db";

describe.skipIf(!hasDb)("time schema and the Team week (Postgres)", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  beforeAll(async () => { db = await timeDb(); }, 60_000);
  afterAll(() => db?.t.drop());

  it("AC1 entry, week and approval are tenant-isolated, ISO-keyed, billable, and their retention names real columns", async () => {
    expect(await tablesMissingRls(db.t.owner)).toEqual([]);
    const cols = async (table: string) => new Set((await db.t.owner`select column_name from information_schema.columns where table_schema = 'time' and table_name = ${table}`).map((c) => c.column_name as string));
    expect((await cols("entry")).has("billable")).toBe(true);
    expect((await cols("approval")).has("decision")).toBe(true);
    for (const r of manifest.retention ?? []) {
      const have = await cols(r.table.split(".")[1]);
      expect([...r.fields, ...r.start.at, ...(r.start.idle ? ["updated_at"] : [])].filter((c) => !have.has(c)), r.table).toEqual([]);
    }
    const weeks = await db.q(sql`select distinct iso_year, iso_week, to_char(starts_on, 'YYYY-MM-DD') as starts from time.week`);
    expect(weeks).toEqual([{ iso_year: 2026, iso_week: 42, starts: "2026-10-12" }]);
    const other = "22222222-2222-4222-8222-222222222222";
    expect(await withTenant(db.app, other, (tx) => tx.execute(sql`select count(*)::int as n from time.entry`))).toEqual([{ n: 0 }]);
  });

  it("AC3 Maya's Team week matches fixtures.md: 141.5 h, 64% by agents, 87.5 h submitted, per project and per day", async () => {
    const t = await teamWeek(await db.as("maya", "PM"), { year: 2026, week: 42 });
    const total = t.rows.reduce((n, r) => n + r.total, 0);
    const agent = t.rows.reduce((n, r) => n + r.agentHours, 0);
    expect(t.rows.map((r) => [r.personName, r.total, r.status])).toEqual([
      ["Nimal Silva", 31.5, "submitted"], ["Kasun Dias", 32.5, "submitted"], ["Ayesha Rahman", 23.5, "submitted"], ["Tharushi Wijesinghe", 29, "draft"], ["Dinesh Wickrama", 25, "draft"]]);
    expect([Math.round(total * 10) / 10, Math.round(agent * 10) / 10, Math.round((agent / total) * 100)]).toEqual([141.5, 90.2, 64]);
    expect(t.rows.filter((r) => r.status === "submitted").reduce((n, r) => n + r.total, 0)).toBe(87.5);
    expect(t.projects.map(({ name, hours }) => ({ name, hours }))).toEqual([{ name: "Contoso Portal", hours: 68 }, { name: "Fleet Tracker", hours: 51.5 }, { name: "HR Insights", hours: 22 }]);
    expect(t.perDay.map((d) => Math.round((d.agent + d.person) * 10) / 10)).toEqual([38.1, 40.1, 30.6, 31.7, 1]);
    expect(t.rows.find((r) => r.personName === "Kasun Dias")?.days).toEqual([8, 8, 8, 7.5, 1]);
    expect(t.rows.every((r) => r.canApprove)).toBe(true);
  });
});
