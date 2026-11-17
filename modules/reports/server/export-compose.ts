import { Doc, type Block } from "./export-blocks";
import type { ExportData, ReportKind } from "./export-data";
import { availability, leave, trend, utilisation } from "./sections-people";
import { allocation, capacity, plan, projects } from "./sections-plan";

export const SECTIONS = { utilisation, trend, availability, leave, projects, allocation, capacity, plan };
export type SectionKey = keyof typeof SECTIONS;
export const SECTION_KEYS = Object.keys(SECTIONS) as [SectionKey, ...SectionKey[]];

export const PRESETS: Record<ReportKind, SectionKey[]> = {
  utilisation: ["utilisation", "trend"],
  availability: ["availability", "leave", "capacity", "allocation"],
  delivery: ["projects", "allocation", "capacity"],
};

export function compose(d: ExportData, keys: SectionKey[]): Block[] {
  const parts = [...new Set(keys)].map((k) => SECTIONS[k]);
  const doc = new Doc();
  doc.heading("Summary").text(parts.map((p) => p.summary(d)).filter(Boolean).join(" "));
  const figures = parts.flatMap((p) => p.figures(d));
  if (figures.length > 1) doc.heading("Key figures").figures(figures);
  const findings = parts.flatMap((p) => p.findings(d));
  if (findings.length) doc.heading("Findings").list(findings, "");
  parts.forEach((p) => p.body(doc, d));
  doc.heading("Method").list([...parts.flatMap((p) => p.method ?? []), "The report shows only the people the reader is allowed to see."], "");
  return doc.done();
}
