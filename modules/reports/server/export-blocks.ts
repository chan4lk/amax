import type { ExportData } from "./export-data";
import { hoursText } from "./lede";

export type Table = { caption: string; head: string[]; rows: string[][]; total?: string[]; numeric: boolean[] };
export type Block =
  | { kind: "heading"; text: string }
  | { kind: "text"; text: string; muted?: boolean }
  | { kind: "list"; items: string[] }
  | { kind: "chart"; caption: string; labels: string[]; values: (number | null)[]; target: number }
  | { kind: "table"; table: Table };

export const h = (n: number | null) => (n === null ? "—" : `${hoursText(Math.round(n * 10) / 10)} h`);
export const pct = (n: number | null) => (n === null ? "—" : `${n}%`);
export const names = (list: string[]) => (list.length <= 1 ? list.join("") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`);

export class Doc {
  private blocks: Block[] = [];
  private section = 0;
  private tables = 0;
  heading(text: string) { this.blocks.push({ kind: "heading", text: `${++this.section}. ${text}` }); return this; }
  text(text: string, muted = false) { this.blocks.push({ kind: "text", text, muted }); return this; }
  list(items: string[], empty: string) { this.blocks.push(items.length ? { kind: "list", items } : { kind: "text", text: empty, muted: true }); return this; }
  table(caption: string, head: string[], rows: string[][], numeric: boolean[], total?: string[]) {
    if (!rows.length) return this.text(`${caption}: nothing to show.`, true);
    this.blocks.push({ kind: "table", table: { caption: `Table ${++this.tables}: ${caption}`, head, rows, numeric, total } });
    return this;
  }
  figures(rows: [string, string, string][]) { return this.table("Key figures", ["Measure", "Value", "Context"], rows, [false, true, false]); }
  chart(caption: string, d: ExportData) {
    this.blocks.push({ kind: "chart", caption: `Figure 1: ${caption}`, labels: d.trend.map((t) => t.label), values: d.trend.map((t) => t.utilisation), target: d.target });
    return this;
  }
  done() { return this.blocks; }
}

export type Section = {
  summary: (d: ExportData) => string | null;
  figures: (d: ExportData) => [string, string, string][];
  findings: (d: ExportData) => string[];
  body: (doc: Doc, d: ExportData) => unknown;
  method?: string[];
};
