import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/signin");
  await page.getByLabel("Demo user (fixtures only)").fill("maya@lumenlabs.test");
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
  await expect(page).toHaveURL((u) => u.pathname === "/");
  await page.goto("/delivery");
}

async function ask(page: Page, text: string) {
  await signIn(page);
  await page.getByRole("button", { name: "Ask amax" }).click();
  await page.getByLabel("Message amax").fill(text);
  await page.keyboard.press("Enter");
}

test.beforeEach(async ({ page }) => page.setViewportSize({ width: 1440, height: 900 }));

test("106 AC3 AC7 AC8 AC11 one card sets up the project: a taken key is caught, the key follows the fix, one click creates and links", async ({ page }) => {
  await ask(page, "set up a project called Northwind Portal (NWP)");
  const card = page.getByRole("group", { name: /^Confirm: Set up NWP/ });
  await expect(card.getByLabel("Name")).toHaveValue("Northwind Portal");
  const key = card.getByLabel("Key");
  await key.fill("CON");
  await expect(card).toContainText("CON is taken (Contoso Portal)");
  await expect(card.getByRole("button", { name: "Create CON" })).toBeDisabled();
  await key.fill("NWP");
  await expect(card).toContainText("✓ free · proposal ids NWP-001");
  await card.getByRole("radio", { name: "+ new…" }).check();
  const other = card.getByLabel("Client: + new…");
  await expect(other).toHaveValue("");
  await other.pressSequentially("Contoso");
  await expect(other).toHaveValue("Contoso");
  await expect(card.getByRole("radio", { name: "Contoso", exact: true })).not.toBeChecked();
  await other.fill("");
  await other.pressSequentially("Northwind T");
  await expect(other).toHaveValue("Northwind T");
  await other.pressSequentially("raders");
  await expect(other).toHaveValue("Northwind Traders");
  await card.getByRole("radio", { name: "Fixed" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(card.getByRole("radio", { name: "T&M" })).toBeChecked();
  await card.getByText("Repo (optional)").click();
  await card.getByLabel("Repo URL").fill("https://github.com/example/northwind-portal");
  await expect(card.getByRole("radio", { name: "main" })).toBeChecked();
  const { violations } = await new AxeBuilder({ page }).include("#chat").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
  await card.getByRole("button", { name: "Create NWP and link repo" }).click();
  await expect(card).toContainText("Created NWP · Northwind Portal, linked github.com/example/northwind-portal (main)");
  await page.goto("/delivery/p/NWP");
  await page.getByRole("heading", { name: "Repo sync" }).click();
  await expect(page.getByText("From github.com/example/northwind-portal")).toBeVisible();
});

test("106 AC13 AC14 New project sends nothing: chat suggests setting a project up, and the picked one brings the card", async ({ page }) => {
  await signIn(page);
  await expect(async () => {
    await page.getByRole("button", { name: "New project" }).click();
    await expect(page.getByRole("button", { name: "Set up a project" })).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Link a repo to a project" })).toBeVisible();
  await expect(page.locator(".m.me")).toHaveCount(0);
  await expect(page.getByText("tell me the details")).toHaveCount(0);
  await page.getByRole("button", { name: "Set up a project" }).click();
  await expect(page.getByLabel("Message amax")).toHaveValue("Set up a new project");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("group", { name: /^Confirm: Set up/ })).toBeVisible();
});

test("106 AC9 Link a repo asks nothing in text: one card with the repo and its branch, main preselected", async ({ page }) => {
  await ask(page, "link a repo to FLT");
  const card = page.getByRole("group", { name: /^Confirm: Link FLT's repo/ });
  await expect(card.getByRole("radio", { name: "main" })).toBeChecked();
  await card.getByLabel("Repo URL").fill("https://github.com/example/fleet-tracker");
  await card.getByRole("button", { name: "Link the repo" }).click();
  await expect(card).toContainText("FLT syncs from https://github.com/example/fleet-tracker");
});
