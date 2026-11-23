import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, email: string, to: string) {
  // 062: a signed-out / is the marketing page, so sign in from /signin, which lands on /.
  await page.goto(to === "/" ? "/signin" : to);
  await page.getByLabel("Demo user (fixtures only)").fill(email);
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
  await expect(page).toHaveURL((u) => u.pathname === to);
}

test.beforeEach(async ({ page }) => page.setViewportSize({ width: 1440, height: 900 }));

test("AC1 Ask amax, ⌘K and Ctrl+K open the chat; Escape closes it and returns focus; closed it's inert", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/delivery");
  const chat = page.getByRole("complementary", { name: "amax chat" });
  await expect(chat).toHaveAttribute("inert", "");
  await page.getByRole("button", { name: "Ask amax" }).click();
  await expect(page.getByLabel("Message amax")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Ask amax" })).toBeFocused();
  await expect(chat).toHaveAttribute("inert", "");
  await page.keyboard.press("Control+k");
  await expect(page.getByLabel("Message amax")).toBeFocused();
  const { violations } = await new AxeBuilder({ page }).include("#chat").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
});

test("AC3 chat-first create: a confirm card with coloured fields; Add it creates the proposal on the board", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/delivery/p/CON");
  await page.getByRole("button", { name: "New proposal" }).click();
  await page.getByLabel("Message amax").fill("add Export invoices to PDF to CON");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const card = page.getByRole("group", { name: /^Confirm:/ });
  await expect(card).toContainText("Export invoices to PDF");
  await expect(page.locator(".m.me mark.x")).toHaveCount(2);
  await card.getByRole("button", { name: "Add it" }).click();
  await expect(card).toContainText(/Done: CON-\d+ added\./);
  await page.reload();
  await expect(page.locator(".tcard", { hasText: "Export invoices to PDF" })).toBeVisible();
});

test("Cancel writes nothing; read questions show the tools used", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/delivery");
  await page.getByRole("button", { name: "Ask amax" }).click();
  await page.getByLabel("Message amax").fill("add Never ship this to CON");
  await page.keyboard.press("Enter");
  const card = page.getByRole("group", { name: /^Confirm:/ });
  await card.getByRole("button", { name: "Cancel" }).click();
  await expect(card).toContainText("Nothing was changed");
  await page.getByLabel("Message amax").fill("how many projects?");
  await page.keyboard.press("Enter");
  await expect(page.locator(".m .tools span").last()).toHaveText("list_projects");
  await page.goto("/delivery/proposals");
  await expect(page.getByText("Never ship this")).toHaveCount(0);
});

test("AC4 pins: Add to chat adds a chip; AC5 a role without access gets a refusal", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/delivery");
  const row = page.locator("tr", { hasText: "Fleet Tracker" });
  await row.hover();
  await row.getByRole("button", { name: "Add Fleet Tracker to chat" }).click();
  await expect(page.locator(".pinchip")).toContainText("Fleet Tracker");
  await page.getByRole("button", { name: "Remove Fleet Tracker from chat" }).click();
  await expect(page.locator(".pinchip")).toHaveCount(0);
});

test("AC5 the same refusal the page would give", async ({ page }) => {
  await signIn(page, "liam@lumenlabs.test", "/");
  await page.getByRole("button", { name: "Ask amax" }).click();
  await page.getByLabel("Message amax").fill("list the projects");
  await page.keyboard.press("Enter");
  await expect(page.locator(".m .b").last()).toContainText(/couldn't do that/);
});

test("049 AC6 History: start a new chat, reopen the first from History by keyboard and carry on in it", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/delivery");
  await page.getByRole("button", { name: "Ask amax" }).click();
  const log = page.getByRole("log", { name: "Conversation" });
  const say = async (text: string) => {
    await page.getByLabel("Message amax").fill(text);
    await page.keyboard.press("Enter");
    await expect(log.locator(".m:not(.me)").last()).toContainText(/I found/);
  };
  await say("history check: how many projects?");
  await page.getByRole("button", { name: "New conversation" }).click();
  await say("a second chat about projects");
  await page.getByRole("button", { name: "Chat history" }).click();
  const chats = page.getByRole("list", { name: "Your chats" });
  await expect(chats.getByRole("listitem").first()).toContainText("a second chat about projects");
  await expect(page.getByLabel("Search your chats")).toBeFocused();
  const { violations } = await new AxeBuilder({ page }).include("#chat").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
  await page.keyboard.type("history check");
  await expect(chats.getByRole("listitem")).toHaveCount(1);
  await expect(chats.getByRole("listitem")).toContainText("2 messages");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: /^history check: how many projects\?/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(log).toContainText("history check: how many projects?");
  await expect(log).not.toContainText("a second chat about projects");
  await expect(page.getByLabel("Message amax")).toBeFocused();
  await say("and the releases?");
  await page.getByRole("button", { name: "Chat history" }).click();
  await expect(chats.getByRole("listitem").first()).toContainText(/history check: how many projects\?.*4 messages/);
  await page.keyboard.press("Escape");
  await expect(chats).toHaveCount(0);
  await expect(log).toContainText("and the releases?");
});

// 059 AC-7: a prompt an Ask amax chip fills is finished by what the person types next. Focus can leave
// the input before they type (the route focus after chat follows a re-tagged release), and a
// programmatic focus puts the caret back at 0; a fill (select all, then type) still replaces it.
test("059 AC7 a filled prompt is finished by typing, even after focus left the input; a fill replaces it", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/delivery/p/CON");
  const input = page.getByLabel("Message amax");
  const ask = (prompt: string) => page.evaluate((p) => window.dispatchEvent(new CustomEvent("amax:chat", { detail: { prompt: p } })), prompt);
  await ask("Tag CON v2.4.0 as ");
  await expect(input).toHaveValue("Tag CON v2.4.0 as ");
  await page.locator("main h1").evaluate((h) => { h.tabIndex = -1; h.focus(); });
  await input.pressSequentially("v2.4.1");
  await expect(input).toHaveValue("Tag CON v2.4.0 as v2.4.1");
  await ask("Copy Delivery team allocations from October (2026-10) to the next month");
  await expect(input).toHaveValue("Copy Delivery team allocations from October (2026-10) to the next month");
  await input.fill("Copy Delivery team allocations from December (2026-12) to the next month");
  await expect(input).toHaveValue("Copy Delivery team allocations from December (2026-12) to the next month");
});

// 084 (AC-2, AC-5): quick replies. The scripted model asks which project with two answers; a click sends one as the
// next message, exactly as typed, and the buttons go. Nothing is written by the click.
test("084 quick replies: answers show as buttons under the reply, a click sends one, and they go", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/delivery");
  await page.getByRole("button", { name: "Ask amax" }).click();
  await page.getByLabel("Message amax").fill("Ask which project for Export invoices");
  await page.keyboard.press("Enter");
  const answers = page.getByRole("group", { name: "Which project is it for?" });
  await expect(answers.getByRole("button")).toHaveText(["CON · Contoso Portal", "FLT · Fleet Tracker"]);
  await expect(page.getByRole("group", { name: /^Confirm:/ })).toHaveCount(0);
  const { violations } = await new AxeBuilder({ page }).include("#chat").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
  await answers.getByRole("button", { name: "CON · Contoso Portal" }).click();
  await expect(page.locator(".m.me .b").last()).toHaveText("CON · Contoso Portal");
  await expect(answers).toHaveCount(0);
});
