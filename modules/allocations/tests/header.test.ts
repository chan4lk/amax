import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { Header } from "../ui/Header";
import { forecast, grid } from "./people";

describe("allocations header", () => {
  it("AC1 shows the months, the group, the conflicts and a summary with the names in bold", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const html = renderToStaticMarkup(createElement(Header, { f: forecast, grid, group: "all", line: null, canAllocate: false }));
    expect(html).toContain("Dec → Feb");
    expect(html).toContain("Everyone · 3 people");
    expect(html).toContain("1 conflict · Dec");
    expect(html).toContain("<b>Ayesha</b> is over-allocated in December.");
  });
});
