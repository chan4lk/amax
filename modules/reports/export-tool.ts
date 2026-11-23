import { z } from "zod";
import type { Viewer } from "@amax/auth";
import { ExportRefused } from "./server/export-data";
import { buildExport, exportFields, exportHref } from "./server/export";

export const exportInput = z.object(exportFields);

export const exportDescription = "ONLY when the user asks for a report, a PDF, a Word file, a document or a download (or to send something): never to answer a question, which you answer in chat with the read tools (get_person_utilisation, get_utilisation, get_delivery_pulse). Make a written PDF or Word (docx) report for a month, for the team, one project, one person or several named people in one report (use people): a utilisation report (summary, key figures, findings, utilisation by person, 12-month trend, method), an availability report (free hours for the rest of the month, leave, bench, capacity) or a delivery report (hours against plan by project, over-allocation, capacity). Only people you may see are included. Returns a file the chat shows as a Download card; say in one line what is in it and don't repeat the link.";

export async function exportTool(v: Viewer, a: z.infer<typeof exportInput>) {
  try {
    const f = await buildExport(v, a, false);
    return { file: { href: exportHref(v, a), title: f.title, detail: f.detail, format: a.format } };
  } catch (e) {
    if (e instanceof ExportRefused) return { refused: e.message };
    throw e;
  }
}
