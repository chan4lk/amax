import { expect, type Locator, type Page } from "@playwright/test";

export async function signIn(page: Page, email: string, to: string) {
  // 062: a signed-out / is the marketing page, so sign in from /signin, which lands on /.
  await page.goto(to === "/" ? "/signin" : to);
  await page.getByLabel("Demo user (fixtures only)").fill(email);
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
  await expect(page).toHaveURL((u) => u.pathname === to);
}

export async function askAndConfirm(page: Page, chip: Locator, want: { pin: string | RegExp; prompt: string | RegExp; type?: string; replace?: string; reload?: boolean; confirm?: string; done?: string }) {
  await chip.click();
  await expect(page.getByRole("complementary", { name: "amax chat" }).locator(".pinchip > span").last()).toHaveText(want.pin);
  const input = page.getByLabel("Message amax");
  await expect(input).toHaveValue(want.prompt);
  if (want.replace) await input.fill(want.replace);
  if (want.type) await input.pressSequentially(want.type);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const card = page.getByRole("group", { name: /^Confirm:/ }).last();
  // 073: a card can name its own button and receipt ("Submit", "Submitted 2026-W42 · 29 h").
  await card.getByRole("button", { name: want.confirm ?? "Add it" }).click();
  await expect(card).toContainText(want.done ?? "Done:");
  if (want.reload !== false) await page.reload();
}
