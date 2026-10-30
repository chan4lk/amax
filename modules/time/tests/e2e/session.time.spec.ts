import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// 070 amendment 5: one browser keeps one session for every tab; switching is on purpose and other tabs are told.
async function signIn(page: Page, email: string, to: string) {
  await page.goto(to);
  await page.getByLabel("Demo user (fixtures only)").fill(email);
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
  await expect(page).toHaveURL((url) => url.pathname === to);
}

const axe = async (page: Page) => (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`);

// Headless browsers don't fire focus on bringToFront, so the test fires it as a person switching tabs would.
const refocus = async (page: Page) => { await page.bringToFront(); await page.evaluate(() => window.dispatchEvent(new Event("focus"))); };

test.beforeEach(async ({ page }) => page.setViewportSize({ width: 1440, height: 900 }));

test("070 AC51–AC54 one browser, two tabs: the second tab switches on purpose, the first is told and must reload; another profile stays apart", async ({ page, context, browser }) => {
  test.setTimeout(90_000);
  await signIn(page, "tharushi@lumenlabs.test", "/time/my/2026-W42");
  const other = await context.newPage();
  await other.goto("/signin?next=%2Ftime%2Fmy%2F2026-W42");
  await expect(other.getByTestId("signed-in-as")).toContainText("Tharushi Wijesinghe");
  await expect(other.getByLabel("Demo user (fixtures only)")).toHaveCount(0);
  await other.getByRole("button", { name: "Sign out to switch account" }).click();
  await other.getByLabel("Demo user (fixtures only)").fill("maya@lumenlabs.test");
  await other.getByRole("button", { name: "Sign in as demo user" }).click();
  await expect(other).toHaveURL(/\/time\/my\/2026-W42$/);
  await refocus(page);
  await expect(page.getByRole("alertdialog")).toContainText("You're now signed in as Maya Fernando in another tab.");
  expect(await axe(page)).toEqual([]);
  await page.getByRole("button", { name: "Reload" }).click();
  await expect(page.getByText("Maya Fernando").first()).toBeVisible();
  const kasun = await (await browser.newContext({ baseURL: test.info().project.use.baseURL })).newPage();
  await signIn(kasun, "kasun@lumenlabs.test", "/time/my/2026-W42");
  await page.reload();
  await expect(page.getByText("Maya Fernando").first()).toBeVisible();
  await other.goto("/signin");
  await other.getByRole("button", { name: "Sign out to switch account" }).click();
  await refocus(page);
  await expect(page.getByRole("alertdialog")).toContainText("You signed out in another tab.");
});

// 070 review round 3: the real app (Next's cookies(), Auth.js's handler and signIn event) ends the session a sign-in
// replaces. Two tabs open the sign-in form; the second completes over the first's session, whose cookie then opens nothing.
test("070 AC52 a sign-in that completes over an earlier session ends it: its cookie no longer opens the app", async ({ page, context, browser }) => {
  test.setTimeout(90_000);
  const to = "/time/my/2026-W42";
  const second = await context.newPage();
  await page.goto(`/signin?next=${encodeURIComponent(to)}`);
  await second.goto(`/signin?next=${encodeURIComponent(to)}`);
  await page.getByLabel("Demo user (fixtures only)").fill("tharushi@lumenlabs.test");
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
  await expect(page).toHaveURL((url) => url.pathname === to);
  const earlier = (await context.cookies()).filter((c) => c.name.includes("authjs.session-token"));
  expect(earlier.length).toBeGreaterThan(0);
  await second.getByLabel("Demo user (fixtures only)").fill("maya@lumenlabs.test");
  await second.getByRole("button", { name: "Sign in as demo user" }).click();
  await expect(second).toHaveURL((url) => url.pathname === to);
  await expect(second.getByText("Maya Fernando").first()).toBeVisible();
  // The earlier cookie, replayed in a fresh browser, is signed out: its session row ended when Maya's sign-in completed.
  const replay = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  await replay.addCookies(earlier);
  const stale = await replay.newPage();
  await stale.goto(to);
  await expect(stale.getByText("Sign in to see timesheets")).toBeVisible();
  await expect(stale.getByText("Tharushi Wijesinghe")).toHaveCount(0);
  await replay.close();
});
