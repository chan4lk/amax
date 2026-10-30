import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";
import { capture, diffRatio } from "./diff";
import { axe, signIn } from "./helpers";

const mock = `${pathToFileURL(join(import.meta.dirname, "../../../../.specclaw/mock/index.html")).href}#001-amax-foundation-time`;
const W42 = "/time/w/2026-W42";

test.beforeEach(async ({ page }) => page.setViewportSize({ width: 1440, height: 900 }));

test("AC3 the Team week matches the mock: totals, agent share and the This week card within 2%", async ({ page, context }) => {
  await signIn(page, "maya@lumenlabs.test", W42);
  // 075: the header sentence is now the status band; the figures are the same.
  await expect(page.locator(".row.head .wk b")).toHaveText("Week 42");
  const band = page.getByRole("group", { name: "This week's progress" });
  await expect(band.locator(".fig").first()).toHaveText("3 of 5 submitted");
  await expect(band.locator(".fig").last()).toHaveText("64% by agents, of 141.5 h");
  await expect(page.locator("table.tbl tbody tr")).toHaveCount(5);
  await expect(page.getByRole("button", { name: "Approve 3 submitted (87.5 h)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remind 2 people" })).toBeVisible();
  const m = await context.newPage();
  await m.setViewportSize({ width: 1440, height: 900 });
  await m.goto(mock);
  for (const sel of [".cols > .card:nth-child(2)"]) {
    const want = await capture(m.locator(`[id="001-amax-foundation-time"] ${sel}`).first());
    const got = await capture(page.locator(`.time ${sel}`).first());
    if (process.env.DIFF_DIR) { const { writeFileSync } = await import("node:fs"); writeFileSync(`${process.env.DIFF_DIR}/time-mock.png`, want.png); writeFileSync(`${process.env.DIFF_DIR}/time-app.png`, got.png); await page.screenshot({ path: `${process.env.DIFF_DIR}/time-page.png`, fullPage: true }); }
    expect([got.box.width, got.box.height], sel).toEqual([want.box.width, want.box.height]);
    expect(diffRatio(want, got), sel).toBeLessThanOrEqual(0.02);
  }
  expect(await axe(page)).toEqual([]);
  await band.getByRole("link", { name: /draft$/ }).click();
  await expect(page).toHaveURL(/status=not_submitted#timesheets$/);
  await expect(page.locator("table.tbl tbody tr")).toHaveCount(2);
});

test("070 AC41, AC42, AC45 chat names the page and suggests the fix; rows have pins and no Fix buttons; a locked week suggests a change request", async ({ page, browser }) => {
  await signIn(page, "tharushi@lumenlabs.test", "/time/my/2026-W42");
  await expect(page.locator("main form, main dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Fix .* hours$/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Ask amax", exact: true }).click();
  const chat = page.getByRole("complementary", { name: "amax chat" });
  await expect(chat.getByTestId("chat-page")).toHaveText("My timesheet · Week of Oct 12");
  await chat.getByRole("list", { name: "Suggestions for this page" }).getByRole("button", { name: "Fix an entry" }).click();
  await expect(page.getByLabel("Message amax")).toHaveValue("Fix an entry on this week's timesheet: ");
  expect(await axe(page)).toEqual([]);
  await page.locator("table.tbl tbody tr", { hasText: "Fleet Tracker" }).getByRole("button", { name: "Add Fleet Tracker, 2026-W42 to chat" }).press("Enter");
  await expect(chat.locator(".pinchip > span")).toHaveText(["Fleet Tracker, 2026-W42"]);
  const kasun = await (await browser.newContext({ baseURL: test.info().project.use.baseURL })).newPage();
  await signIn(kasun, "kasun@lumenlabs.test", "/time/my/2026-W42");
  await kasun.getByRole("button", { name: "Ask amax", exact: true }).click();
  await expect(kasun.getByRole("list", { name: "Suggestions for this page" }).getByRole("button", { name: "Ask for a change" })).toBeVisible();
});

test("AC2 / 054 AC5 / 073 approving through a pinned row's suggestion locks the week; rows carry only their pin; the My timesheet switch shows your own hours", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page, "maya@lumenlabs.test", W42);
  await expect(page.locator("main form, main dialog")).toHaveCount(0);
  await expect(page.locator("table.grid tbody").getByRole("button", { name: /^(Approve|Remind) / })).toHaveCount(0);
  await page.locator("table.grid tbody tr", { hasText: "Nimal Silva" }).getByRole("button", { name: "Add Nimal Silva, 2026-W42 to chat" }).press("Enter");
  await page.getByRole("list", { name: "Suggestions for this page" }).getByRole("button", { name: "Approve Nimal's timesheet" }).click();
  await expect(page.getByRole("complementary", { name: "amax chat" }).locator(".pinchip > span").last()).toHaveText("Nimal Silva, 2026-W42");
  await expect(page.getByLabel("Message amax")).toHaveValue(/^Approve Nimal Silva's timesheet for 2026-W42 \(week id [0-9a-f-]{36}\)$/);
  await page.getByRole("button", { name: "Send" }).click();
  const card = page.getByRole("group", { name: /^Confirm:/ });
  await card.getByRole("button", { name: "Approve" }).click();
  await expect(card).toContainText("Approved · Nimal Silva, 2026-W42");
  await page.reload();
  await expect(page.locator("tr", { hasText: "Nimal Silva" })).toContainText("Approved");
  await expect(page.getByRole("button", { name: "Approve 2 submitted (56.0 h)" })).toBeVisible();
  await page.getByRole("link", { name: "My timesheet" }).click();
  await expect(page).toHaveURL(/\/time\/my\/2026-W42$/);
  await expect(page.locator("h1")).toHaveText("My timesheet");
  expect(await axe(page)).toEqual([]);
});

test("077 the Requests tab opens every change request from Team time, open ones first", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", W42);
  await page.getByRole("group", { name: "View" }).getByRole("link", { name: "Requests" }).click();
  await expect(page).toHaveURL(/\/time\/requests$/);
  await expect(page.locator("h1")).toHaveText("Requests");
  await expect(page.getByRole("group", { name: "View" }).getByRole("link", { name: "Requests" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("navigation", { name: "Whose requests" }).getByRole("link", { name: /^Mine/ })).toBeVisible();
  expect(await axe(page)).toEqual([]);
});
