import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { askAndConfirm, signIn } from "./ask";

const axe = async (page: Page) => (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`);

test.beforeEach(async ({ page }) => page.setViewportSize({ width: 1440, height: 900 }));

test("042 AC-1 / 054 AC5 environments per project: add, rename and choose Prod by asking amax from the project page", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page, "maya@lumenlabs.test", "/delivery/p/HRI");
  const card = page.locator(".card", { has: page.getByRole("heading", { name: "Environments" }) });
  await expect(card.locator("form")).toHaveCount(0);
  await askAndConfirm(page, card.getByRole("button", { name: "Ask amax to add an environment" }), { pin: "HRI environments", prompt: "Add an environment to HRI: ", type: "Staging", confirm: "Add" });
  await expect(card.locator("tbody tr")).toHaveCount(5);
  // 081 amendment 5 (AC-60): a row has no buttons; its pin offers what they did.
  const offer = async (env: string, label: string) => {
    await card.locator("tr", { hasText: env }).getByRole("button", { name: `Add HRI ${env} to chat` }).press("Enter");
    return page.getByRole("list", { name: "Suggestions for this page" }).getByRole("button", { name: label, exact: true });
  };
  await expect(card.locator("tbody tr button:not([data-pin])")).toHaveCount(0);
  await askAndConfirm(page, await offer("Staging", "Rename the Staging environment of HRI"), { pin: "HRI Staging", prompt: "Rename the Staging environment of HRI to ", type: "Preview", confirm: "Rename" });
  await expect(card.locator("tbody tr", { hasText: "Preview" })).toHaveCount(1);
  await askAndConfirm(page, await offer("Preview", "Make Preview the Prod environment of HRI"), { pin: "HRI Preview", prompt: "Make Preview the prod environment of HRI", confirm: "Make Prod" });
  await expect(card).toContainText("Released means it reached Preview");
  await askAndConfirm(page, await offer("Preview", "Unmark Preview as the Prod environment of HRI"), { pin: "HRI Preview", prompt: "Unmark Preview as the prod environment of HRI", confirm: "Unmark" });
  await expect(card).toContainText("No Prod");
  expect(await axe(page)).toEqual([]);
});

test("042 AC-2/AC-3 / 054 AC5 a release page: re-tag, record a deployment and void it, each through chat", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page, "sahan@lumenlabs.test", "/delivery/releases");
  await page.getByRole("link", { name: "v2.4.0" }).click();
  // 147: the heading is the release's name, which for one made before 145 is its version; 154: a re-tag carries it along.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("v2.4.0");
  await expect(page.locator("main form, main dialog")).toHaveCount(0);
  await askAndConfirm(page, page.getByRole("button", { name: "Ask amax to re-tag" }), { pin: "CON v2.4.0", prompt: "Tag CON v2.4.0 as ", type: "v2.4.1", reload: false, confirm: "Re-tag" });
  // 057: no manual goto. Chat follows the re-tagged release to its new page.
  await expect(page).toHaveURL((u) => u.pathname === "/delivery/releases/CON/v2.4.1");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("v2.4.1");
  await askAndConfirm(page, page.getByRole("button", { name: "Record a deployment", exact: true }), { pin: "CON v2.4.1", prompt: "Record a deployment of CON v2.4.1 to ", type: "Prod", confirm: "Record" });
  // 147: deployments are grouped by environment, one list per environment.
  const prodRow = page.locator('main section[aria-label="Prod deployments"] li').first();
  await expect(prodRow).toContainText("deployed");
  const id = await prodRow.getByRole("button", { name: /^Void the Prod deployment/ }).getAttribute("data-ask");
  await askAndConfirm(page, prodRow.getByRole("button", { name: /^Void the Prod deployment/ }), { pin: /^CON v2\.4\.1 on Prod, /, prompt: id!, type: "wrong pipeline", confirm: "Void" });
  await expect(page.locator('main section[aria-label="Prod deployments"] li').first()).toContainText("Voided: wrong pipeline");
  expect(await axe(page)).toEqual([]);
});
