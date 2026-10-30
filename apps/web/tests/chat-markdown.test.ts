import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "../components/chat/Markdown";

const html = (text: string) => renderToStaticMarkup(createElement(Markdown, { text }));

// 073: amax's replies render pipe tables and numbered lists as real elements, never as raw text or HTML.
describe("chat markdown", () => {
  it("renders a pipe table with a header, rows, and numbers right-aligned", () => {
    const out = html("Your week:\n| Day | Project | Hours |\n|---|---|---|\n| Mon Oct 19 | Fleet Tracker | 8 |\n| Tue Oct 20 | **Fleet Tracker** | 4.5 h |\nThat's 12.5 h.");
    expect(out).toContain("<table>");
    expect(out).toContain("<th>Day</th><th>Project</th><th class=\"num\">Hours</th>");
    expect(out).toContain("<td>Mon Oct 19</td><td>Fleet Tracker</td><td class=\"num\">8</td>");
    expect(out).toContain("<b>Fleet Tracker</b>");
    expect(out).not.toContain("|---|");
    expect(out).toContain("<p style=\"margin:0 0 6px\">That&#x27;s 12.5 h.</p>");
  });

  it("renders numbered and bulleted lists, and never passes HTML through", () => {
    const out = html("1. Split HR Insights\n2. Resubmit\n- a note\n<script>alert(1)</script>");
    expect(out).toContain("<ol");
    expect(out).toContain("<li>Split HR Insights</li><li>Resubmit</li></ol>");
    expect(out).toContain("<ul");
    expect(out).toContain("&lt;script&gt;");
    expect(out).not.toContain("<script>");
  });

  it("leaves a line with pipes but no separator row as text", () => {
    expect(html("a | b | c")).toBe("<p style=\"margin:0 0 6px\">a | b | c</p>");
  });
});
