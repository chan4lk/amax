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
  const kasun = page.locator("tr.total", { hasText: "Kasun, total" });
  await expect(kasun.locator("td").nth(5)).toHaveText(/^0%/);
  await askAndConfirm(page, page.getByRole("button", { name: "Ask amax to copy a month" }), { pin: "People by month",
    prompt: "Copy Delivery team allocations from October (2026-10) to the next month", replace: "Copy Delivery team allocations from December (2026-12) to the next month" });
  await expect(kasun.locator("td").nth(5)).not.toHaveText(/^0%/);
});
