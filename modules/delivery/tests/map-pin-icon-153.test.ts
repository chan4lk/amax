import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Viewer } from "@amax/auth";
import type { ReleaseRow } from "../server/queries";
import { ReleasesCards } from "../ui/ReleasesPage";

// 153: the map's size rule (760 px minimum) sized the card's pin icon too, which shows on hover as a "+" across the map.
const css = readFileSync(new URL("../ui/delivery.css", import.meta.url), "utf8");
const st = (environment: string, position: number, isProd: boolean, status: string | null, at: string | null = null) =>
  ({ environment, environmentId: `env-${environment}`, deploymentId: status ? `dep-${environment}` : null, position, isProd, status, at, note: null, run: null });
const release = { id: "r1", projectId: "p1", version: "v1", projectKey: "CON", projectName: "Contoso", projectColor: "violet", proposals: 1,
  stages: [st("Dev", 1, false, "deployed", "2026-10-12T09:00:00Z"), st("Prod", 2, true, null)] } as unknown as ReleaseRow;
const viewer = { tenantId: "t", userId: "u", name: "Maya", email: "maya@example.test", assignments: [], actualRoles: [] } as unknown as Viewer;

describe("153 the Release map's size rule sizes only the map", () => {
  it("AC-1 no .map rule sizes an svg nested in the card; the drawing keeps its 760-px minimum", () => {
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({ selector: selector.trim(), body }));
    const sized = rules.filter((r) => /\bsvg\b/.test(r.selector) && /\.map\b/.test(r.selector) && /\b(width|height)\s*:/.test(r.body));
    expect(sized.map((r) => r.selector)).toEqual([".map>svg"]);
    expect(sized[0].body).toMatch(/min-width:760px/);
  });

  it("AC-2 in the rendered card the map drawing is the card's direct svg child and the pin's icon isn't", () => {
    const html = renderToStaticMarkup(createElement(ReleasesCards, { viewer, releases: [release], now: new Date("2026-10-16T12:00:00Z"), root: "/delivery/releases" }));
    const card = html.slice(html.indexOf('class="card map'), html.indexOf("</svg>", html.indexOf('role="img"')) + 6);
    expect(card).toMatch(/<svg viewBox="0 0 \d+ \d+" role="img"/);
    expect(card).toMatch(/class="card-head"><h2>Release map<\/h2><button[^>]*class="pin inline"[^>]*><svg viewBox="0 0 24 24"/);
    // Elements still open between the card's own tag and each svg: none for the drawing (a direct child, so `.map>svg`
    // sizes it), the card head and the pin's button for the icon (so the rule can't reach it).
    const depth = (at: number) => [...card.slice(0, at).matchAll(/<(\/?)(div|nav|button)\b[^>]*>/g)].reduce((d, [, close]) => d + (close ? -1 : 1), 0);
    expect([depth(card.indexOf('role="img"')), depth(card.indexOf('viewBox="0 0 24 24"'))]).toEqual([0, 2]);
  });
});
