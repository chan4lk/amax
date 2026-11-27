import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { hasDb } from "@amax/db/testdb";
import { revokeSecret } from "@amax/core/secrets";
import { contextFor } from "@amax/core/server";
import type { Viewer } from "@amax/auth";
import { completeGitHubConnect } from "../contracts";
import { chatSuggestions } from "../chat-suggestions";
import { gitAccountsOverview } from "../overview";
import { ctxFor } from "../server/context";
import { gitAccountsDatabase, T } from "./setup";

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/;

// 116 AC-3, AC-4, AC-5, AC-7: chat suggests the app to Admins, the row says its state, Overview nudges, and no audit
// record of git-accounts names an email address.
describe.skipIf(!hasDb)("116 the nudge, the suggestions and the audit record (Postgres)", () => {
  let db: Awaited<ReturnType<typeof gitAccountsDatabase>>;
  let kasun: Viewer, maya: Viewer;
  beforeAll(async () => { db = await gitAccountsDatabase(); [kasun, maya] = [await db.as("kasun"), await db.as("maya")]; }, 120_000);
  afterAll(() => db?.drop());
  const offered = async (v: Viewer) => {
    const on = chatSuggestions.filter((s) => s.routes.includes("/settings/integrations"));
    return (await Promise.all(on.map(async (s) => ((await s.when!(v as never, {})) ? s.label : null)))).filter(Boolean);
  };
  const nudged = async (v: Viewer) => ((await gitAccountsOverview(v)).waiting ?? []).map((w) => [w.title, w.prompt, w.snoozeDays]);
  const connect = async () => {
    const r = (await db.registry.call(kasun, "connect_github", {}, { source: "mcp" })) as { open: { url: string } };
    await completeGitHubConnect(ctxFor(kasun), { state: new URL(r.open.url).searchParams.get("state")!, code: "good" });
  };

  it("AC3 AC5 before the app: Admins are offered Set up; nobody is nudged to connect", async () => {
    expect([await offered(maya), await offered(kasun), await nudged(kasun)]).toEqual([["Set up the GitHub app"], [], []]);
  });

  it("AC3 AC4 AC5 with the app: Admins rotate or remove; the status says when; Kasun is nudged until he connects", async () => {
    await db.setUpApp();
    expect([await offered(maya), await offered(kasun)]).toEqual([["Rotate the GitHub app secret", "Remove the GitHub app"], []]);
    const status = (v: Viewer) => db.registry.call(v, "get_github_app_status", {}, { source: "mcp" }) as Promise<{ state: string; rotatedAt: unknown; callbackUrl: string }>;
    const [admin, person] = [await status(maya), await status(kasun)];
    expect([admin.state, admin.rotatedAt !== null, person.state, person.rotatedAt, person.callbackUrl]).toEqual(["ready", true, "ready", null, "http://localhost:3000/api/git/github/callback"]);
    expect(await nudged(kasun)).toEqual([["Connect GitHub", "Connect my GitHub", 30]]);
    await connect();
    expect(await nudged(kasun)).toEqual([]);
  });

  it("AC7 AC8 connect, disconnect and an Admin's unlink write counts, never an address, and the Admin isn't told one", async () => {
    await db.registry.call(kasun, "disconnect_github", {}, { source: "mcp" });
    await connect();
    const [one] = await db.tx((tx) => tx.execute(sql`select id from auth.git_identity where user_id = ${kasun.userId} and email is not null limit 1`));
    const told = await db.registry.call(maya, "unlink_git_identity", { identityId: one.id }, { source: "mcp" });
    const rows = await db.tx((tx) => tx.execute(sql`select action, coalesce(before::text, '') || coalesce(after::text, '') as data from core.audit_event where action like 'git-accounts.%'`));
    expect([rows.length > 2, rows.filter((r) => EMAIL.test(String(r.data))).map((r) => r.action), EMAIL.test(JSON.stringify(told))]).toEqual([true, [], false]);
  });

  it("AC4 the status is a record whether or not the app is set up", async () => {
    await revokeSecret(contextFor.job(T, "test"), { connector: "github-oauth", reason: "unused" });
    expect(await db.registry.call(maya, "get_github_app_status", {}, { source: "mcp" })).toMatchObject({ state: "none", rotatedAt: null });
  });
});
