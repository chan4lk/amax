import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import postgres from "postgres";
import { expect, test, type Page } from "@playwright/test";
import { configureRuntime, contextFor } from "@amax/core/server";
import { configureSecrets, localKms, parseKeyFile, putSecret } from "@amax/core/secrets";
import { installAuthorizer } from "@amax/auth";
import { createDb } from "@amax/db";

const T = "11111111-1111-4111-8111-111111111111";
const PORT = Number(process.env.E2E_GITHUB_PORT ?? 3599);
const url = () => Object.assign(new URL(process.env.DATABASE_MIGRATE_URL ?? "postgres://amax:amax@127.0.0.1:5440/amax"), { pathname: `/${process.env.E2E_DB ?? "amax_e2e"}` }).toString();
const KEY_FILE = process.env.AMAX_KMS_KEY_FILE ?? join(tmpdir(), `amax-e2e-kms-${process.env.E2E_DB ?? "amax_e2e"}.key`);

// A fake GitHub (fictional data): its authorize page approves at once, and code "good" is @kasun-dias with two verified emails.
function fakeGitHub(): Promise<Server> {
  const server = createServer((req, res) => {
    const u = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
    const send = (body: unknown) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (u.pathname === "/login/oauth/authorize") {
      // 114: only ever back to the local app under test.
      const back = new URL(u.searchParams.get("redirect_uri") ?? "", "http://localhost");
      if (back.protocol !== "http:" || back.hostname !== "localhost") { res.writeHead(400); return res.end(); }
      back.search = new URLSearchParams({ code: "good", state: u.searchParams.get("state") ?? "" }).toString();
      res.writeHead(302, { location: back.toString() });
      return res.end();
    }
    if (u.pathname === "/login/oauth/access_token") return send({ access_token: "gho_e2e" });
    if (u.pathname === "/user") return send({ login: "kasun-dias", id: 4821937 });
    if (u.pathname === "/user/emails") return send([{ email: "kasun@lumenlabs.test", verified: true }, { email: "4821937+kasun-dias@users.noreply.github.com", verified: true }]);
    res.writeHead(404); res.end();
  });
  return new Promise((ok) => server.listen(PORT, "127.0.0.1", () => ok(server)));
}

// 113: one fake GitHub on one port, so this file's tests run one after another in one worker (the e2e config runs files
// fully parallel, and two workers each starting the fake on the same port collide).
test.describe.configure({ mode: "serial" });

let github: Server;
test.beforeAll(async () => {
  github = await fakeGitHub();
  const { db, client } = createDb(url(), { max: 1, connection: { options: "-c role=amax_app" } as never });
  configureRuntime({ db, auditKey: "e2e-audit-key-e2e-audit-key-e2e-audit" });
  installAuthorizer();
  configureSecrets({ kms: localKms(parseKeyFile(readFileSync(KEY_FILE, "utf8"))) });
  await putSecret(contextFor.job(T, "e2e-seed"), { connector: "github-oauth", value: "e2e-app:e2e-secret-fake-0000000000" });
  await client.end();
});
test.afterAll(async () => {
  github.close();
  const db = postgres(url(), { max: 1, onnotice: () => {} });
  await db`delete from secrets.version where credential_id in (select id from secrets.credential where connector = 'github-oauth')`;
  await db`delete from secrets.credential where connector = 'github-oauth'`;
  await db`delete from auth.git_identity where login = 'kasun-dias'`;
  await db.end();
});

async function ask(page: Page, button: string, prompt: string) {
  // A click before the page has hydrated opens nothing; click again until the message box holds the prompt.
  await expect(async () => {
    await page.getByRole("button", { name: button }).click();
    await expect(page.getByLabel("Message amax")).toHaveValue(prompt, { timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await page.keyboard.press("Enter");
}

test("116 AC1 AC4 an Admin replaces the GitHub app from Integrations with one card: Client ID, callback URL, masked secret", async ({ page }) => {
  await page.goto("/signin");
  await page.getByLabel("Demo user (fixtures only)").fill("maya@lumenlabs.test");
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
  await expect(page).toHaveURL((u) => u.pathname === "/");
  await page.goto("/settings/integrations");
  await expect(page.getByText(/^Configured · rotated /)).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Ask amax", exact: true }).first().click();
  await expect(page.getByLabel("Message amax")).toBeVisible();
  await page.getByLabel("Message amax").fill("Set up the GitHub app with client id e2e-app");
  await page.getByRole("complementary", { name: "amax chat" }).getByRole("button", { name: "Send", exact: true }).click();
  const card = page.getByRole("group", { name: "Confirm: Replace the GitHub app" });
  await expect(card).toContainText("/api/git/github/callback", { timeout: 60_000 });
  await expect(card.getByRole("button", { name: "Copy Callback URL to paste into GitHub" })).toBeVisible();
  await card.getByLabel("Client secret").fill("e2e-secret-0000000000000000");
  await card.getByRole("button", { name: "Confirm" }).click();
  await expect(card).toContainText("saved to the vault");
});

test("112 AC5 a real return interrupted by sign-in finishes the connect after resume", async ({ page, browser }) => {
  await page.goto("/signin");
  await page.getByLabel("Demo user (fixtures only)").fill("kasun@lumenlabs.test");
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
  await expect(page).toHaveURL((u) => u.pathname === "/");
  await page.goto("/git-accounts");
  await ask(page, "Ask amax · Connect GitHub", "Connect my GitHub");
  const card = page.getByRole("group", { name: "Confirm: Connect GitHub" });
  await card.getByRole("button", { name: "Connect GitHub" }).click();
  const link = await card.getByRole("link", { name: /Continue to GitHub/ }).getAttribute("href");
  // GitHub's return reaches a browser with no session (it lapsed): a fresh context, signed out.
  const lapsed = await browser.newContext({ baseURL: test.info().project.use.baseURL, colorScheme: "light" });
  const back = await lapsed.newPage();
  try {
    await back.goto(link!);
    await expect(back).toHaveURL((u) => u.pathname === "/signin" && (u.searchParams.get("next") ?? "").startsWith("/git-accounts?resume="));
    await back.getByLabel("Demo user (fixtures only)").fill("kasun@lumenlabs.test");
    await back.getByRole("button", { name: "Sign in as demo user" }).click();
    await expect(back.getByRole("main").getByRole("status")).toContainText("GitHub connected as @kasun-dias: 2 emails");
    await ask(back, "Ask amax · Disconnect GitHub", "Disconnect my GitHub");
    await back.getByRole("group", { name: /^Confirm: Disconnect GitHub/ }).getByRole("button", { name: "Disconnect" }).click();
    await expect(back.getByRole("group", { name: /^Confirm: Disconnect GitHub/ })).toContainText("Disconnected");
  } finally { await lapsed.close(); }
});

test("108 AC1 AC6 AC7 AC11 Git accounts: connect GitHub from chat, see the verified emails, then disconnect", async ({ page }) => {
  await page.goto("/signin");
  await page.getByLabel("Demo user (fixtures only)").fill("kasun@lumenlabs.test");
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
  await expect(page).toHaveURL((u) => u.pathname === "/");
  await page.goto("/git-accounts");
  await expect(page.getByRole("heading", { name: "GitHub · Not connected" })).toBeVisible();

  await ask(page, "Ask amax · Connect GitHub", "Connect my GitHub");
  const connect = page.getByRole("group", { name: "Confirm: Connect GitHub" });
  await connect.getByRole("button", { name: "Connect GitHub" }).click();
  await connect.getByRole("link", { name: /Continue to GitHub/ }).click();
  await expect(page).toHaveURL(/\/git-accounts\?github=1&ref=/);
  await expect(page.getByRole("main").getByRole("status")).toContainText("GitHub connected as @kasun-dias: 2 emails");
  await expect(page.getByRole("heading", { name: "GitHub · Connected as @kasun-dias" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Verified emails" }).getByRole("listitem")).toHaveCount(2);
  const { violations } = await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);

  await ask(page, "Ask amax · Disconnect GitHub", "Disconnect my GitHub");
  const disconnect = page.getByRole("group", { name: "Confirm: Disconnect GitHub: @kasun-dias and 2 emails" });
  await disconnect.getByRole("button", { name: "Disconnect" }).click();
  await expect(disconnect).toContainText("Disconnected @kasun-dias and 2 emails");
  await page.goto("/git-accounts");
  await expect(page.getByRole("heading", { name: "GitHub · Not connected" })).toBeVisible();
});
