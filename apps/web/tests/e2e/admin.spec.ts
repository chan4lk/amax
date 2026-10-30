import { randomBytes } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { ADMINS } from "./admins";

async function signIn(page: Page, email: string, to: string) {
  // 062: a signed-out / is the marketing page, so sign in from /signin, which lands on /.
  await page.goto(to === "/" ? "/signin" : to);
  await page.getByLabel("Demo user (fixtures only)").fill(email);
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
  await expect(page).toHaveURL((u) => u.pathname === to);
}

const SCREENS = ["/settings", "/settings/keys", "/settings/integrations", "/settings/ai", "/settings/workflows", "/settings/api"];
const chat = (page: Page) => page.getByRole("complementary", { name: "amax chat" });
const axe = async (page: Page) => (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`);
const unpinned = (page: Page) => page.locator("main").evaluate((root) =>
  [...root.querySelectorAll(".card, .app-card, .ticket, tbody tr")]
    .filter((el) => !el.closest("table.sr, [data-pricing-hidden]") && !el.querySelector(":scope > td[colspan]") && !el.querySelector(".pin[data-pin]"))
    .map((el) => (el.textContent ?? "").trim().slice(0, 60)));

test.beforeEach(async ({ page }) => page.setViewportSize({ width: 1440, height: 900 }));

for (const who of ADMINS) test(`047 AC1 the Settings hub lists every admin screen with a live status; the nav and profile menu link to it, as ${who.role} (055)`, async ({ page }) => {
  await signIn(page, who.email, "/settings");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Settings");
  const cards = page.locator(".app-card h2");
  // 034 AC-6: Backups and export is Admin only; IT Admin never sees the whole-tenant export.
  const backups = who.pricing ? ["Backups and export"] : [];
  await expect(cards).toHaveCount(8 + backups.length);
  expect((await cards.allTextContents()).sort()).toEqual(["AI and data", "AI usage", "API and webhooks", "Audit and trace", ...backups, "Connections and keys", "Data retention", "Integrations", "Scheduler"]);
  await expect(cards.first()).toHaveText("Connections and keys");
  await expect(page.locator(".app-card", { hasText: "Connections and keys" }).locator(".chip")).toHaveText("1 expiring");
  await expect(page.locator(".app-card.soon")).toHaveCount(0);
  await expect(page.locator(".app-card", { hasText: "AI usage" }).locator(".chip")).toHaveText(who.pricing ? /this month$/ : "Hidden for your role");
  await expect(page.getByRole("link", { name: "Audit and trace" })).toHaveAttribute("href", "/settings/audit");
  await expect(page.getByRole("link", { name: "AI usage" })).toHaveAttribute("href", "/settings/ai/usage");
  // 073: the reminder schedules run per legal entity and wait for an entity with no time zone.
  await expect(page.locator(".lede")).toContainText(who.pricing
    ? "4 things need you: the Azure DevOps credential expires in 12 days; 2 schedules wait for an entity's time zone; 1 privacy request needs a second approver; 1 tenant export needs a second Admin"
    : "3 things need you: the Azure DevOps credential expires in 12 days; 2 schedules wait for an entity's time zone; 1 privacy request needs a second approver.");
  await expect(page.getByRole("navigation").getByRole("link", { name: "Settings" }).first()).toHaveAttribute("href", "/settings");
  await page.getByRole("button", { name: /profile menu/ }).click();
  await expect(page.getByRole("menuitem", { name: "Settings", exact: true })).toHaveAttribute("href", "/settings");
  await page.keyboard.press("Escape");
  expect(await axe(page)).toEqual([]);
});

for (const who of ADMINS) test(`047 AC2 AC5 no form on the hub or the four screens, and every ticket, card and row has a pin, as ${who.role} (055)`, async ({ page }) => {
  await signIn(page, who.email, "/settings");
  for (const path of SCREENS) {
    await page.goto(path);
    await expect(page.locator("main h1")).toBeVisible();
    await expect(page.locator("main form, main dialog")).toHaveCount(0);
    expect([path, await unpinned(page)]).toEqual([path, []]);
  }
});

for (const who of ADMINS) test(`047 AC4 AC7 pin a credential, ask to rotate it, confirm with the masked field: Rotated today, and the value is nowhere on the page, as ${who.role} (055)`, async ({ page }) => {
  const VALUE = `test-e2e-${randomBytes(12).toString("hex")}`;
  await signIn(page, who.email, "/settings/keys");
  const row = page.locator("tr", { hasText: "Azure DevOps" });
  // The Ask chip pins the credential (get_secret_meta) and fills in the prompt.
  await row.getByRole("button", { name: "Ask to rotate Azure DevOps" }).click();
  await expect(chat(page).locator(".pinchip > span")).toHaveText(["Azure DevOps"]);
  await expect(page.getByLabel("Message amax")).toHaveValue("Rotate the Azure DevOps token, keep its expiry");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const card = page.getByRole("group", { name: /^Confirm:/ });
  const field = card.getByLabel("New value");
  await expect(field).toHaveAttribute("type", "password");
  expect(await axe(page)).toEqual([]);
  await field.fill(VALUE);
  await card.getByRole("button", { name: "Confirm" }).click();
  await expect(card).toContainText("saved to the vault");
  expect(await page.content()).not.toContain(VALUE);
  await page.reload();
  await expect(row).toContainText("Rotated today");
  await expect(row).toContainText("Expires in 12 days");
  expect(await page.content()).not.toContain(VALUE);
});

test("047 AC7 pin a schedule, ask to pause it, confirm: it shows Paused", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/settings/workflows");
  const row = page.locator("tr", { hasText: "Audit chain check" });
  await expect(row).toContainText("On");
  await row.getByRole("button", { name: "Ask to pause Audit chain check" }).click();
  await expect(chat(page).locator(".pinchip > span")).toHaveText(["Audit chain check"]);
  await expect(page.getByLabel("Message amax")).toHaveValue("Pause the Audit chain check schedule");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const card = page.getByRole("group", { name: /^Confirm:/ });
  await card.getByRole("button", { name: "Add it" }).click();
  await expect(card).toContainText("Done");
  await page.reload();
  await expect(row).toContainText("Paused");
  await expect(row.getByRole("button", { name: "Ask to resume Audit chain check" })).toBeVisible();
});

test("047 AC7 as IT Admin (055): ask to resume the paused schedule, confirm: it shows On", async ({ page }) => {
  await signIn(page, "ravi@lumenlabs.test", "/settings/workflows");
  const row = page.locator("tr", { hasText: "Audit chain check" });
  await row.getByRole("button", { name: "Ask to resume Audit chain check" }).click();
  await expect(page.getByLabel("Message amax")).toHaveValue("Resume the Audit chain check schedule");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const card = page.getByRole("group", { name: /^Confirm:/ });
  await card.getByRole("button", { name: "Add it" }).click();
  await expect(card).toContainText("Done");
  await page.reload();
  await expect(row).toContainText("On");
});

const OPERATIONS = ["Settings", "Access and licences", "Helpdesk", "Compliance", "Digital experience"];

// 037 built the last Coming-soon screen, so the Operations links now open their modules.
test("055 AC4 Admin and IT Admin get the Operations group, each link opening its built screen; other roles see none of it", async ({ page }) => {
  for (const who of ADMINS) {
    await page.context().clearCookies();
    await signIn(page, who.email, "/");
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.locator(".grp", { hasText: "Operations" })).toHaveCount(1);
    for (const label of OPERATIONS) await expect(nav.getByRole("link", { name: label, exact: true }), `${who.role} ${label}`).toBeVisible();
    // 038: Backups and export is a Settings hub card now, not a rail item.
    await expect(nav.getByRole("link", { name: "Backups and export", exact: true })).toHaveCount(0);
    await nav.getByRole("link", { name: "Digital experience", exact: true }).click();
    await expect(page).toHaveURL(/\/experience$/);
    await expect(page.locator("main h1")).toHaveText("Digital experience");
    // A settled page for axe: the rail's labels fade in on hover, and the click left the pointer there.
    await page.mouse.move(900, 500);
    await page.reload();
    expect(await axe(page)).toEqual([]);
  }
  await page.context().clearCookies();
  await signIn(page, "nimal@lumenlabs.test", "/");
  for (const label of OPERATIONS) await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: label, exact: true })).toHaveCount(0);
  expect((await page.goto("/operations/experience"))?.status()).toBe(404);
});

test("038 AC-3, AC-5 a rail taller than the window keeps the current and focused item in view and fades its hidden edge", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await signIn(page, ADMINS[0].email, "/");
  const nav = page.getByRole("navigation", { name: "Main" });
  const inView = (name: string) => nav.getByRole("link", { name, exact: true }).evaluate((el) => {
    const r = el.getBoundingClientRect(), box = el.closest("nav")!.getBoundingClientRect();
    return r.top >= box.top && r.bottom <= box.bottom;
  });
  expect(await nav.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await expect(nav).toHaveAttribute("data-fade-bottom", "true");
  const last = (await nav.getByRole("link").allInnerTexts()).at(-1)!.trim();
  await page.goto(await nav.getByRole("link", { name: last, exact: true }).getAttribute("href") as string);
  await expect(nav.getByRole("link", { name: last, exact: true })).toHaveAttribute("aria-current", "page");
  await expect.poll(() => inView(last)).toBe(true);
  await expect(nav).toHaveAttribute("data-fade-top", "true");
  await nav.getByRole("link", { name: "Overview", exact: true }).focus();
  await expect.poll(() => inView("Overview")).toBe(true);  // 038 AC-5: on a phone the More sheet lists Settings.
  await page.setViewportSize({ width: 390, height: 800 });
  await nav.getByRole("button", { name: "More" }).click();
  await expect(page.getByRole("dialog").getByRole("link", { name: "Settings", exact: true })).toBeVisible();
});

test("047 AC6 non-Admins get the 404 page on every admin screen, and chat refuses the admin writes", async ({ page }) => {
  await signIn(page, "nimal@lumenlabs.test", "/settings");
  for (const path of SCREENS) {
    expect([path, (await page.goto(path))?.status()]).toEqual([path, 404]);
    await expect(page.getByText("This page could not be found")).toBeVisible();
    await expect(page.locator("main table, main .app-card")).toHaveCount(0);
  }
  await page.goto("/");
  await page.getByRole("button", { name: "Ask amax" }).click();
  for (const ask of ["Rotate the GitHub token", "Pause the Audit chain check schedule"]) {
    await page.getByLabel("Message amax").fill(ask);
    await page.keyboard.press("Enter");
    await expect(page.locator(".m .b").last()).toContainText(/couldn't do that/);
  }
  await expect(page.getByRole("group", { name: /^Confirm:/ })).toHaveCount(0);
});
