import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const SECTIONS: [tab: string, path: string, heading: string][] = [
  ["Proposals", "/delivery/p/CON/proposals", "Proposals"],
  ["Releases", "/delivery/p/CON/releases", "Release map"],
  ["Risks and decisions", "/delivery/p/CON/risks", "Risks and decisions"],
  ["Team", "/delivery/p/CON/team", "Team"],
  ["Contract", "/delivery/p/CON/contract", "Contract"],
  ["Board", "/delivery/p/CON", "Contoso Portal"],
];

async function signIn(page: Page, to: string) {
  // 062: a signed-out / is the marketing page, so sign in from /signin, which lands on /.
  await page.goto(to === "/" ? "/signin" : to);
  await page.getByLabel("Demo user (fixtures only)").fill("maya@lumenlabs.test");
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
  await expect(page).toHaveURL((url) => url.pathname === to);
}

const axe = async (page: Page) => (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`);
const tabs = (page: Page) => page.getByRole("navigation", { name: "Sections" });

test("AC1 AC4 every section tab opens by keyboard, keeps the project header and marks itself current", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, "/delivery/p/CON");
  await expect(tabs(page).locator("[aria-disabled]")).toHaveCount(0);
  for (const [tab, path, heading] of SECTIONS) {
    await tabs(page).getByRole("link", { name: tab, exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL((url) => url.pathname === path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Contoso Portal");
    await expect(page.getByRole("heading", { name: heading, exact: true }).first()).toBeVisible();
    await expect(tabs(page).locator('[aria-current="page"]')).toHaveText(tab);
    expect(await axe(page), path).toEqual([]);
  }
});

test("AC2 AC3 AC4 sections show only this project's records, the team from allocations, and an Ask amax chip where a change is pending", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page, "/delivery/p/CON/releases");
  const releases = page.locator(".card.flush tbody tr");
  expect(await releases.count()).toBeGreaterThan(0);
  // 144, 147: a project's own tabs leave out the Project column, so each row is this project's by its link.
  for (const row of await releases.all()) await expect(row.locator("a.rowlink").first()).toHaveAttribute("href", /^\/delivery\/releases\/CON\//);
  await page.goto("/delivery/p/CON/proposals");
  const proposals = page.locator(".card.flush tbody tr");
  expect(await proposals.count()).toBeGreaterThan(0);
  for (const row of await proposals.all()) await expect(row.locator(".prop-cell a").first()).toHaveAttribute("href", /^\/delivery\/proposals\/CON-/);
  await page.goto("/delivery/p/CON/team");
  const team = page.locator(".card.flush tbody tr");
  expect(await team.count()).toBeGreaterThan(0);
  for (const row of await team.all()) {
    await expect(row.locator("td").nth(2)).toHaveText(/%|–/);
    await expect(row.getByRole("button", { name: /^Add .+ to chat$/ })).toHaveCount(1);
  }
  for (const [path, arrives] of [["/delivery/p/CON/risks", "Arrives with RAID logs"], ["/delivery/p/CON/contract", "Arrives with finance, 017"]]) {
    await page.goto(path);
    await expect(page.getByText(arrives)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Ask amax about Contoso Portal/ })).toBeVisible();
  }
});
