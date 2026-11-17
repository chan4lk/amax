type Doc = PDFKit.PDFDocument;

export function drawChart(doc: Doc, x: number, y: number, w: number, h: number, values: (number | null)[], labels: string[], target: number) {
  const left = x + 26, bottom = y + h - 16, top = y + 4, right = x + w;
  const X = (i: number) => left + (i * (right - left)) / Math.max(1, values.length - 1);
  const Y = (v: number) => bottom - (Math.min(100, Math.max(0, v)) / 100) * (bottom - top);
  doc.save().fontSize(7).fillColor("#5D5A73");
  for (const v of [0, 25, 50, 75, 100]) {
    doc.moveTo(left, Y(v)).lineTo(right, Y(v)).lineWidth(0.4).strokeColor("#E6E3F2").stroke();
    doc.text(String(v), x, Y(v) - 3, { width: 20, align: "right", lineBreak: false });
  }
  labels.forEach((l, i) => doc.text(l, X(i) - 12, bottom + 4, { width: 24, align: "center", lineBreak: false }));
  doc.moveTo(left, Y(target)).lineTo(right, Y(target)).lineWidth(1).dash(3, { space: 3 }).strokeColor("#F2A93B").stroke().undash();
  const points = values.map((v, i) => (v === null ? null : [X(i), Y(v)] as const));
  let started = false;
  for (const p of points) {
    if (!p) { started = false; continue; }
    if (started) doc.lineTo(p[0], p[1]); else { doc.moveTo(p[0], p[1]); started = true; }
  }
  doc.lineWidth(2).strokeColor("#7B61FF").stroke();
  doc.restore();
}
