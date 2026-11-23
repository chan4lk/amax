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

describe("chat markdown colours for capacity answers", () => {
  it("paints spare green, over and short red, not planned amber and FTE figures violet", () => {
    const out = html("**Kasun Dias** has 20% free. Your people: 2.8 FTE planned of 3.0 FTE, 0.2 FTE spare. Ayesha is over at 120%. 0.4 FTE short. Nimal is not planned.");
    expect(out).toContain('<span class="c-good">20% free</span>');
    expect(out).toContain('<span class="c-good">0.2 FTE spare</span>');
    expect(out).toContain('<span class="c-fte">2.8 FTE</span>');
    expect(out).toContain('<span class="c-fte">3.0 FTE</span>');
    expect(out).toContain('<span class="over">over</span>');
    expect(out).toContain('<span class="over">120%</span>');
    expect(out).toContain('<span class="over">0.4 FTE short</span>');
    expect(out).toContain('<span class="c-none">not planned</span>');
  });

  it("keeps the old rules: no longer over and nobody is over stay plain, 100% and 99% stay plain", () => {
    const out = html("Nobody is over. She is no longer over. 100% and 99% are fine.");
    expect(out).not.toContain('class="over"');
  });

  it("a team gap is never turned into a percent colour", () => {
    expect(html("4.4 FTE spare")).toBe('<p style="margin:0 0 6px"><span class="c-good">4.4 FTE spare</span></p>');
  });
});
