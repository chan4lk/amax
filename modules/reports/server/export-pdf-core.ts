export type Doc = PDFKit.PDFDocument;
export type Struct = PDFKit.PDFStructureElement;
export const INK = "#1F1B3A", MUTED = "#5D5A73", ACCENT = "#3F2FA8", RULE = "#D9D5EC", HEAD = "#F4F2FB";
export const M = 56, W = 595.28 - 2 * M;
export const plain = (s: string) => s.replace(/−/g, "-").replace(/[^\u0000-ÿ–—‘’“”•…]/g, "");
export const room = (doc: Doc, need: number) => { if (doc.y + need > doc.page.height - M - 24) doc.addPage(); };

export function text(doc: Doc, root: Struct, type: "H1" | "H2" | "P" | "Caption", value: string, o: { size: number; color: string; font?: string; gap?: number; x?: number }) {
  room(doc, o.size * 3);
  root.add(doc.struct(type, {}, () => { doc.font(o.font ?? "Times-Roman").fontSize(o.size).fillColor(o.color).text(plain(value), o.x ?? M, doc.y, { width: W - ((o.x ?? M) - M), lineGap: 2 }); }));
  doc.moveDown(o.gap ?? 0.5);
}
