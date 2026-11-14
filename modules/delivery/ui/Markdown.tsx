import { Fragment, type ReactNode } from "react";

// 081 amendment 11 (AC-103): a proposal's description as text people read: paragraphs, `-`/`*` lists, `#` headings,
// **bold** and `code`. Built as React elements from the text, never as HTML, so nothing in a description can inject
// markup. Anything else stays as written.

/** **bold** and `code` within a line. */
export function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let at = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > at) out.push(text.slice(at, m.index));
    out.push(m[1] !== undefined ? <b key={i++}>{m[1]}</b> : <code key={i++}>{m[2]}</code>);
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}

type Block = { kind: "p"; lines: string[] } | { kind: "ul"; items: string[] } | { kind: "h"; text: string };

/** The text's blocks: a heading line, a run of list lines, or a paragraph (its lines kept as line breaks). */
export function blocks(text: string): Block[] {
  const out: Block[] = [];
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd(), last = out.at(-1);
    const item = /^\s*[-*]\s+(.*)$/.exec(line), head = /^#{1,6}\s+(.*)$/.exec(line);
    if (!line.trim()) out.push({ kind: "p", lines: [] });
    else if (head) out.push({ kind: "h", text: head[1] });
    else if (item) last?.kind === "ul" ? last.items.push(item[1]) : out.push({ kind: "ul", items: [item[1]] });
    else last?.kind === "p" ? last.lines.push(line) : out.push({ kind: "p", lines: [line] });
  }
  return out.filter((b) => b.kind !== "p" || b.lines.length > 0);
}

export function Markdown({ text }: { text: string }) {
  return (
    <div className="dv-md">
      {blocks(text).map((b, i) => b.kind === "h" ? <h3 key={i}>{inline(b.text)}</h3>
        : b.kind === "ul" ? <ul key={i}>{b.items.map((t, j) => <li key={j}>{inline(t)}</li>)}</ul>
        : <p key={i}>{b.lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l)}</Fragment>)}</p>)}
    </div>
  );
}
