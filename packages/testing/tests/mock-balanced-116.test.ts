import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..", "..");
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr", "path", "circle", "rect", "line", "polyline", "polygon", "stop", "use"]);

/** Elements opened in the mock's markup (before its script) that a later close skipped past, by tag and line. */
function unclosed(html: string) {
  const body = html.slice(0, html.indexOf("<script>")).replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, " "));
  const open: { tag: string; line: number }[] = [];
  const skipped: string[] = [];
  for (const m of body.matchAll(/<(\/?)([a-zA-Z][\w-]*)\b[^>]*?(\/?)>/g)) {
    const [, close, name, self] = m;
    const tag = name.toLowerCase();
    if (VOID.has(tag) || self) continue;
    if (!close) { open.push({ tag, line: body.slice(0, m.index).split("\n").length }); continue; }
    const at = open.map((o) => o.tag).lastIndexOf(tag);
    if (at < 0) continue;
    skipped.push(...open.slice(at + 1).map((o) => `${o.tag}@${o.line}`));
    open.length = at;
  }
  return skipped;
}

// 116 AC-9: a section left open hides every section after it in the clickable mock; the deployed copy matches.
describe("116 AC-9 the clickable mock's markup is balanced", () => {
  const mock = readFileSync(join(ROOT, ".specclaw/mock/index.html"), "utf8");
  it("AC9 no element is left open, so every section renders", () => {
    expect(unclosed(mock)).toEqual([]);
  });
  it("AC9 the deployed copy is the spec mock", () => {
    expect(readFileSync(join(ROOT, "apps/mock/public/mock/index.html"), "utf8")).toBe(mock);
  });
  it.each([
    ["a section left open", "<section><div></div>\n<section></section></section>", []],
    ["a div left open inside a section", "<section><div>\n</section>", ["div@1"]],
  ])("AC9 the check finds %s", (_n, html, found) => {
    expect(unclosed(`${html}<script>`)).toEqual(found);
  });
});
