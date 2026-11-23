import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, email: string, to: string) {
  // 062: a signed-out / is the marketing page, so sign in from /signin, which lands on /.
  await page.goto(to === "/" ? "/signin" : to);
  await page.getByLabel("Demo user (fixtures only)").fill(email);
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
  await expect(page).toHaveURL((u) => u.pathname === to);
}
const axe = async (page: Page) => (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`);
const calls = async (page: Page) => Number((await page.getByTestId("chat-usage").innerText()).match(/· ([\d,]+) calls?/)![1].replace(/,/g, ""));

test.beforeEach(async ({ page }) => page.setViewportSize({ width: 1440, height: 900 }));

test("048 AC-3 AC-5 the chat footer shows my own month; an unpriced model shows as unknown, never $0", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/delivery");
  await page.getByRole("button", { name: "Ask amax" }).click();
  const before = await calls(page);
  await page.getByLabel("Message amax").fill("what projects are there?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByTestId("chat-usage")).toContainText(`${before + 1} call`);
  await expect(page.getByTestId("chat-usage")).toContainText("This month: Unknown");
  await expect(page.getByTestId("chat-usage").getByRole("button", { name: "Add My AI usage this month to chat" })).toBeAttached();
});

test("048 AC-2 AC-6 AI usage: tickets, cost per day, people and conversations, all pinnable; axe light and dark", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/settings/ai/usage");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("AI usage");
  await expect(page.locator(".tickets .ticket")).toHaveCount(4);
  await expect(page.locator(".tickets > .pinnable > .pin")).toHaveCount(4);
  // Some calls have no price: the count isn't zero. (A plain "0 calls" check also matched "20 calls" once the suite made 20.)
  await expect(page.locator(".ticket", { hasText: "Unknown cost" })).toContainText(/(^|\D)[1-9]\d* calls/);
  const maya = page.getByRole("table", { name: "AI usage by person" }).locator("tr", { hasText: "Maya" });
  await expect(maya).toContainText("Unknown");
  await expect(maya.locator(".pin")).toHaveCount(1);
  const convo = page.getByRole("table", { name: /most expensive chat conversations/ }).locator("tbody tr").first();
  await expect(convo).toContainText("Chat started");
  await expect(convo.locator(".pin")).toHaveCount(1);
  expect(await page.locator(".usage-pt .pin").count()).toBe(new Date().getUTCDate());
  await page.getByRole("combobox", { name: "Source" }).selectOption("jobs");
  await expect(page).toHaveURL(/source=jobs/);
  await expect(maya).toHaveCount(0);
  await page.getByRole("combobox", { name: "Source" }).selectOption("");
  await expect(maya).toBeVisible();
  expect(await axe(page)).toEqual([]);
  await page.emulateMedia({ colorScheme: "dark" });
  expect(await axe(page)).toEqual([]);
});

test("048 AC-3 AI usage is Admin only, and the footer shows only your own figures", async ({ page }) => {
  await signIn(page, "nimal@lumenlabs.test", "/delivery");
  await page.getByRole("button", { name: "Ask amax" }).click();
  // Earlier specs (047's admin refusals) may have chatted as Nimal, so the count isn't fixed; the
  // scoping itself is unit tested in packages/ai/tests/usage.test.ts.
  await expect(page.getByTestId("chat-usage")).toHaveText(/^This month: (\$\d+\.\d{2}|Unknown|\$\d+\.\d{2} \+ unknown) · \d+ calls?$/);
  await page.goto("/settings/ai/usage");
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText("AI usage");
});

test("055 AC-3 AC-5 AI usage as IT Admin: calls and tokens, every money figure hidden with no pin, none in the page", async ({ page }) => {
  await signIn(page, "ravi@lumenlabs.test", "/settings/ai/usage");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("AI usage");
  await expect(page.locator(".lede")).toContainText("Prices are hidden for your role.");
  await expect(page.locator(".tickets .ticket")).toHaveCount(4);
  const cost = page.locator("[data-pricing-hidden]");
  await expect(cost).toContainText("Hidden for your role");
  await expect(cost.locator(".pin")).toHaveCount(0);
  await expect(page.locator(".tickets > .pinnable > .pin")).toHaveCount(3);
  await expect(page.getByRole("heading", { name: "Calls per day" })).toBeVisible();
  const people = page.getByRole("table", { name: "AI usage by person" });
  await expect(people.getByRole("columnheader", { name: "Cost" })).toHaveCount(0);
  await expect(people.locator("tr", { hasText: "Maya" }).locator(".pin")).toHaveCount(1);
  await expect(page.getByRole("table", { name: /most calls/ }).getByRole("columnheader", { name: "Cost" })).toHaveCount(0);
  expect(await page.locator("main").innerHTML()).not.toMatch(/\$\d|\+ unknown/);
  expect(await axe(page)).toEqual([]);
  await page.goto("/settings");
  await expect(page.locator(".app-card", { hasText: "AI usage" }).locator(".chip")).toHaveText("Hidden for your role");
  expect(await page.locator("main").innerHTML()).not.toMatch(/\$\d/);
});
