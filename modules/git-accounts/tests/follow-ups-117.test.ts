import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { configureSecrets, localKms, putSecret, revokeSecret } from "@amax/core/secrets";
import { contextFor } from "@amax/core/server";
import type { Viewer } from "@amax/auth";
import { completeGitHubConnect, RESULTS } from "../contracts";
import { chatSuggestions } from "../chat-suggestions";
import { parseGitHubApp, forgetAppCheck } from "../server/app";
import { resultCodeOf } from "../server/connect";
import { ctxFor } from "../server/context";
import { gitAccountsDatabase, T } from "./setup";

// 117 AC-3: the one rule for a usable "<client id>:<client secret>".
describe("117 AC-3 a usable GitHub app value", () => {
  it.each([
    ["an id and a 40-character secret", `Ov23liFAKEdemo01:${"a".repeat(40)}`, true],
    ["only the secret", "a".repeat(40), false],
    ["a short secret", "Ov23liFAKEdemo01:short", false],
    ["the placeholder", "<Client ID>:<Client secret>", false],
    ["a second colon", `Ov23li:FAKE:${"a".repeat(40)}`, false],
    ["nothing after the colon", "Ov23liFAKEdemo01:", false],
  ])("%s", (_n, value, ok) => {
    expect(parseGitHubApp(value) !== null).toBe(ok);
  });
});

// 117 AC-2, AC-3: a wrong secret is said plainly; the GitHub app has one state every consumer reads.
describe.skipIf(!hasDb)("117 the GitHub app's follow-ups (Postgres)", () => {
  let db: Awaited<ReturnType<typeof gitAccountsDatabase>>;
  let kasun: Viewer, maya: Viewer;
  beforeAll(async () => { db = await gitAccountsDatabase(); [kasun, maya] = [await db.as("kasun"), await db.as("maya")]; }, 120_000);
  afterAll(() => db?.drop());
  const job = contextFor.job(T, "test");
  const status = () => db.registry.call(maya, "get_github_app_status", {}, { source: "mcp" }) as Promise<{ state: string }>;
  const offeredTo = async (v: Viewer) => (await Promise.all(chatSuggestions.filter((s) => s.routes.includes("/settings/integrations"))
    .map(async (s) => ((await s.when!(v as never, {})) ? s.label : null)))).filter(Boolean);

  const app = async (value: string) => {
    forgetAppCheck(T);
    await revokeSecret(job, { connector: "github-oauth", reason: "replaced" }).catch(() => {});
    await db.t.owner`delete from secrets.version where credential_id in (select id from secrets.credential where connector = 'github-oauth')`;
    await db.t.owner`delete from secrets.credential where connector = 'github-oauth'`;
    await putSecret(job, { connector: "github-oauth", value });
  };
  it.each([
    ["a wrong Client secret", `app-id:${"w".repeat(40)}`, "good", "credentials"],
    ["a wrong Client ID", "Ov23liWRONG0000:app-secret-fake-0000000000", "good", "credentials"],
    ["a Redirect URI GitHub refuses", "app-id:app-secret-fake-0000000000", "mismatch", "callback"],
    ["a code GitHub doesn't know (still 'Try again')", "app-id:app-secret-fake-0000000000", "unknown-code", "github"],
  ])("AC2 GitHub's exchange reply for %s comes back as its own result", async (_n, value, code, result) => {
    await app(value);
    const r = (await db.registry.call(kasun, "connect_github", {}, { source: "mcp" })) as { open: { url: string } };
    const e = await completeGitHubConnect(ctxFor(kasun), { state: new URL(r.open.url).searchParams.get("state")!, code }).catch((x: unknown) => x);
    expect(resultCodeOf(e)).toBe(result);
    if (result === "credentials") expect([RESULTS.credentials.includes("An Admin replaces the GitHub app"), /try again/i.test(RESULTS.credentials)]).toEqual([true, false]);
  });

  // Review round 3 (escalated): one state, and what each consumer does with it, as one table.
  const ok = `Ov23liFAKEdemo01:${"c".repeat(40)}`;
  const past = async () => { await db.t.owner`update secrets.credential set expires_at = now() - interval '1 day' where connector = 'github-oauth'`; };
  it.each([
    ["no app", null, null, "maya", "none", null, ["Set up the GitHub app"]],
    ["an expired app", ok, past, "maya", "expired", null, ["Set up the GitHub app"]],
    ["a value that doesn't parse", "only-the-secret-00000000000000", null, "maya", "incomplete", null, ["Set up the GitHub app"]],
    ["a usable app", ok, null, "maya", "ready", null, ["Rotate the GitHub app secret", "Remove the GitHub app"]],
    ["no key service (then it recovers)", ok, () => configureSecrets({ kms: null }), "maya", "unchecked", /no key service is set/, ["Remove the GitHub app"]],
    ["a different key service (then it recovers)", ok, () => configureSecrets({ kms: localKms(new Uint8Array(32)) }), "maya", "unchecked", /^amax couldn't read the GitHub app's credential just now$/, ["Remove the GitHub app"]],
    ["someone who doesn't manage credentials (119: the real state)", ok, null, "kasun", "ready", null, []],
  ] as const)("AC3 %s", async (_n, value, then, who, state, why, offers) => {
    await app(value ?? ok);
    if (!value) await revokeSecret(job, { connector: "github-oauth", reason: "unused" });
    await then?.();
    const v = who === "maya" ? maya : kasun;
    const got = (await db.registry.call(v, "get_github_app_status", {}, { source: "mcp" })) as { state: string; checkProblem: string | null };
    const offered = await offeredTo(v);
    configureSecrets({ kms: db.kms });
    expect([got.state, why ? why.test(String(got.checkProblem)) : got.checkProblem, offered]).toEqual([state, why ? true : null, offers]);
    if (state === "unchecked" && who === "maya") expect((await status()).state).toBe("ready");
  });
});
