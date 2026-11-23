import { expect, test } from "@playwright/test";
import { askAndConfirm, signIn } from "./ask";

test.beforeEach(async ({ page }) => page.setViewportSize({ width: 1440, height: 900 }));

test("054 AC5 time: pin the week, ask amax to submit it, confirm, and the week reads Submitted", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page, "tharushi@lumenlabs.test", "/time/my/2026-W42");
  await expect(page.locator("main form, main dialog")).toHaveCount(0);
  await expect(page.locator(".card-head h2")).toContainText("Draft");
  await askAndConfirm(page, page.getByRole("button", { name: "Ask amax to submit week 42" }), { pin: "My timesheet 2026-W42", prompt: "Submit my timesheet for 2026-W42", confirm: "Submit", done: "Submitted 2026-W42" });
  await expect(page.locator(".card-head h2")).toContainText("Submitted");
});

test("054 AC5 allocations: ask amax to copy December into January, confirm, and Kasun has January work", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page, "maya@lumenlabs.test", "/allocations");
  await expect(page.locator("main form, main dialog")).toHaveCount(0);
  const kasun = page.locator(".ad-lane", { hasText: "Kasun Dias" });
  await expect(kasun).toBeVisible();
  const heads = await page.locator(".ad-mhead > div > span").allTextContents();
  const janColumn = heads.findIndex((h) => h.startsWith("Jan"));
  expect(janColumn).toBeGreaterThanOrEqual(0);
  const january = kasun.locator(".ad-trow span").nth(janColumn);
  await expect(january).toHaveText("–");
  await expect(page.getByRole("button", { name: "Ask amax to copy a month" })).toHaveCount(0);
  await page.keyboard.press("Control+k");
  await page.getByLabel("Message amax").fill("Copy Delivery team allocations from December (2026-12) to the next month");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const card = page.getByRole("group", { name: /^Confirm:/ }).last();
  await card.getByRole("button", { name: "Add it" }).click();
  await expect(card).toContainText("Done:");
  await page.reload();
  await expect(january).not.toHaveText("–");
});
