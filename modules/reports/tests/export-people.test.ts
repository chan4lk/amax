import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { buildExport, ExportQuery } from "../contracts";
import { exportData } from "../server/export-data";
import type { Report } from "../server/view";
import { reportsDb } from "./db";

type Card = { file?: { href: string; title: string; detail: string; format: string }; refused?: string };

describe.skipIf(!hasDb)("094 to 097 reports about named people (Postgres)", () => {
  let db: Awaited<ReturnType<typeof reportsDb>>;
  beforeAll(async () => { db = await reportsDb(); }, 240_000);
  afterAll(() => db?.t.drop());

  it("094 AC-1 AC-2 a person's report can carry their planned allocation percent on each project, from Allocations", async () => {
    const maya = await db.as("maya");
    const d = await exportData(maya, { person: "Ayesha" }, undefined, new Date(), "utilisation", undefined, ["utilisation", "plan"]);
    const mine = d.plan?.lines ?? [];
    expect(mine.length).toBeGreaterThan(0);
    expect(new Set(mine.map((l) => l.person))).toEqual(new Set(["Ayesha Rahman"]));
    expect(mine.every((l) => l.project && l.percent > 0)).toBe(true);
    const md = (await buildExport(maya, { format: "md", person: "Ayesha", sections: ["utilisation", "plan"] } as never, false)).body.toString("utf8");
    expect(md).toContain("Planned allocation by project");
    expect(md).toContain(mine[0].project);
    expect((await exportData(maya, { person: "Ayesha" })).plan).toBeNull();
  }, 120_000);

  it("095 a person who logged more than their available hours has it said in the report", async () => {
    const maya = await db.as("maya");
    const md = (await buildExport(maya, { format: "md", person: "Nimal" } as never, false)).body.toString("utf8");
    expect(md).toMatch(/Nimal Silva logged 98.5 h, 2.5 h more than the 96 h available./);
    expect(md).toContain("2.5 h more than available");
  }, 120_000);

  it("096 two or more people go in one report; a name that can't be seen refuses it and says which", async () => {
    const maya = await db.as("maya");
    const d = await exportData(maya, { people: ["Nimal", "Kasun"] });
    expect(d.rows.map((r) => r.name).sort()).toEqual(["Kasun Dias", "Nimal Silva"]);
    expect(d.title).toBe("Utilisation report: Nimal Silva and Kasun Dias, October 2026");
    const card = await db.call<Card>("maya", "export_report", { format: "pdf", people: ["Nimal", "Kasun"] });
    expect(card.file?.href).toMatch(/people=Nimal%7CKasun/);
    expect(card.file?.detail).toMatch(/2 people$/);
    expect((await db.call<Card>("maya", "export_report", { format: "pdf", people: ["Nimal", "Nobody Here"] })).refused).toMatch(/"Nobody Here"/);
    expect(ExportQuery.parse({ format: "pdf", people: "Nimal|Kasun", for: "8d546ca5-2732-48d3-8cbd-f2a218fb38dc" }).people).toEqual(["Nimal", "Kasun"]);
  }, 120_000);

  it("097 a report about named people reads only them: the page's numbers, no 12 months unless the trend is asked for, their own trend", async () => {
    const maya = await db.as("maya");
    const page = (await db.call<Report>("maya", "get_utilisation", {})).rows.find((x) => x.name === "Nimal Silva")!;
    const lean = await exportData(maya, { person: "Nimal" }, undefined, new Date(), "utilisation", undefined, ["utilisation"]);
    expect(lean.rows).toHaveLength(1);
    expect([lean.rows[0].availableHours, lean.rows[0].loggedHours, lean.rows[0].billableHours, lean.rows[0].utilisation]).toEqual([page.availableHours, page.loggedHours, page.billableHours, page.utilisation]);
    expect(lean.trend).toEqual([]);
    expect(lean.pulse.hours.rows).toEqual([]);
    const withTrend = await exportData(maya, { person: "Nimal" }, undefined, new Date(), "utilisation", undefined, ["utilisation", "trend"]);
    expect(withTrend.trend).toHaveLength(12);
    expect(withTrend.trend.at(-1)?.utilisation).toBe(page.utilisation);
    const two = await exportData(maya, { people: ["Nimal", "Kasun"] }, undefined, new Date(), "utilisation", undefined, ["utilisation"]);
    expect(two.rows.map((x) => x.name).sort()).toEqual(["Kasun Dias", "Nimal Silva"]);
  }, 120_000);
});
