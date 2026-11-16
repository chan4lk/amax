import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function signInAs(page: Page, email: string) {
  await page.goto("/delivery");
  await expect(page).toHaveURL(/\/signin\?next=%2Fdelivery$/);
  await page.getByLabel("Demo user (fixtures only)").fill(email);
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
}

test("AC1 signed-out visitors are sent to sign-in, then land where they were going", async ({ page }) => {
  await signInAs(page, "maya@lumenlabs.test");
  await expect(page).toHaveURL(/\/delivery$/);
  const me = page.getByRole("button", { name: /Maya Fernando, Admin, profile menu/ });
  await expect(me).toBeVisible();
  await expect(me).toContainText("Admin · Leadership · PM");
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
});

test("AC5 View as previews a role: chip, banner and nav change, and the real user is kept", async ({ page }) => {
  await signInAs(page, "maya@lumenlabs.test");
  await page.getByRole("button", { name: /profile menu/ }).click();
  await page.getByRole("menuitemradio", { name: "Payroll" }).click();
  await expect(page.getByRole("note")).toHaveText("Viewing as Payroll: screens outside payroll are hidden.");
  await expect(page.getByRole("button", { name: /Maya Fernando, Payroll, profile menu/ })).toBeVisible();
  // 055: View as IT Admin keeps the Operations group and hides prices.
  await page.getByRole("button", { name: /profile menu/ }).click();
  await page.getByRole("menuitemradio", { name: "IT Admin" }).click();
  await expect(page.getByRole("note")).toHaveText("Viewing as IT Admin: prices are hidden.");
  await expect(page.getByRole("button", { name: /Maya Fernando, IT Admin, profile menu/ })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Settings", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /profile menu/ }).click();
  await page.getByRole("menuitemradio", { name: "Admin", exact: true }).click();
  await expect(page.getByRole("note")).toHaveCount(0);
});

test("AC5 non-admins get no View as, and nav shows only screens their roles allow", async ({ page }) => {
  await signInAs(page, "nimal@lumenlabs.test");
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Projects" })).toBeVisible();
  await page.getByRole("button", { name: /Nimal Silva, Engineer, profile menu/ }).click();
  await expect(page.getByRole("menuitemradio", { name: "Payroll" })).toHaveCount(0);
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/signin/);
  await page.goto("/delivery");
  await expect(page).toHaveURL(/\/signin/);
});

test("AC1 a deactivated user (a leaver) can't sign in", async ({ page }) => {
  await page.goto("/signin");
  await page.getByLabel("Demo user (fixtures only)").fill("rizwan@lumenlabs.test");
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
  await expect(page.getByTestId("signin-error")).toContainText("Wrong email or password");
  await expect(page).toHaveURL(/\/signin/);
});

test("password sign-in (hosted, no identity provider): wrong password refused, right one signs in", async ({ page }) => {
  await page.goto("/signin");
  await expect(page.getByRole("button", { name: /Sign in with Microsoft/ })).toHaveCount(0);
  await page.getByLabel("Email", { exact: true }).fill("ops@lumenlabs.test");
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByTestId("signin-error")).toContainText("Wrong email or password");
  await page.getByLabel("Email", { exact: true }).fill("ops@lumenlabs.test");
  await page.getByLabel("Password").fill("e2e-ops-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: /Ops Admin, Admin, profile menu/ })).toBeVisible();
});

// 083 (AC-1 to AC-5): the profile menu closes like 001's mock: outside, on a choice, on Tab out, on Escape and the toggle.
test("083 the profile menu closes on a click outside, a choice, Tab out, Escape, and a second click on the name", async ({ page }) => {
  await signInAs(page, "nimal@lumenlabs.test");
  const me = page.getByRole("button", { name: /Nimal Silva, Engineer, profile menu/ });
  const menu = page.getByRole("menu", { name: "Profile" });
  await me.click();
  await expect(menu).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
  await page.locator("main h1").first().click();
  await expect(menu).toHaveCount(0);

  await me.click();
  await menu.getByRole("menuitemradio", { name: "Dark" }).click();
  await expect(menu).toHaveCount(0);
  await expect(me).toBeFocused();
  await me.click();
  await menu.getByRole("menuitemradio", { name: "System" }).click();

  await me.click();
  for (let i = 0; i < 20 && (await menu.count()); i++) await page.keyboard.press("Tab");
  await expect(menu).toHaveCount(0);
  await expect(me).not.toBeFocused();

  await me.click();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(me).toBeFocused();
  await me.click();
  await me.click();
  await expect(menu).toHaveCount(0);
});
