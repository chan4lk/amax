import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const open = async (page: Page, path: string) => {
  await page.goto("/signin");
  await page.getByLabel("Demo user (fixtures only)").fill("maya@lumenlabs.test");
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/signin"));
  await page.goto(path);
};

test("081 AC1 AC2 AC4 the screen has no added controls, the bench names people, and a shared link says what it shows", async ({ page }) => {
  await open(page, "/allocations?view=everyone&q=Ama&filter=over");
  const main = page.getByRole("main");
  await expect(main.locator("select")).toHaveCount(1);
  await expect(main.locator("input[type=search]")).toHaveCount(0);
  await expect(main.getByRole("group", { name: "Filter people" })).toHaveCount(0);
  await expect(main.getByText("Needs attention")).toHaveCount(0);
  await expect(main.getByRole("status")).toContainText("Showing people starting with Ama and over-allocated people in Everyone");
  await page.goto("/allocations");
  await expect(main.locator(".bench-list tbody tr").first()).toBeVisible();
  await expect(main.getByText(/\d+ more, ask amax for the full list\./)).toBeVisible();
  await expect(main.getByLabel("Whose projects to show")).toHaveClass(/tone-mine/);
});

test("081 AC11 the page passes axe in light and dark", async ({ page }) => {
  await open(page, "/allocations");
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(violations.map((v) => `${scheme} ${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
  }
});

test("081 AC18 the View dropdown switches in place and the people grid scrolls in its own area", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 560 });
  await open(page, "/allocations");
  await page.getByLabel("Whose projects to show").selectOption("everyone");
  await expect(page).toHaveURL(/view=everyone/);
  await expect(page.getByLabel("Whose projects to show")).toHaveClass(/tone-everyone/);
  const grid = page.getByRole("region", { name: "People by month" });
  expect((await grid.boundingBox())?.height ?? 0).toBeLessThanOrEqual(560);
  expect(await grid.evaluate((el) => getComputedStyle(el).overflowY)).toBe("auto");
});
