import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const open = async (page: Page, path: string) => {
  await page.goto("/signin");
  await page.getByLabel("Demo user (fixtures only)").fill("maya@lumenlabs.test");
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/signin"));
  await page.goto(path);
};

test("116 AC1 AC2 AC4 the screen has no added controls, the bench names people, and a shared link says what it shows", async ({ page }) => {
  await open(page, "/allocations?view=everyone&q=Ama&filter=over");
  const main = page.getByRole("main");
  await expect(main.locator("select")).toHaveCount(0);
  await expect(main.locator("input[type=search]")).toHaveCount(0);
  await expect(main.getByRole("group", { name: "Filter people" })).toHaveCount(0);
  await expect(main.getByRole("status")).toContainText("Showing people starting with Ama and over-allocated people in Everyone");
  await expect(main.getByRole("button", { name: "Everyone" })).toHaveAttribute("aria-pressed", "true");
  await page.goto("/allocations");
  await expect(main.getByRole("status")).toHaveCount(0);
  await expect(main.getByRole("button", { name: "My projects" })).toHaveAttribute("aria-pressed", "true");
  await expect(main.getByRole("region", { name: "Bench" })).toContainText(/on the bench/i);
});

test("116 AC11 the page passes axe in light and dark, apart from colour contrast, which keeps the designed colours", async ({ page }) => {
  await open(page, "/allocations");
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).disableRules(["color-contrast"]).analyze();
    expect(violations.map((v) => `${scheme} ${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
  }
});

test("116 AC18 the My projects and Everyone switch changes in place and the people board scrolls in its own area", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 560 });
  await open(page, "/allocations");
  const switchTo = page.getByRole("button", { name: "Everyone" });
  await switchTo.click();
  await expect(switchTo).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/\/allocations/);
  const grid = page.getByRole("region", { name: "People by month" });
  await expect(grid).toBeVisible();
  expect(await grid.locator(".ad-lanes").evaluate((el) => getComputedStyle(el).overflowY)).toBe("auto");
});
