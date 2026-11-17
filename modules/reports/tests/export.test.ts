import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { reportRules } from "../chat-rules";
import { buildExport, ExportQuery } from "../contracts";
import { compose } from "../server/export-compose";
import { exportData } from "../server/export-data";
import type { Report } from "../server/view";
import { reportsDb } from "./db";

type Card = { file?: { href: string; title: string; detail: string; format: string }; refused?: string };

describe.skipIf(!hasDb)("083 reports export (Postgres)", () => {
  let db: Awaited<ReturnType<typeof reportsDb>>;
  beforeAll(async () => { db = await reportsDb(); }, 240_000);
  afterAll(() => db?.t.drop());

  it("AC1 AC2 export_report is a read that returns a file card for the chat", async () => {
    const tool = db.registry.toolsFor(await db.as("maya")).find((t) => t.name === "export_report");
    expect(tool?.scope).toBe("read");
    expect((tool as { description?: string }).description).toMatch(/^ONLY when the user asks for a report, a PDF/);
    expect(reportRules).toContain("Never call export_report to answer a question");
    const card = await db.call<Card>("maya", "export_report", { format: "pdf" });
    expect(card.file).toMatchObject({ title: "Utilisation report, October 2026", format: "pdf" });
    expect(card.file?.href).toMatch(/^\/api\/reports\/export\?format=pdf&for=/);
    expect(card.file?.detail).toMatch(/^Oct 1–16 · PDF · \d+ pages? · \d+ people$/);
  }, 120_000);

  it("AC4 AC5 the file's numbers are the page's numbers, as the asker sees them", async () => {
    const maya = await db.as("maya");
    const [d, r] = await Promise.all([exportData(maya, {}), db.call<Report>("maya", "get_utilisation", {})]);
    expect([d.team, d.rows.length]).toEqual([r.team, r.rows.length]);
    expect((await exportData(await db.as("sahan", "Finance"), {})).rows).toEqual([]);
  }, 120_000);

  it("AC6 a project, person or topic report keeps only that, and someone unseen is refused", async () => {
    const maya = await db.as("maya");
    const fleet = await exportData(maya, { project: "Fleet Tracker" }, undefined, new Date(), "utilisation", undefined, ["utilisation", "projects"]);
    expect(fleet.title).toBe("Utilisation report: Fleet Tracker, October 2026");
    expect(fleet.pulse.hours.rows.map((x) => x.name)).toEqual(["Fleet Tracker"]);
    expect((await exportData(maya, { person: "Kasun Dias" })).rows.map((x) => x.name)).toEqual(["Kasun Dias"]);
    const leaveOnly = compose(await exportData(maya, {}, undefined, new Date(), "utilisation", undefined, ["leave"]), ["leave"]).filter((b) => b.kind === "heading").map((b) => (b as { text: string }).text);
    expect(leaveOnly).toEqual(["1. Summary", "2. Leave in the next 14 days", "3. Method"]);
    expect((await db.call<Card>("maya", "export_report", { format: "docx", person: "Nobody Here" })).refused).toMatch(/can't see a report/);
    expect((await db.call<Card>("maya", "export_report", { format: "pdf", month: "2026-11" })).refused).toMatch(/hasn't started yet.*latest month is October 2026/);
  }, 120_000);

  it("AC7 AC8 the link is only for its owner, and each download builds a real PDF or Word file and is audited", async () => {
    const maya = await db.as("maya");
    expect(ExportQuery.safeParse({ format: "pdf", for: "not-a-user" }).success).toBe(false);
    const pdf = await buildExport(maya, { format: "pdf" }, true);
    const word = await buildExport(maya, { format: "docx", project: "FLT" }, true);
    expect([pdf.body.subarray(0, 5).toString(), pdf.body.toString("latin1").includes("/StructTreeRoot"), word.body.subarray(0, 2).toString()]).toEqual(["%PDF-", true, "PK"]);
    const audit = await db.tx((tx) => tx.execute(sql`select after from core.audit_event where action = 'reports.export.downloaded' order by seq`));
    expect(audit.map((a) => (a.after as { format: string }).format)).toEqual(["pdf", "docx"]);
  }, 120_000);
});
