import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { capture, diffRatio } from "./diff";

// 041 AC-6: every delivery section against the mock, region by region, at 1440 and 390 px, within 2%. Runs before
// AMX is imported (see playwright.auth.config.ts) and with the tenant's delivery.clock_pin at fixtures.md's Oct 16 (global-auth.ts).
const mockUrl = (id: string) => `${pathToFileURL(join(import.meta.dirname, "../../../../.specclaw/mock/index.html")).href}#${id}`;

const SECTIONS: { id: string; path: string; regions: string[] }[] = [
  { id: "001-amax-foundation-projects", path: "/delivery", regions: [".row.head", ".tickets .ticket", ".cols.even > .card", ".card.flush .card-head", ".card.flush tbody tr"] },
  { id: "001-amax-foundation-project", path: "/delivery/p/CON", regions: [".crumb", ".row.head", ".tabs", ".board .lane"] },
  { id: "001-amax-foundation-proposals", path: "/delivery/proposals", regions: ["h1", ".lede", ".cols.even > .card:first-child", ".cols.even > .card:last-child", ".card.flush .card-head", ".card.flush tbody tr"] },
  { id: "001-amax-foundation-releases", path: "/delivery/releases", regions: ["h1", ".lede", ".card.map", ".card.flush .card-head", ".card.flush tbody tr"] },
];

// Known gaps, each with its reason; every other region must be within 2%.
const ALLOW: Record<string, [number, string]> = {
  "* /delivery/proposals .card.flush tbody tr": [0.03, "the mock's table says \"Invoice export\"; fixtures.md and the mock's own board say \"Invoice export to PDF\", which widens the column"],
  "* /delivery .tickets .ticket": [0.04, "the mock's \"1 more in presales handover\" needs presales data (020); the app says \"For 3 clients\""],
  "* /delivery/proposals .cols.even > .card:last-child": [0.04, "the mock's shipped bars (W41 4, W42 6) disagree with its own \"5 released this month\"; the chart counts proposal.released_at, the phase card's source too (041 review round 1), so W41, W42 and the trend differ (module README)"],
  "390 /delivery/p/CON .crumb": [0.03, "same text and box; Chromium antialiases it in greyscale in the app and subpixel in the mock at phone width"],
  "390 /delivery/p/CON .tabs": [0.03, "same as the breadcrumb"],
};
const allowed = (width: number, path: string, sel: string) => (ALLOW[`${width} ${path} ${sel}`] ?? ALLOW[`* ${path} ${sel}`])?.[0] ?? 0.02;

async function signIn(page: Page) {
  await page.goto("/delivery");
  await page.getByLabel("Demo user (fixtures only)").fill("maya@lumenlabs.test");
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/delivery");
}

for (const width of [1440, 390] as const) {
  test(`AC6 delivery sections match the mock at ${width} px (each region within 2%)`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 900 });
    await signIn(page);
    const mock = await context.newPage();
    await mock.setViewportSize({ width, height: 900 });
    const misses: string[] = [];
    for (const s of SECTIONS) {
      // 081 amendment 4: Repo sync and the band sit above the board, so it starts below a 900 px window. A screenshot that
      // has to scroll first renders differently from the mock's, which needs none; a tall window keeps both unscrolled.
      await page.setViewportSize({ width, height: s.path === "/delivery/p/CON" ? 4000 : 900 });
      await page.goto(s.path);
      await mock.goto("about:blank");
      await mock.goto(mockUrl(s.id));
      // The shell's fixed layers (phone rail, closed chat panel) sit over the section and change how
      // its text is rasterised; they are the shell's, not the section's.
      for (const p of [page, mock]) await p.addStyleTag({ content: ".rail{visibility:hidden} .chat{display:none}" });
      for (const sel of s.regions) {
        const want = mock.locator(`section.on ${sel}`), got = page.locator(`main ${sel}`);
        const n = await want.count();
        expect(await got.count(), `${s.path} ${sel}`).toBeGreaterThanOrEqual(n);
        for (let i = 0; i < n; i++) {
          const [a, b] = [await capture(want.nth(i)), await capture(got.nth(i))];
          const ratio = diffRatio(a, b), where = `${s.path} ${sel} #${i + 1}`;
          if (process.env.DIFF_DIR) for (const [tag, r] of [["mock", a], ["app", b]] as const) writeFileSync(join(process.env.DIFF_DIR, `${width}${where.replace(/\W+/g, "_")}-${tag}.png`), r.png);
          if (ratio > allowed(width, s.path, sel)) misses.push(`${where}: ${a.box.width}x${a.box.height} vs ${b.box.width}x${b.box.height}, ${(ratio * 100).toFixed(1)}%`);
        }
      }
    }
    expect(misses).toEqual([]);
  });
}
