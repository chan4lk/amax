import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./ask";

const axe = async (page: Page) => (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`);
const send = async (page: Page, text?: string) => {
  if (text) await page.getByLabel("Message amax").fill(text);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  return page.getByRole("group", { name: /^Confirm:/ }).last();
};

test("125 create and edit a release in chat; the list and the release page follow without a reload", async ({ page }) => {
  test.setTimeout(120_000);
  const version = `v9.1.${Date.now() % 100000}`;
  await signIn(page, "maya@lumenlabs.test", "/delivery/p/CON/releases");
  await page.getByRole("button", { name: "Ask amax", exact: true }).first().click();
  let card = await send(page, `Create release ${version} of CON`);
  await card.getByLabel("Name").fill("E2E release");
  await card.getByText("UAT", { exact: true }).click();
  await card.getByLabel("Target (YYYY-MM-DD)").fill("2099-11-30");
  await card.getByRole("button", { name: "Create E2E release", exact: true }).click();
  const row = page.locator("main tbody tr", { hasText: "E2E release" });
  await expect(row).toContainText(version);
  await expect(row).toContainText("30 Nov 2099");

  await page.getByRole("link", { name: "In progress" }).click();
  await expect(row).toBeVisible();
  for (const colorScheme of ["light", "dark"] as const) { await page.emulateMedia({ colorScheme }); expect(await axe(page)).toEqual([]); }

  await row.getByRole("link", { name: "E2E release" }).click();
  await page.getByRole("button", { name: "Edit release" }).click();
  card = await send(page);
  await card.getByLabel("Target (YYYY-MM-DD)").fill("2099-12-15");
  await card.getByRole("button", { name: "Save", exact: true }).click();
  await expect(card).toContainText(`Updated E2E release (${version})`);
  await expect(page.locator("main .rel-info")).toContainText("15 Dec 2099");
  // A new target that leaves the status as it was writes no history row (145 AC-2): still only "Created".
  await expect(page.locator("main", { hasText: "Status history" })).toContainText("Created");
  await expect(page.locator("main")).not.toContainText("Edited");
  for (const colorScheme of ["light", "dark"] as const) { await page.emulateMedia({ colorScheme }); expect(await axe(page)).toEqual([]); }
});
