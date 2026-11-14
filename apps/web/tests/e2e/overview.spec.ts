import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("008 AC-4 the Overview's Agent activity feed names the agent and the person it acted for", async ({ page }) => {
  await page.goto("/signin");
  await page.getByLabel("Demo user (fixtures only)").fill("maya@lumenlabs.test");
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
  const feed = page.locator(".card", { has: page.getByRole("heading", { name: "Agent activity" }) });
  await expect(feed.locator(".feed li").first()).toContainText("Claude for Nimal finished task 3 of CON-014 Invoice export");
  await expect(feed.locator(".feed li .by").first()).toHaveText("Claude for Nimal");
  await expect(feed.locator(".feed li", { hasText: "promoted Contoso v2.4.0 to QA" }).locator("b")).toHaveText("Ayesha");
  await expect(feed.locator(".feed li", { hasText: "verified CON-012" }).locator(".by")).toHaveText("specclaw");
  for (const li of await feed.locator(".feed li").all()) await expect(li.getByRole("button", { name: /^Add .* to chat$/ })).toHaveCount(1);
  await page.mouse.move(900, 500);
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
});

test("068 AC-1 to AC-9 the Overview leads with tickets, the hours chart and decisions, then insights, performance, time split and release readiness", async ({ page }) => {
  await page.goto("/signin");
  await page.getByLabel("Demo user (fixtures only)").fill("maya@lumenlabs.test");
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
  const tickets = page.locator(".overview-tickets .ticket");
  await expect(tickets.locator(".k")).toHaveText(["Hours this week", "Proposals in flight", "Ready to invoice"]);
  // 104 AC-15: "this week" is the real current week (the fixtures' hours are in 2026-W42), so the figure isn't fixed.
  await expect(tickets.locator(".v")).toHaveText([/^\d+(\.\d+)?$/, /^\d+$/, "$14,200"]);
  for (const t of await tickets.all()) await expect(t.getByRole("button", { name: /^Add .* to chat$/ })).toHaveCount(1);

  const chart = page.locator(".card", { has: page.getByRole("heading", { name: "Hours logged" }) });
  await expect(chart.getByRole("img", { name: /Hours logged per week/ })).toBeVisible();
  await expect(chart.locator("table.sr tbody tr")).toHaveCount(12);
  await chart.getByLabel("Project").selectOption({ label: "Contoso Portal" });
  await expect(page).toHaveURL(/[?&]hp=[0-9a-f-]{36}/);
  await expect(chart.getByLabel("Project")).toHaveValue(/[0-9a-f-]{36}/);

  const waiting = page.locator(".card", { has: page.getByRole("heading", { name: "Waiting on you" }) });
  const rollback = waiting.locator("tbody tr", { hasText: "v1.8.0 failed in UAT" });
  await expect(rollback.getByRole("button", { name: "Retry UAT" })).toBeVisible();
  await expect(waiting.locator("tbody tr", { hasText: "W42 timesheets" })).toHaveCount(1);
  for (const r of await waiting.locator("tbody tr").all()) await expect(r.getByRole("button", { name: /^Add .* to chat$/ })).toHaveCount(1);
  await expect(waiting.getByRole("button", { name: "Approve selected" })).toBeDisabled();
  await rollback.getByRole("checkbox").check();
  await expect(waiting.getByRole("button", { name: "Approve selected" })).toBeEnabled();
  await rollback.getByRole("button", { name: "Retry UAT" }).click();
  await expect(page.getByRole("textbox", { name: /message/i })).toHaveValue("Retry Fleet Tracker v1.8.0 in UAT");

  const insights = page.locator(".card", { has: page.getByRole("heading", { name: "Agent insights" }) });
  expect(await insights.locator(".list li").count()).toBeLessThanOrEqual(3);
  await expect(insights.getByRole("link", { name: "Open insights" })).toHaveAttribute("href", "/insights");
  await expect(page.locator(".card", { has: page.getByRole("heading", { name: "Delivery performance" }) })).toContainText("Nimal Silva");
  await expect(page.locator(".card", { has: page.getByRole("heading", { name: "Where time went" }) })).toBeVisible();
  const ready = page.locator(".card", { has: page.getByRole("heading", { name: "Release readiness" }) });
  await expect(ready).toContainText("Fleet v1.8.0");
  await expect(ready).toContainText("2 of 4");
  await expect(page.locator(".overview-failed")).toHaveCount(0);

  await page.keyboard.press("Escape");
  await page.mouse.move(900, 500);
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(violations.map((v) => `${scheme} ${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
  }
});
