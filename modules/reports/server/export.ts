import { z } from "zod";
import type { Viewer } from "@amax/auth";
import { defineService } from "@amax/core/server";
import { MONTH } from "./days";
import { compose, PRESETS, SECTION_KEYS } from "./export-compose";
import { exportData, KINDS, type ReportKind } from "./export-data";
import { docxOf } from "./export-docx";
import { fromMarkdown, toMarkdown } from "./export-md";
import { pdfOf } from "./export-pdf";
import { ctxFor } from "./read";

export const exportFields = {
  kind: z.enum(KINDS).optional().describe("utilisation (who worked how much, billable vs available), availability (who is free for the rest of the month, leave, bench, capacity) or delivery (hours against plan by project, over-allocation); utilisation when left out"),
  sections: z.array(z.enum(SECTION_KEYS)).min(1).max(8).optional().describe("Only the parts that answer the question: utilisation (by person), trend (12 months), availability (free hours rest of month), leave (next 14 days), projects (hours against plan), allocation (over 100% and bench), capacity (capacity vs demand), plan (each person's allocation percent on each project this month: use it with person for \"Ayesha's projects and percentages\"). Leave out to use the kind's full set"),
  title: z.string().min(3).max(80).optional().describe("The report title in a few words, from the question, e.g. \"Leave in the next two weeks\""),
  format: z.enum(["pdf", "docx", "md"]).describe("pdf, docx (Word) or md (Markdown)"),
  month: z.string().regex(MONTH, "give the month as YYYY-MM").optional().describe("YYYY-MM; this month to date when left out"),
  project: z.string().min(1).max(80).optional().describe("A project's key or name, for a report on that project only"),
  person: z.string().min(1).max(80).optional().describe("A person's name, for a report on that person only"),
  people: z.array(z.string().min(1).max(80)).min(2).max(10).optional().describe("Two or more people's names, for ONE report that covers just them (e.g. Nimal and Kasun): use this, not several calls. For one person use person"),
};
export const ExportQuery = z.object({ ...exportFields, sections: z.preprocess((s) => (typeof s === "string" ? s.split(",") : s), exportFields.sections), people: z.preprocess((s) => (typeof s === "string" ? s.split("|") : s), exportFields.people), for: z.uuid() });
export type ExportQuery = z.infer<typeof ExportQuery>;
export type ExportFile = { filename: string; contentType: string; body: Buffer; title: string; detail: string; pages: number | null };

const TYPES = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", md: "text/markdown; charset=utf-8" } as const;
const LABEL = { pdf: "PDF", docx: "Word", md: "Markdown" } as const;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const pagesOf = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;

export const recordExport = defineService({
  name: "reports.export.downloaded", action: "reports:read", resource: "reports.export",
  input: z.object({ format: exportFields.format, kind: z.string(), month: z.string(), project: z.string().nullable(), person: z.string().nullable(), people: z.string().nullable().optional() }),
  async run(_tx, a, ctx) {
    return { result: { recorded: true }, resourceId: ctx.tenantId, after: a, events: [] };
  },
});

export const exportHref = (v: Viewer, a: Omit<ExportQuery, "for">) =>
  `/api/reports/export?${new URLSearchParams(Object.entries({ ...a, sections: a.sections?.join(","), people: a.people?.join("|"), for: v.userId }).filter((e): e is [string, string] => typeof e[1] === "string"))}`;

export async function buildExport(v: Viewer, q: Omit<ExportQuery, "for">, audit: boolean): Promise<ExportFile> {
  const kind: ReportKind = q.kind ?? "utilisation";
  const data = await exportData(v, { project: q.project, person: q.person, people: q.people }, q.month, new Date(), kind, q.title, q.sections);
  const md = toMarkdown({ title: data.title, meta: `Period: ${data.period}  ·  Scope: ${data.scope}  ·  Prepared for ${data.madeFor} on ${data.madeOn} by amax`, blocks: compose(data, q.sections ?? PRESETS[kind]) });
  const report = fromMarkdown(md);
  const body = q.format === "pdf" ? await pdfOf(report) : q.format === "docx" ? await docxOf(report) : Buffer.from(md, "utf8");
  if (audit) await recordExport(ctxFor(v, "ui"), { format: q.format, kind, month: data.month, project: q.project ?? null, person: q.person ?? null, people: q.people?.join(", ") ?? null });
  const pages = q.format === "pdf" ? pagesOf(body) : null;
  const who = `${data.rows.length} ${data.rows.length === 1 ? "person" : "people"}`;
  return {
    filename: `${slug(data.title)}.${q.format}`, contentType: TYPES[q.format], body, title: data.title,
    detail: [data.period, LABEL[q.format], pages ? `${pages} ${pages === 1 ? "page" : "pages"}` : null, q.sections ? null : who].filter(Boolean).join(" · "),
    pages,
  };
}
