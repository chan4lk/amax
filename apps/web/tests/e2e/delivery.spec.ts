import { join } from "node:path";
import { pathToFileURL } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { askAndConfirm } from "./ask";
import { capture, diffRatio } from "./diff";
import { forgetActivity, lastTaskClosedByCi } from "./proposal-agent";
import { ownerChanges, userIdOf } from "./owner-a6";

const mock = (id: string) => `${pathToFileURL(join(import.meta.dirname, "../../../../.specclaw/mock/index.html")).href}#${id}`;

async function signIn(page: Page, email = "maya@lumenlabs.test", to = "/delivery") {
  // 062: a signed-out / is the marketing page, so sign in from /signin, which lands on /.
  await page.goto(to === "/" ? "/signin" : to);
  await page.getByLabel("Demo user (fixtures only)").fill(email);
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
  await expect(page).toHaveURL((url) => url.pathname === to);
}

const axe = async (page: Page) => (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`);
const lanes = (page: Page) => page.locator(".board .lane-head > span:last-child").allInnerTexts();

test.beforeEach(async ({ page }) => page.setViewportSize({ width: 1440, height: 900 }));

// The e2e tenant also holds AMX, amax's own specs imported by the 039 sync (see global-auth.ts). 090: the board holds
// what the sync writes, by the sync's own rule (`onBoard`: no shared number, as 062, 074 and 075 here; readable).
const amx = async () => {
  const [{ readSpecclaw }, { onBoard }] = await Promise.all([import("../../../../modules/delivery/sync/specclaw"), import("../../../../modules/delivery/sync/duplicates")]);
  return onBoard(readSpecclaw(join(import.meta.dirname, "../../../..")));
};

test("AC2 portfolio renders the fixture projects from the database", async ({ page }) => {
  await signIn(page);
  const rows = page.locator("table.tbl tbody tr");
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0)).toContainText("Contoso Portal");
  await expect(rows.nth(1)).toContainText("At risk");
  await expect(page.locator(".tickets")).toContainText("$774,000");
  expect(await axe(page)).toEqual([]);
});

test("AC2 the Contoso board matches the mock (released lane and card within 2%)", async ({ page, context }) => {
  // 081 amendment 4: Repo sync and the band push the board below 900 px; a tall window keeps it unscrolled, as the mock's is.
  await page.setViewportSize({ width: 1440, height: 2000 });
  await signIn(page, "maya@lumenlabs.test", "/delivery/p/CON");
  expect(await lanes(page)).toEqual(["2", "1", "2", "2", "1"]);
  const m = await context.newPage();
  await m.setViewportSize({ width: 1440, height: 900 });
  await m.goto(mock("001-amax-foundation-project"));
  for (const sel of [".board .lane:last-child .lane-head", ".board .lane:last-child .tcard"]) {
    const want = await capture(m.locator(sel).first());
    const got = await capture(page.locator(sel).first());
    expect(got.box.width, sel).toBe(want.box.width);
    expect(got.box.height, sel).toBe(want.box.height);
    if (process.env.DIFF_DIR) { const { writeFileSync } = await import("node:fs"); const n = sel.replace(/\W+/g, "_"); writeFileSync(`${process.env.DIFF_DIR}/${n}-mock.png`, want.png); writeFileSync(`${process.env.DIFF_DIR}/${n}-app.png`, got.png); }
    expect(diffRatio(want, got), sel).toBeLessThanOrEqual(0.02);
  }
  expect(await axe(page)).toEqual([]);
});

test("AC3 / 054 AC5 / 081 a card's pin offers its move; confirming it moves the proposal", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page, "maya@lumenlabs.test", "/delivery/p/CON");
  await expect(page.locator("main form, main dialog, .board details")).toHaveCount(0);
  const card = page.locator(".tcard", { hasText: "CON-017" });
  await card.hover();
  await card.getByRole("button", { name: "Add CON-017 CSV import for clients to chat" }).press("Enter");
  const offers = page.getByRole("list", { name: "Suggestions for this page" });
  await offers.getByRole("button", { name: "Move CON-017 to Planned" }).click();
  await expect(page.getByLabel("Message amax")).toHaveValue("Move CON-017 to planned");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const confirm = page.getByRole("group", { name: /^Confirm:/ }).last();
  await confirm.getByRole("button", { name: "Move to Planned" }).click();
  await expect(confirm).toContainText("Moved CON-017 to Planned");
  await page.reload();
  await expect.poll(() => lanes(page)).toEqual(["1", "2", "2", "2", "1"]);
  // A released proposal's pin offers no move.
  const released = page.locator(".tcard", { hasText: "CON-009" });
  await released.hover();
  await released.getByRole("button", { name: "Add CON-009 Reports v2 to chat" }).press("Enter");
  await expect(page.getByRole("list", { name: "Suggestions for this page" }).getByRole("button", { name: /^Move CON-009/ })).toHaveCount(0);
});
test("AC2 proposals show the phase bar and the full list", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/delivery/proposals");
  const amxInFlight = (await amx()).filter((r) => r.phase !== "released").length;
  await expect(page.getByText(/^\d+ in flight$/)).toHaveText(`${37 + amxInFlight} in flight`);
  await expect(page.locator(".phase-legend li")).toHaveText([/Proposed\s*\d+/, /Planned\s*\d+/, /Building\s*\d+/, /Verified\s*\d+/, /Released in October\s*\d+/]);
  // 095 AC-3: by its exact name; a synced proposal's title may say "Released" too.
  await page.getByRole("link", { name: "Released, all time", exact: true }).click();
  await expect(page).toHaveURL(/\/delivery\/proposals\/released$/);
  expect(await axe(page)).toEqual([]);
  // 097: by project, not the first row of all: a Prod deployment released Contoso's; AMX's are the repo's archive (091),
  // which say so (092), and may come first in the list.
  const shipped = (project: string) => page.goto(`/delivery/proposals/released?project=${project}`).then(() => page.locator("table.tbl tbody tr").first().locator('td[data-label="Shipped to"]'));
  await expect(await shipped("CON")).toHaveText("Prod");
  await expect(await shipped("AMX")).toHaveText("Released · from repo");
});

test("AC2 releases: the map, and a promotion asked of amax reaches the next environment", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page, "sahan@lumenlabs.test", "/delivery/releases");
  // 081 amendment 5 (AC-61): rows say what's next; the row's pin records it.
  await expect(page.locator("tr", { hasText: "v1.8.0" })).toContainText("Retry UAT");
  const row = page.locator("tr", { hasText: "v2.4.0" });
  await expect(row).toContainText("Next: UAT");
  await expect(page.locator(".card.flush tbody tr button:not([data-pin])")).toHaveCount(0);
  await row.getByRole("button", { name: "Add Contoso Portal v2.4.0 to chat" }).press("Enter");
  const next = page.getByRole("list", { name: "Suggestions for this page" }).getByRole("button", { name: "Record a deployment of CON v2.4.0 to UAT", exact: true });
  await askAndConfirm(page, next, { pin: "Contoso Portal v2.4.0", prompt: "Record a deployment of CON v2.4.0 to UAT", confirm: "Record" });
  await expect(page.locator("tr", { hasText: "v2.4.0" })).toContainText("Next: Prod");
  expect(await axe(page)).toEqual([]);
});

test("roles without delivery access don't get the screens", async ({ page }) => {
  await page.goto("/delivery");
  await page.getByLabel("Demo user (fixtures only)").fill("liam@lumenlabs.test");
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Projects" })).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText("Projects");
});

test("039 the AMX board shows amax's own specs in the same phases the queue reports", async ({ page }) => {
  const records = await amx();
  await signIn(page, "maya@lumenlabs.test", "/delivery/p/AMX");
  const want = ["proposed", "planned", "building", "verified", "released"].map((ph) => String(records.filter((r) => r.phase === ph).length));
  expect(await lanes(page)).toEqual(want);
  const first = page.locator(".tcard", { hasText: "AMX-001" });
  await expect(first).toBeVisible();
  const ready = records.find((r) => r.status === "ready");
  if (ready) await expect(page.locator(".tcard", { hasText: `AMX-${ready.number}` })).toContainText("ready");
  expect(await axe(page)).toEqual([]);
});

test("062 AC-10 the Repo sync card leads with refused pushes, pins every row, and links the repo through chat", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/delivery/p/CON");
  const card = page.locator(".card", { has: page.getByRole("heading", { name: "Repo sync" }) });
  await expect(card).toContainText("From github.com/example/contoso-portal");
  await expect(card.locator("summary")).toContainText("2 pushes refused");
  await expect(card).toContainText("by Kasun Dias: 0 created · 3 updated · 14 unchanged");
  const rows = card.locator("tbody tr");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText("Refused");
  await expect(rows.nth(2)).toContainText("Applied");
  await expect(card.locator("tbody tr button[data-pin]")).toHaveCount(3);
  await expect(card.locator("input, textarea, select")).toHaveCount(0);
  if (process.env.SHOTS_DIR) await card.screenshot({ path: `${process.env.SHOTS_DIR}/app.png` });
  expect(await axe(page)).toEqual([]);
});

// 081 AC-7, AC-15, AC-21: a proposal opens on its own page from the list and the board, survives a reload, and passes axe.
test("081 a proposal opens from the list and the board, with its time, release, tasks and history", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/delivery/proposals");
  await page.getByRole("navigation", { name: "Phase" }).getByRole("link", { name: "Planned" }).click();
  await expect(page).toHaveURL(/\/delivery\/proposals\/planned$/);
  await page.getByRole("navigation", { name: "Phase" }).getByRole("link", { name: "All", exact: true }).click();
  // The e2e tenant also holds AMX's imported specs, which fill the first page: search finds the row (AC-16).
  await page.getByLabel(/Search proposals by key or title/).fill("Invoice export");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/delivery\/proposals\?q=Invoice(\+|%20)export/);
  await page.getByRole("link", { name: /CON-014 Invoice export to PDF/ }).click();
  await expect(page).toHaveURL(/\/delivery\/proposals\/CON-014$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("CON-014 Invoice export to PDF");
  for (const h of ["Time", "Release", "Description", "Tasks", "History"]) await expect(page.getByRole("heading", { name: h, exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("CON-014");
  expect(await axe(page)).toEqual([]);

  await page.goto("/delivery/p/CON");
  await page.locator(".tcard", { hasText: "CON-014" }).getByRole("link", { name: "Invoice export to PDF" }).click();
  await expect(page).toHaveURL(/\/delivery\/proposals\/CON-014$/);
  await page.goto("/delivery/proposals/CON-404");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Proposal not found");

  // Emptying the search box (its ✕) goes back to the list without a search, keeping the project filter.
  await page.goto("/delivery/proposals?project=CON&q=CON-014", { waitUntil: "networkidle" });
  await page.getByLabel(/Search proposals by key or title/).fill("");
  await expect(page).toHaveURL(/\/delivery\/proposals\?project=CON$/);

  // Typing completes in the box from the filtered proposals, the guess selected: Backspace drops it, Tab keeps it.
  const search = page.getByLabel(/Search proposals by key or title/);
  await expect(search).toHaveAttribute("aria-autocomplete", "inline");
  await search.pressSequentially("inv");
  await expect(search).toHaveValue("invoice export to PDF");
  await page.keyboard.press("Backspace");
  await expect(search).toHaveValue("inv");
  await search.pressSequentially("o");
  await page.keyboard.press("Tab");
  await expect(search).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/delivery\/proposals\?project=CON&q=invoice(\+|%20)export(\+|%20)to(\+|%20)PDF$/);
  await expect(page.locator('td[data-label="Proposal"] a')).toHaveText(["CON-014 Invoice export to PDF"]);

  // The project filter shows beside Filter; its ✕ goes back to all projects and keeps the search.
  await page.getByRole("link", { name: /Filtered to Contoso Portal/ }).click();
  await expect(page).toHaveURL(/\/delivery\/proposals\?q=invoice(\+|%20)export(\+|%20)to(\+|%20)PDF$/);
  await expect(page.getByRole("link", { name: /Filtered to/ })).toHaveCount(0);
  expect(await axe(page)).toEqual([]);
});

// 081 amendment 2 AC-37: agent-first, end to end in the browser. A pinned proposal makes chat offer its next step;
// sending it shows the confirm card, and confirming moves it on the board.
test("081 AC-37 pin a proposal: chat offers its next step, and confirming it moves the proposal", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page, "maya@lumenlabs.test", "/delivery/p/CON");
  const card = page.locator(".tcard", { hasText: "CON-016" });
  await card.hover();
  await card.getByRole("button", { name: "Add CON-016 Audit trail on approvals to chat" }).press("Enter");
  const offers = page.getByRole("list", { name: "Suggestions for this page" });
  await expect(offers.getByRole("button", { name: "Add a task to CON-016" })).toBeVisible();
  await offers.getByRole("button", { name: "Move CON-016 to Planned" }).click();
  await expect(page.getByLabel("Message amax")).toHaveValue("Move CON-016 to planned");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const confirm = page.getByRole("group", { name: /^Confirm:/ }).last();
  await expect(confirm).toContainText(/From\s*Proposed\s*To\s*Planned/);
  await confirm.getByRole("button", { name: "Move to Planned" }).click();
  await expect(confirm).toContainText("Moved CON-016 to Planned");
  await page.reload();
  await expect(page.locator('section.lane[aria-label^="Planned"] .tcard', { hasText: "CON-016" })).toBeVisible();
});

// 081 amendment 2 AC-37: CI closes a proposal's last task; the Delivery agent suggests Ready to verify; the PM sees it on
// the board and the proposal, accepts it in chat, sees it Verified and undoable, and undoes it.
test("081 AC-37 the agent suggests Ready to verify; accepting it in chat verifies the proposal, and undo puts it back", async ({ page }) => {
  test.setTimeout(90_000);
  const key = await lastTaskClosedByCi("Agent flow check");
  await signIn(page, "maya@lumenlabs.test", "/delivery/p/CON");
  await expect(page.locator(".tcard", { hasText: key }).getByRole("link", { name: `amax suggests something for ${key}: open it` })).toBeVisible();
  await page.goto(`/delivery/proposals/${key}`);
  const card = page.locator(".card", { has: page.getByRole("heading", { name: "Suggested by amax" }) });
  await expect(card).toContainText(`Move ${key} to Verified`);
  expect(await axe(page)).toEqual([]);
  const pin = `Move ${key} to Verified`;
  await askAndConfirm(page, card.getByRole("button", { name: `Ask amax to accept ${pin}` }),
    { pin, prompt: new RegExp(`^Accept the suggestion "${pin}" \\(suggestion id [0-9a-f-]{36}\\)$`), confirm: "Accept", done: `Accepted: ${pin}` });
  await expect(page.locator(".dv-steps")).toHaveAttribute("aria-label", `${key} stage: Verified`);
  await expect(card).toContainText("Accepted");
  await page.goto("/suggestions");
  await expect(page.locator("main")).toContainText(pin);
  await page.goto(`/delivery/proposals/${key}`);
  await askAndConfirm(page, card.getByRole("button", { name: `Ask amax to undo ${pin}` }),
    { pin, prompt: new RegExp(`^Undo the suggestion "${pin}" \\(suggestion id [0-9a-f-]{36}\\)$`), confirm: "Undo", done: `Undone: ${pin}` });
  await expect(page.locator(".dv-steps")).toHaveAttribute("aria-label", `${key} stage: Building`);
});

// 081 amendment 3 AC-39: other pins run their tasks end to end. Fleet Tracker's pin offers its next release; confirming
// creates it; the new release's pin offers its first environment; confirming records the deployment.
test("081 AC-39 pin a project, then its new release: create the release and deploy it, each from the pin's offer", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page, "maya@lumenlabs.test", "/delivery");
  await page.locator("tr", { hasText: "Fleet Tracker" }).getByRole("button", { name: "Add Fleet Tracker to chat" }).press("Enter");
  const offers = page.getByRole("list", { name: "Suggestions for this page" });
  const create = offers.getByRole("button", { name: /^Create release v\d+\.\d+\.0 of FLT$/ });
  const version = (await create.innerText()).match(/(v\d+\.\d+\.0)/)![1];
  await create.click();
  await expect(page.getByLabel("Message amax")).toHaveValue(`Create release ${version} of FLT`);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  let confirm = page.getByRole("group", { name: /^Confirm:/ }).last();
  await confirm.getByRole("button", { name: "Create", exact: true }).click();
  await expect(confirm).toContainText("Done:");
  await page.goto("/delivery/p/FLT/releases");
  await page.getByRole("button", { name: `Add Fleet Tracker ${version} to chat` }).first().press("Enter");
  await offers.getByRole("button", { name: `Record a deployment of FLT ${version} to Dev` }).click();
  await page.getByRole("button", { name: "Send", exact: true }).click();
  confirm = page.getByRole("group", { name: /^Confirm:/ }).last();
  await confirm.getByRole("button", { name: "Record", exact: true }).click();
  await expect(confirm).toContainText("Done:");
  await page.goto(`/delivery/releases/FLT/${version}`);
  await expect(page.locator("tbody tr", { hasText: "Dev" }).first()).toContainText("deployed");
});

// An environment's pin: add one from the environments list's pin, then remove it from its own (it has no deployments).
test("081 AC-39 pin the environments, then the new environment: add it and remove it, each from the pin's offer", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page, "maya@lumenlabs.test", "/delivery/p/FLT");
  const card = page.locator(".card", { has: page.getByRole("heading", { name: "Environments" }) });
  await card.getByRole("button", { name: "Add FLT environments to chat" }).first().press("Enter");
  const offers = page.getByRole("list", { name: "Suggestions for this page" });
  await offers.getByRole("button", { name: "Add an environment to FLT" }).click();
  await page.getByLabel("Message amax").pressSequentially("Sandbox");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  let confirm = page.getByRole("group", { name: /^Confirm:/ }).last();
  await confirm.getByRole("button", { name: "Add", exact: true }).click();
  await expect(confirm).toContainText("Done:");
  await page.reload();
  await card.locator("tr", { hasText: "Sandbox" }).getByRole("button", { name: "Add FLT Sandbox to chat" }).press("Enter");
  await offers.getByRole("button", { name: "Remove the Sandbox environment of FLT" }).click();
  await page.getByRole("button", { name: "Send", exact: true }).click();
  confirm = page.getByRole("group", { name: /^Confirm:/ }).last();
  await confirm.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(confirm).toContainText("Done:");
  await page.reload();
  await expect(card.locator("tr", { hasText: "Sandbox" })).toHaveCount(0);
});

// 081 amendment 4 (AC-42, AC-44, AC-45): the board says each fact once. A refused push puts Repo sync first, open, for
// whoever can fix it; then the next release, stage by stage, and the tasks; the lanes are unchanged.
test("081 amendment 4 the board leads with Repo sync when a push was refused, then the next release and the tasks", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/delivery/p/CON");
  const sync = page.locator(".dv-sync");
  const order = await page.evaluate(() => ["dv-sync", "dv-band", "board"].map((c) => [...document.querySelectorAll("main *")].findIndex((e) => e.classList.contains(c))));
  expect(order[0]).toBeLessThan(order[1]);
  expect(order[1]).toBeLessThan(order[2]);
  await expect(sync.locator("details")).toHaveAttribute("open", "");
  await expect(sync.locator("summary")).toContainText("2 pushes refused");
  await sync.locator("summary").press("Enter");
  await expect(sync.locator("details")).not.toHaveAttribute("open", "");
  await expect(page.locator(".dv-track")).toHaveAttribute("aria-label", /^v2\.5\.0, \d+ proposals?: Dev /);
  await expect(page.locator(".dv-band .bar")).toHaveAttribute("aria-label", /^\d+ of \d+ tasks done: \d+ by agents, \d+ by people/);
  await expect(page.locator(".lede").first()).toHaveText("Sprint 18 runs Mon Oct 12 to Fri Oct 23. Released means it reached Prod.");
  expect(await axe(page)).toEqual([]);
  await page.locator(".dv-band .fig a").first().click();
  await expect(page).toHaveURL(/\/delivery\/releases\/CON\/v2\.5\.0$/);
});

// 081 amendment 4 (AC-46 to AC-51, AC-24 revised): the proposal page. Labelled facts, the stepper, Ask amax and Withdraw,
// Withdraw through chat; done tasks fold and open with Enter.
test("081 amendment 4 the proposal page: facts, stepper, a folded task list, and Withdraw through chat", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page, "maya@lumenlabs.test", "/delivery/proposals/CON-014");
  await expect(page.locator(".dv-facts dt")).toHaveText(["Project", "Owner", "Made by hand", "Updated"]);
  await expect(page.locator(".dv-steps")).toHaveAttribute("aria-label", "CON-014 stage: Building");
  await expect(page.locator('.dv-steps li[aria-current="step"]')).toContainText("Building");
  await expect(page.getByText(/hand-made series/)).toHaveCount(0);
  const done = page.locator(".dv-done");
  const was = await done.evaluate((d) => (d as HTMLDetailsElement).open);
  await done.locator("summary").press("Enter");
  await expect.poll(() => done.evaluate((d) => (d as HTMLDetailsElement).open)).toBe(!was);
  await expect(page.locator(".dv-timeline li").first()).toBeVisible();
  expect(await axe(page)).toEqual([]);

  // A throwaway proposal, made in chat, then withdrawn from its page's one lifecycle button.
  await page.getByRole("button", { name: "Ask amax", exact: true }).first().click();
  await page.getByLabel("Message amax").fill("Add a proposal to Contoso Portal (CON): Throwaway export");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  let confirm = page.getByRole("group", { name: /^Confirm:/ }).last();
  await confirm.locator("button.btn.primary, button.btn.danger").first().click();
  await expect(confirm.locator(".cc-receipt")).toBeVisible();
  const key = (await confirm.locator(".cc-receipt").innerText()).match(/CON-\d+/)![0];
  await page.goto(`/delivery/proposals/${key}`);
  const actions = page.locator(".row.head .actions");
  await expect(actions.getByRole("button")).toHaveText([/Ask amax/, "Withdraw"]);
  await actions.getByRole("button", { name: `Withdraw ${key}` }).click();
  await expect(page.getByLabel("Message amax")).toHaveValue(`Withdraw ${key}. Reason: `);
  await page.getByLabel("Message amax").pressSequentially("made by mistake");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  confirm = page.getByRole("group", { name: /^Confirm:/ }).last();
  await confirm.locator("button.btn.primary, button.btn.danger").first().click();
  await expect(confirm.locator(".cc-receipt")).toBeVisible();
  await page.reload();
  await expect(page.locator(".dv-steps")).toHaveAttribute("aria-label", `${key} stage: Proposed, withdrawn`);
  await expect(actions.getByRole("button", { name: `Withdraw ${key}` })).toHaveCount(0);
});

// 081 amendment 5 (AC-54 to AC-58): one way through Delivery. From the board into a proposal and back with one click;
// from a list to a project; from a release up its project's trail.
test("081 amendment 5 the project's trail and tabs lead from the board to a proposal and back, and lists link projects", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/delivery/p/CON");
  await page.locator(".tcard", { hasText: "CON-014" }).getByRole("link", { name: "Invoice export to PDF" }).click();
  await expect(page).toHaveURL(/\/delivery\/proposals\/CON-014$/);
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toHaveText(/Projects\s*\/\s*Contoso Portal\s*\/\s*Proposals\s*\/\s*CON-014/);
  const tabs = page.getByRole("navigation", { name: "Sections" });
  await expect(tabs.locator('[aria-current="page"]')).toHaveText("Proposals");
  expect(await axe(page)).toEqual([]);
  await tabs.getByRole("link", { name: "Board", exact: true }).click();
  await expect(page).toHaveURL(/\/delivery\/p\/CON$/);

  // The e2e tenant also holds AMX's imported specs, which fill the list's first page: search for the row (AC-16).
  await page.goto("/delivery/proposals?q=CON-014");
  await page.locator("tbody tr", { hasText: "CON-014" }).getByRole("link", { name: "Contoso Portal" }).click();
  await expect(page).toHaveURL(/\/delivery\/p\/CON$/);

  await page.goto("/delivery/releases/CON/v2.4.0");
  await expect(page.getByRole("navigation", { name: "Sections" }).locator('[aria-current="page"]')).toHaveText("Releases");
  await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Releases" }).click();
  await expect(page).toHaveURL(/\/delivery\/p\/CON\/releases$/);
});

// 081 amendment 5 (AC-59): a task closed by mistake is reopened from the proposal's pin, through its confirm card.
test("081 amendment 5 a task closed by mistake is reopened from the pin, and the history says so", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page, "maya@lumenlabs.test", "/delivery/p/CON");
  const send = async (button: string) => {
    await page.getByRole("button", { name: "Send", exact: true }).click();
    const card = page.getByRole("group", { name: /^Confirm:/ }).last();
    await card.getByRole("button", { name: button, exact: true }).click();
    await expect(card.locator(".cc-receipt")).toBeVisible();
    return (await card.locator(".cc-receipt").innerText()).replace(/\s+/g, " ");
  };
  await page.getByRole("button", { name: "Ask amax", exact: true }).first().click();
  await page.getByLabel("Message amax").fill("Add a proposal to Contoso Portal (CON): Reopen check");
  const key = (await send("Add it")).match(/CON-\d+/)![0];
  await page.getByLabel("Message amax").fill(`Add a task to ${key}: Draft it`);
  await send("Add the task");
  await page.getByLabel("Message amax").fill(`Mark T1 of ${key} done`);
  await send("Close the task");
  await page.goto(`/delivery/proposals/${key}`);
  await page.locator("h1 button[data-pin]").first().press("Enter");
  const offers = page.getByRole("list", { name: "Suggestions for this page" });
  await offers.getByRole("button", { name: `Reopen T1 of ${key}`, exact: true }).click();
  await expect(page.getByLabel("Message amax")).toHaveValue(`Reopen T1 of ${key}`);
  expect(await send("Reopen")).toContain(`Done: reopened T1 of ${key}`);
  await page.reload();
  await expect(page.locator(".dv-timeline li.reopened")).toContainText("T1 Draft it reopened");
  await expect(page.locator(".dv-tasks .card-head")).toContainText("1 open");
  // Closing and reopening wrote feed lines, as real use does; the Overview's e2e reads the fixtures' feed.
  await forgetActivity(`${key} Reopen check`);
});

// 081 amendment 6 (AC-67, AC-70, AC-71, AC-73): Maya makes a proposal with Nimal as its owner, then hands it to Kasun. Each card says
// who will be told, each write raises owner_changed, and someone who isn't on the project is refused before any card.
test("081 amendment 6 a proposal's owner is picked in chat, changed with a card that says who is told, and only someone on the project", async ({ page }) => {
  test.setTimeout(90_000);
  const [nimal, kasun, sarah] = await Promise.all(["nimal", "kasun", "sarah"].map((k) => userIdOf(`${k}@lumenlabs.test`)));
  await signIn(page, "maya@lumenlabs.test", "/delivery/p/CON");
  const send = async (text: string) => {
    await page.getByLabel("Message amax").fill(text);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    return page.getByRole("group", { name: /^Confirm:/ }).last();
  };
  await page.getByRole("button", { name: "Ask amax", exact: true }).first().click();
  const create = await send(`Add a proposal to Contoso Portal (CON): Owner handoff check, owned by Nimal Silva (user id ${nimal})`);
  await expect(create).toContainText("Nimal Silva · they'll be told");
  await create.getByRole("button", { name: "Add it", exact: true }).click();
  await expect(create.locator(".cc-receipt")).toBeVisible();
  const key = (await create.locator(".cc-receipt").innerText()).match(/CON-\d+/)![0];

  const change = await send(`Make Kasun Dias (user id ${kasun}) the owner of ${key}`);
  await expect(change).toContainText(/From\s*Nimal Silva\s*To\s*Kasun Dias/);
  await expect(change).toContainText("Kasun Dias and Nimal Silva will be told");
  await change.getByRole("button", { name: "Change owner", exact: true }).click();
  await expect(change).toContainText(`Kasun Dias now owns ${key}`);
  expect(await ownerChanges(key)).toEqual([{ from: null, to: nimal }, { from: nimal, to: kasun }]);

  await page.getByLabel("Message amax").fill(`Make Sarah Chen (user id ${sarah}) the owner of ${key}`);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  // Refused before any card: chat gets a not_proposed note (its wording is AC-6's unit test; the scripted model only
  // summarises a tool result), so no third card appears and the owner stays Kasun.
  await expect(page.locator(".m .b").last()).toContainText("update_proposal");
  await expect(page.getByRole("group", { name: /^Confirm:/ })).toHaveCount(2);
  expect(await ownerChanges(key)).toHaveLength(2);
  await page.goto(`/delivery/proposals/${key}`);
  await expect(page.locator("main")).toContainText("Kasun Dias");
  expect(await axe(page)).toEqual([]);
});

// 081 amendment 9 (AC-87, AC-89, AC-90, AC-91): what Nimal owns. My proposals is second in Filter, its chip clears it;
// the Overview lists his proposals and links to the same list; his board cards say Yours.
test("081 amendment 9 an engineer finds what they own: Mine on the list, Your proposals on the Overview, Yours on the board", async ({ page }) => {
  await signIn(page, "nimal@lumenlabs.test", "/delivery/proposals");
  const table = page.locator(".card.flush", { has: page.getByRole("table") });
  await table.locator("summary", { hasText: "Filter" }).click();
  const menu = page.getByRole("navigation", { name: "Filter by project or owner" });
  await expect(menu.getByRole("link").nth(1)).toHaveText("My proposals");
  await menu.getByRole("link", { name: "My proposals" }).click();
  await expect(page).toHaveURL(/owner=me/);
  await expect(page.getByRole("link", { name: /Filtered to Mine/ })).toBeVisible();
  for (const owner of await table.locator('tbody td[data-label="Owner"]').allInnerTexts()) expect(owner).toContain("Nimal Silva");
  expect(await axe(page)).toEqual([]);
  await page.getByRole("link", { name: /Filtered to Mine/ }).click();
  await expect(page).not.toHaveURL(/owner=me/);

  await page.goto("/");
  const yours = page.locator(".card", { has: page.getByRole("heading", { name: "Your proposals" }) });
  await expect(yours.locator("li").first()).toBeVisible();
  await expect(yours.getByRole("link", { name: "All your proposals" })).toHaveAttribute("href", "/delivery/proposals?owner=me");

  await page.goto("/delivery/p/FLT");
  await expect(page.locator(".tcard .chip.yours").first()).toHaveText("Yours");
  expect(await axe(page)).toEqual([]);
});
