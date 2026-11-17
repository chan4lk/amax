import { AlignmentType, BorderStyle, Document, Footer, HeadingLevel, Packer, PageNumber, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import type { Block, Table as T } from "./export-blocks";
import type { MdReport } from "./export-md";

const INK = "1F1B3A", MUTED = "5D5A73", VIOLET = "5B44D6", SOFT = "F1EEFF", LINE = "D9D5EC";
const WIDTH = 9638;
const line = { style: BorderStyle.SINGLE, size: 4, color: LINE };
const borders = { top: line, bottom: line, left: line, right: line };

const cell = (text: string, width: number, o: { bold?: boolean; fill?: string; right?: boolean; color?: string } = {}) => new TableCell({
  width: { size: width, type: WidthType.DXA }, borders, margins: { top: 60, bottom: 60, left: 100, right: 100 },
  shading: o.fill ? { fill: o.fill, type: ShadingType.CLEAR, color: "auto" } : undefined,
  children: [new Paragraph({ alignment: o.right ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text, bold: o.bold, color: o.color ?? INK, size: 18 })] })],
});

function table(t: T) {
  const w = Math.floor(WIDTH / t.head.length);
  const widths = t.head.map((_, i) => (i === t.head.length - 1 ? WIDTH - w * (t.head.length - 1) : w));
  const row = (cells: string[], o: { bold?: boolean; fill?: string } = {}) => new TableRow({ children: cells.map((c, i) => cell(c, widths[i], { ...o, right: t.numeric[i] })) });
  return new Table({ width: { size: WIDTH, type: WidthType.DXA }, columnWidths: widths,
    rows: [new TableRow({ tableHeader: true, children: t.head.map((c, i) => cell(c, widths[i], { bold: true, fill: SOFT, right: t.numeric[i], color: VIOLET })) }), ...t.rows.map((r) => row(r)), ...(t.total ? [row(t.total, { bold: true, fill: SOFT })] : [])] });
}

function render(b: Block): (Paragraph | Table)[] {
  if (b.kind === "heading") return [new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(b.text)] })];
  if (b.kind === "text") return [new Paragraph({ spacing: { after: 160, line: 300 }, children: [new TextRun({ text: b.text, color: b.muted ? MUTED : INK, font: "Georgia", size: 22 })] })];
  if (b.kind === "list") return b.items.map((it, i) => new Paragraph({ spacing: { after: 100, line: 290 }, indent: { left: 400, hanging: 400 }, children: [new TextRun({ text: `${i + 1}.	`, font: "Georgia", size: 22 }), new TextRun({ text: it, font: "Georgia", size: 22, color: INK })] }));
  if (b.kind === "chart") return [];
  return [new Paragraph({ spacing: { before: 120, after: 60 }, children: [new TextRun({ text: b.table.caption, italics: true, color: MUTED, size: 18 })] }), table(b.table), new Paragraph("")];
}

export async function docxOf(d: MdReport): Promise<Buffer> {
  const doc = new Document({
    creator: "amax", title: d.title,
    styles: {
      default: { document: { run: { font: "Arial", size: 20, color: INK } } },
      paragraphStyles: [
        { id: "Title", name: "Title", basedOn: "Normal", next: "Normal", run: { font: "Arial", size: 40, bold: true, color: INK }, paragraph: { spacing: { before: 0, after: 80 } } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: "Arial", size: 26, bold: true, color: VIOLET }, paragraph: { spacing: { before: 280, after: 100 }, keepNext: true, outlineLevel: 1 } },
      ],
    },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${d.title}  ·  page `, size: 16, color: MUTED }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: MUTED })] })] }) },
      children: [
        new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(d.title)] }),
        new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: d.meta, color: MUTED })] }),
        ...d.blocks.flatMap(render),
      ],
    }],
  });
  return Packer.toBuffer(doc);
}
