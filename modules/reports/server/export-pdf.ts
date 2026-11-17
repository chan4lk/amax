import PDFDocument from "pdfkit";
import type { Block, Table } from "./export-blocks";
import { drawChart } from "./export-chart";
import type { MdReport } from "./export-md";
import { table } from "./export-pdf-table";
import { ACCENT, INK, M, MUTED, W, plain, room, text, type Doc, type Struct } from "./export-pdf-core";

function render(doc: Doc, root: Struct, b: Block) {
  if (b.kind === "heading") { room(doc, 90); doc.moveDown(0.4); return text(doc, root, "H2", b.text, { size: 13, color: ACCENT, font: "Helvetica-Bold", gap: 0.4 }); }
  if (b.kind === "text") return text(doc, root, "P", b.text, { size: 11, color: b.muted ? MUTED : INK, gap: 0.6 });
  if (b.kind === "list") {
    b.items.forEach((it, i) => {
      room(doc, 30);
      const y = doc.y;
      doc.font("Times-Roman").fontSize(11).fillColor(INK).text(`${i + 1}.`, M, y, { width: 18 });
      doc.y = y;
      text(doc, root, "P", it, { size: 11, color: INK, gap: 0.3, x: M + 20 });
    });
    doc.x = M;
    doc.moveDown(0.4);
    return;
  }
  if (b.kind === "chart") {
    room(doc, 175);
    const y = doc.y;
    root.add(doc.struct("Figure", { alt: b.caption }, () => drawChart(doc, M, y, W, 140, b.values, b.labels, b.target)));
    doc.x = M; doc.y = y + 150;
    return text(doc, root, "Caption", b.caption, { size: 9, color: MUTED, font: "Helvetica-Oblique", gap: 0.8 });
  }
  table(doc, root, b.table);
}

export function pdfOf(d: MdReport): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: M, tagged: true, displayTitle: true, lang: "en-GB", pdfVersion: "1.7", bufferPages: true, info: { Title: plain(d.title), Author: "amax" } });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
  const root = doc.struct("Document");
  doc.addStructure(root);
  text(doc, root, "H1", d.title, { size: 22, color: INK, font: "Helvetica-Bold", gap: 0.3 });
  text(doc, root, "P", d.meta, { size: 9.5, color: MUTED, font: "Helvetica", gap: 0.4 });
  doc.moveTo(M, doc.y).lineTo(M + W, doc.y).lineWidth(1.2).strokeColor(ACCENT).stroke();
  doc.moveDown(0.8);
  d.blocks.forEach((b) => render(doc, root, b));
  root.end();
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(pages.start + i);
    doc.page.margins.bottom = 0;
    doc.markContent("Artifact", { type: "Pagination" });
    doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(`${plain(d.title)}  ·  page ${i + 1} of ${pages.count}`, M, doc.page.height - 34, { width: W, align: "center", lineBreak: false });
    doc.endMarkedContent();
  }
  doc.end();
  return done;
}
