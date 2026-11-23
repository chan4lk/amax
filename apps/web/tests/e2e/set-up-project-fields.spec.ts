import { expect, test, type Page } from "@playwright/test";

async function card(page: Page, text: string) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/signin");
  await page.getByLabel("Demo user (fixtures only)").fill("maya@lumenlabs.test");
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
  await expect(page).toHaveURL((u) => u.pathname === "/");
  await page.goto("/delivery");
  await page.getByRole("button", { name: "Ask amax" }).click();
  await page.getByLabel("Message amax").fill(text);
  await page.keyboard.press("Enter");
  return page.getByRole("group", { name: /^Confirm: Set up/ });
}

test("106 final pass B1: a key given in the message stays when the name is edited", async ({ page }) => {
  const c = await card(page, "set up a project called Northwind Portal (NWX)");
  await c.getByLabel("Name").pressSequentially(" Two");
  await expect(c.getByLabel("Key")).toHaveValue("NWX");
});

test("106 final pass WCAG 2.4.3: clearing the repo URL keeps its section open and focus in it", async ({ page }) => {
  const c = await card(page, "set up a project called Fieldtest (FTX)");
  await c.getByText("Repo (optional)").click();
  const url = c.getByLabel("Repo URL");
  await url.pressSequentially("https://x");
  await url.fill("");
  await expect(url).toBeVisible();
  await expect(url).toBeFocused();
});

test("106 final pass B6: an empty other… branch is refused, never turned into main", async ({ page }) => {
  const c = await card(page, "set up a project called Branchtest (BRX)");
  await c.getByRole("radio", { name: "Internal" }).first().check();
  await c.getByRole("radio", { name: "Fixed" }).check();
  await c.getByText("Repo (optional)").click();
  await c.getByLabel("Repo URL").fill("https://github.com/example/branchtest");
  await c.getByRole("radio", { name: "other…" }).check();
  await expect(c).toContainText("Fill this in");
  await expect(c.getByRole("button", { name: "Create BRX and link repo" })).toBeDisabled();
});
