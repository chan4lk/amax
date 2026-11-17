import type { ReactNode } from "react";

// The model writes light markdown; render **bold**, `code`, line breaks, "- " and "1. " lists and pipe tables as React
// elements (never HTML), so model text can't inject markup.
const OVER_SRC = String.raw`\b(?:10[1-9]|1[1-9]\d|[2-9]\d\d)%|(?<!(?:no longer|not|isn't|aren't|nobody is|no one is) )\bover(?:-allocated| allocated)?\b|\b\d+(?:\.\d+)? FTE short\b`;
const GOOD_SRC = String.raw`\b\d+(?:\.\d+)?(?:%| FTE| people)? (?:spare|free)\b|\bspare\b|\bfree capacity\b|\bwithin capacity\b`;
const NONE_SRC = String.raw`\bnot planned\b|\bnothing (?:is )?planned\b`;
const FTE_SRC = String.raw`\b\d+(?:\.\d+)? FTE\b`;
const PAINT = new RegExp(`(${OVER_SRC}|${GOOD_SRC}|${NONE_SRC}|${FTE_SRC})`, "gi");
const isKind = (src: string, text: string) => new RegExp(`^(?:${src})$`, "i").test(text);
const kindOf = (text: string) => (isKind(OVER_SRC, text) ? "over" : isKind(GOOD_SRC, text) ? "c-good" : isKind(NONE_SRC, text) ? "c-none" : "c-fte");
const WARN = /are you sure\?/i;
const overs = (text: string, key: string): ReactNode[] =>
  text.split(PAINT).map((p, i) => (i % 2 ? <span key={`${key}-o${i}`} className={kindOf(p)}>{p}</span> : p));
function inline(text: string, key: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).flatMap((part, i): ReactNode[] =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? [<b key={`${key}-${i}`}>{overs(part.slice(2, -2), `${key}-${i}`)}</b>]
      : part.startsWith("`") && part.endsWith("`") && part.length > 2 ? [<code key={`${key}-${i}`}>{part.slice(1, -1)}</code>] : overs(part, `${key}-${i}`));
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
  const lines = text.replace(/ of 100%/g, "").split("\n");
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
    if (line.trim()) blocks.push(<p key={i} className={WARN.test(line) ? "warn" : undefined} style={{ margin: "0 0 6px" }}>{inline(line, `p${i}`)}</p>);
  }
  flush();
  return <>{blocks}</>;
}
