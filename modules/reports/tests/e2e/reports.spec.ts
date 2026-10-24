import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, email: string, to: string) {
  await page.goto(to);
  await page.getByLabel("Demo user (fixtures only)").fill(email);
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
}

const axe = async (page: Page) => (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`);
const unpinned = (page: Page) => page.locator("main").evaluate((root) =>
  [...root.querySelectorAll(".card, .ticket, tbody tr, .list li")]
    .filter((el) => !el.closest("table.sr") && !el.querySelector(".pin[data-pin]") && !el.querySelector(".empty-line"))
    .map((el) => (el.textContent ?? "").trim().slice(0, 60)));
const chat = (page: Page) => page.getByRole("complementary", { name: "amax chat" });
const csvOf = async (page: Page) => decodeURIComponent((await page.getByRole("link", { name: "Export as CSV" }).getAttribute("href"))!.replace("data:text/csv;charset=utf-8,", ""));

test.beforeEach(async ({ page }) => page.setViewportSize({ width: 1440, height: 900 }));

test("AC1 AC2 utilisation leads with the team's 84%; trend and table readable by screen readers; CSV export; pinned, no forms", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/reports");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Utilisation in October");
  await expect(page.locator(".lede")).toHaveText("Billable hours from submitted and approved time ÷ available hours, October to date (Oct 1–16, 12 working days, 96 h per full-time person). Team: 222 ÷ 264 = 84%, against an 80% target.");
  await expect(page.locator("tr[data-person='Kasun Dias']")).toContainText("80 h2 days medical78.0 h70.0 h88%");
  await expect(page.locator("tr.total")).toContainText("Team264 h260.5 h222.0 h84%");
  await expect(page.getByRole("table", { name: "Utilisation per month against the 80% target" }).locator("tbody tr")).toHaveCount(12);
  expect((await csvOf(page)).split("\r\n").at(-1)).toBe('"Team","264","","260.5","222","84"');
  await expect(page.locator("main form, main input, main textarea, main select")).toHaveCount(0);
  expect(await unpinned(page)).toEqual([]);
  expect(await axe(page)).toEqual([]);

  await page.locator("tr[data-person='Kasun Dias'] .pin").click({ force: true });
  await expect(chat(page).locator(".pinchip > span").last()).toHaveText("Kasun Dias, utilisation in October");
});

test("AC1 Availability tab: the rest of October after holidays and leave, and the target goes to chat", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/reports");
  await page.getByRole("link", { name: "Availability" }).click();
  await expect(page).toHaveURL(/\/reports\?view=availability$/);
  await expect(page.locator("tr[data-person='Ayesha Rahman']")).toContainText("63 days annual48 h100%0 h");
  expect(await unpinned(page)).toEqual([]);
  expect(await axe(page)).toEqual([]);
  await page.getByRole("button", { name: "Ask amax to change the utilisation target" }).click();
  await expect(page.getByLabel("Message amax")).toHaveValue("Change the utilisation target from 80% to ");
});
