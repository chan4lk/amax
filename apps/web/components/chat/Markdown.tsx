import type { ReactNode } from "react";

// The model writes light markdown; render **bold**, `code`, line breaks, "- " and "1. " lists and pipe tables as React
// elements (never HTML), so model text can't inject markup.
function inline(text: string, key: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? <b key={`${key}-${i}`}>{part.slice(2, -2)}</b>
      : part.startsWith("`") && part.endsWith("`") && part.length > 2 ? <code key={`${key}-${i}`}>{part.slice(1, -1)}</code> : part);
}

const isRow = (line: string) => /^\s*\|.*\|\s*$/.test(line);
const isRule = (line: string) => /^\s*\|(\s*:?-{2,}:?\s*\|)+\s*$/.test(line);
const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
// A column whose body cells are all numbers (or a dash) reads right-aligned, as the app's own tables do.
const numeric = (rows: string[][], col: number) => rows.length > 0 && rows.every((r) => /^[-–—]$|^[$€£]?\s?-?[\d.,]+\s?(h|%|USD|LKR|AUD)?$/.test(r[col] ?? ""));

// 073: a pipe table the model writes ("| Day | Project | Hours |", then "|---|---|---|") becomes a real table.
function Table({ lines, at }: { lines: string[]; at: number }) {
  const [head, ...body] = [cells(lines[0]), ...lines.slice(2).map(cells)];
  return (
    <div className="c-table" role="region" aria-label="Table" tabIndex={0}>
      <table>
        <thead><tr>{head.map((h, j) => <th key={j} className={numeric(body, j) ? "num" : undefined}>{inline(h, `t${at}h${j}`)}</th>)}</tr></thead>
        <tbody>{body.map((r, i) => <tr key={i}>{head.map((_, j) => <td key={j} className={numeric(body, j) ? "num" : undefined}>{inline(r[j] ?? "", `t${at}r${i}c${j}`)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.split("\n");
  let list: { ordered: boolean; items: ReactNode[] } | null = null;
  const flush = () => {
    if (!list) return;
    const style = { margin: "6px 0", paddingLeft: 20 };
    blocks.push(list.ordered ? <ol key={`l${blocks.length}`} style={style}>{list.items}</ol> : <ul key={`l${blocks.length}`} style={style}>{list.items}</ul>);
    list = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isRow(line) && isRule(lines[i + 1] ?? "")) {
      flush();
      let end = i + 2;
      while (end < lines.length && isRow(lines[end])) end++;
      blocks.push(<Table key={`t${i}`} lines={lines.slice(i, end)} at={i} />);
      i = end - 1;
      continue;
    }
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/), number = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const item = bullet ?? number;
    if (item) {
      const ordered = Boolean(number);
      if (list && list.ordered !== ordered) flush();
      list ??= { ordered, items: [] };
      list.items.push(<li key={i}>{inline(item[1], `l${i}`)}</li>);
      continue;
    }
    flush();
    if (line.trim()) blocks.push(<p key={i} style={{ margin: "0 0 6px" }}>{inline(line, `p${i}`)}</p>);
  }
  flush();
  return <>{blocks}</>;
}
