import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, email: string, to: string) {
  // 062: a signed-out / is the marketing page, so sign in from /signin, which lands on /.
  await page.goto(to === "/" ? "/signin" : to);
  await page.getByLabel("Demo user (fixtures only)").fill(email);
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
  await expect(page).toHaveURL((u) => u.pathname === to);
}
const unpinned = (page: Page) => page.locator("main").evaluate((root) =>
  [...root.querySelectorAll(".card, .ticket, tbody tr")]
    .filter((el) => !el.querySelector(".pin[data-pin]") && !el.closest(".ticket")?.parentElement?.querySelector(".pin[data-pin]"))
    .map((el) => (el.textContent ?? "").trim().slice(0, 60)));

test.beforeEach(async ({ page }) => page.setViewportSize({ width: 1440, height: 900 }));

test("006 Suggestions: decisions first, the undo window and agent jobs, every row pinned, chat-first, accessible", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page, "maya@lumenlabs.test", "/suggestions");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Suggestions");
  await expect(page.locator(".lede")).toContainText("Agents never change data on their own. 2 suggestions need your decision");
  await expect(page.locator(".ticket .k")).toHaveText(["Needs your decision", "Second approver needed", "Can still be undone", "Expiring today"]);
  const decide = page.locator(".card", { has: page.getByRole("heading", { name: "Needs your decision" }) });
  await expect(decide.locator("tbody tr")).toHaveCount(2);
  await expect(decide.locator("tbody tr", { hasText: "Kasun Dias" })).toContainText("External source: emailEmail from a.lee@wideworld.test (fictional)");
  await expect(page.locator(".card", { has: page.getByRole("heading", { name: "Accepted, can be undone" }) }).locator("tbody tr")).toContainText("Move Nimal Silva to 50% on Contoso Portal in January");
  await expect(page.locator(".card", { has: page.getByRole("heading", { name: "Agent jobs" }) })).toContainText("Allocation check");
  expect(await unpinned(page)).toEqual([]);
  await expect(page.locator("main form, main textarea, main input, main dialog")).toHaveCount(0);
  const accept = page.getByRole("button", { name: "Ask amax to accept Move Ayesha Rahman to 50% on HR Insights in December" });
  await expect(accept).toHaveAttribute("data-tool", "accept_agent_suggestion");
  await expect(accept).toHaveAttribute("data-ask", /^Accept the suggestion "Move Ayesha Rahman to 50% on HR Insights in December" \(suggestion id [0-9a-f-]{36}\)$/);
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(violations.map((v) => `${colorScheme} ${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
  }
  await page.goto("/allocations");
  await expect(page.getByRole("region", { name: "Conflicts" })).toBeVisible();
  await expect(page.getByRole("link", { name: /All suggestions/ })).toHaveAttribute("href", "/suggestions");
});

test("006 AC-5 suggestions outside a person's scope are never shown", async ({ page }) => {
  await signIn(page, "kasun@lumenlabs.test", "/suggestions");
  await expect(page.getByText("Nothing to decide")).toBeVisible();
  await expect(page.locator("main tbody tr[data-suggestion]")).toHaveCount(0);
});
