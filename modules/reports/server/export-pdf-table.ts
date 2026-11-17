import type { Table } from "./export-blocks";
import { ACCENT, HEAD, INK, M, MUTED, RULE, W, plain, room, text, type Doc, type Struct } from "./export-pdf-core";

export function table(doc: Doc, root: Struct, t: Table) {
  room(doc, 60);
  text(doc, root, "Caption", t.caption, { size: 9, color: MUTED, font: "Helvetica-Oblique", gap: 0.3 });
  const w = W / t.head.length, node = doc.struct("Table");
  root.add(node);
  const line = (cells: string[], kind: "TH" | "TD", o: { bold?: boolean; fill?: string; rule?: number }) => {
    const font = o.bold ? "Helvetica-Bold" : "Helvetica";
    const height = Math.max(...cells.map((c) => doc.font(font).fontSize(8.5).heightOfString(plain(c), { width: w - 8 }))) + 9;
    room(doc, height);
    const y = doc.y;
    if (o.fill) doc.save().rect(M, y, W, height).fill(o.fill).restore();
    const row = doc.struct("TR");
    node.add(row);
    cells.forEach((c, i) => row.add(doc.struct(kind, {}, () => {
      doc.font(font).fontSize(8.5).fillColor(INK).text(plain(c), M + i * w + 4, y + 4.5, { width: w - 8, align: t.numeric[i] ? "right" : "left" });
    })));
    row.end();
    doc.moveTo(M, y + height).lineTo(M + W, y + height).lineWidth(o.rule ?? 0.3).strokeColor(o.rule ? INK : RULE).stroke();
    doc.y = y + height;
  };
  doc.moveTo(M, doc.y).lineTo(M + W, doc.y).lineWidth(0.8).strokeColor(INK).stroke();
  line(t.head, "TH", { bold: true, fill: HEAD, rule: 0.8 });
  t.rows.forEach((r) => line(r, "TD", {}));
  if (t.total) line(t.total, "TD", { bold: true, rule: 0.8 });
  node.end();
  doc.x = M;
  doc.moveDown(1);
}
