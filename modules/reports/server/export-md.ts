import type { Block, Table } from "./export-blocks";

export type MdReport = { title: string; meta: string; blocks: Block[] };

const cell = (s: string) => s.replace(/\|/g, "/").replace(/\n/g, " ");
const row = (cells: string[]) => `| ${cells.map(cell).join(" | ")} |`;

function tableMd(t: Table) {
  return [`*${t.caption}*`, "", row(t.head), `|${t.numeric.map((n) => (n ? " --: " : " --- ")).join("|")}|`,
    ...t.rows.map(row), ...(t.total ? [row(t.total.map((c) => (c ? `**${c}**` : "")))] : []), ""].join("\n");
}

function blockMd(b: Block): string {
  if (b.kind === "heading") return `## ${b.text}\n`;
  if (b.kind === "text") return `${b.muted ? `_${b.text}_` : b.text}\n`;
  if (b.kind === "list") return `${b.items.map((it, i) => `${i + 1}. ${it}`).join("\n")}\n`;
  if (b.kind === "chart") return ["```chart", JSON.stringify({ caption: b.caption, labels: b.labels, values: b.values, target: b.target }), "```", ""].join("\n");
  return tableMd(b.table);
}

export const toMarkdown = (r: MdReport) => [`# ${r.title}`, "", `_${r.meta}_`, "", ...r.blocks.map(blockMd)].join("\n");

const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
const unbold = (s: string) => s.replace(/^\*\*(.*)\*\*$/, "$1");

export function fromMarkdown(md: string): MdReport {
  const lines = md.split("\n");
  const out: MdReport = { title: "", meta: "", blocks: [] };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith("# ")) out.title = l.slice(2);
    else if (l.startsWith("## ")) out.blocks.push({ kind: "heading", text: l.slice(3) });
    else if (l.startsWith("```chart")) { out.blocks.push({ kind: "chart", ...JSON.parse(lines[++i]) }); i++; }
    else if (/^\d+\. /.test(l)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) items.push(lines[i++].replace(/^\d+\. /, ""));
      i--;
      out.blocks.push({ kind: "list", items });
    } else if (/^\*Table \d+:/.test(l)) {
      const caption = l.slice(1, -1), head = cells(lines[i + 2]), numeric = cells(lines[i + 3]).map((c) => c.endsWith(":"));
      const body: string[][] = [];
      for (i += 4; i < lines.length && lines[i].startsWith("|"); i++) body.push(cells(lines[i]));
      const last = body[body.length - 1];
      const total = last && last.some((c) => /^\*\*.*\*\*$/.test(c)) ? body.pop()!.map(unbold) : undefined;
      out.blocks.push({ kind: "table", table: { caption, head, rows: body, numeric, total } });
    } else if (/^_.*_$/.test(l)) {
      if (!out.meta && !out.blocks.length) out.meta = l.slice(1, -1);
      else out.blocks.push({ kind: "text", text: l.slice(1, -1), muted: true });
    } else if (l.trim()) out.blocks.push({ kind: "text", text: l });
  }
  return out;
}
