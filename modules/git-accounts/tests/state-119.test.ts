import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { configureSecrets, putSecret, revokeSecret } from "@amax/core/secrets";
import { contextFor } from "@amax/core/server";
import type { Viewer } from "@amax/auth";
import { chatSuggestions } from "../chat-suggestions";
import { gitAccountsOverview } from "../overview";
import { GitAccountsPage } from "../ui/GitAccountsPage";
import { setAppCheckMs, forgetAppCheck } from "../server/app";
import { gitAccountsDatabase, T } from "./setup";

const GOOD = "app-id:app-secret-fake-0000000000";

// 119: everyone gets the app's real state; connecting follows it; a success expires and a failed use drops it.
describe.skipIf(!hasDb)("119 the GitHub app's state for everyone (Postgres)", () => {
  let db: Awaited<ReturnType<typeof gitAccountsDatabase>>;
  let kasun: Viewer;
  beforeAll(async () => { db = await gitAccountsDatabase(); kasun = await db.as("kasun"); }, 120_000);
  afterAll(() => { setAppCheckMs(10 * 60_000); return db?.drop(); });
  const job = contextFor.job(T, "test");
  const app = async (value: string | null) => {
    forgetAppCheck(T);
    await revokeSecret(job, { connector: "github-oauth", reason: "replaced" }).catch(() => {});
    await db.t.owner`delete from secrets.version where credential_id in (select id from secrets.credential where connector = 'github-oauth')`;
    await db.t.owner`delete from secrets.credential where connector = 'github-oauth'`;
    if (value) await putSecret(job, { connector: "github-oauth", value });
  };
  const state = async () => ((await db.registry.call(kasun, "get_github_app_status", {}, { source: "mcp" })) as { state: string }).state;
  // Final pass: the Git accounts page is the third place that invites a person to connect.
  const page = async () => (await import("react-dom/server")).renderToStaticMarkup((await GitAccountsPage({ viewer: kasun, searchParams: {} } as never)) as never);
  const invited = async () => [
    await chatSuggestions.find((s) => s.label === "Connect GitHub")!.when!(kasun as never, {}),
    ((await gitAccountsOverview(kasun)).waiting ?? []).length > 0,
    (await page()).includes("Ask amax · Connect GitHub"),
  ];

  it.each([
    ["a usable app", GOOD, "ready", [true, true, true]],
    ["a value that doesn't parse", "only-the-secret-00000000000000", "incomplete", [false, false, false]],
    ["no app", null, "none", [false, false, false]],
    ["an expired app (review round 1)", "expired", "expired", [false, false, false]],
  ])("AC1 AC2 for an Engineer, %s is %s, and connecting is offered only when ready", async (_n, value, expected, offers) => {
    setAppCheckMs(0);
    await app(value === "expired" ? GOOD : value);
    if (value === "expired") await db.t.owner`update secrets.credential set expires_at = now() - interval '1 day' where connector = 'github-oauth'`;
    expect([await state(), await invited()]).toEqual([expected, offers]);
  });

  it("AC3 review round 1: another process's new app is seen at once; its failures within the lifetime; a local failure at once", async () => {
    setAppCheckMs(10 * 60_000);
    await app(GOOD);
    expect(await state()).toBe("ready");
    // Another process stores a new value: no forget here, but the credential's version changed in the database.
    await putSecret(job, { connector: "github-oauth", value: "only-the-secret-00000000000000", graceHours: 0 });
    expect(await state()).toBe("incomplete");
    await app(GOOD);
    expect(await state()).toBe("ready");
    // Another process's outage (same version, nothing failed here) is seen once the lifetime ends.
    configureSecrets({ kms: null });
    const cached = await state();
    setAppCheckMs(0);
    const expired = await state();
    // A failed use in this process drops the success at once.
    setAppCheckMs(10 * 60_000);
    configureSecrets({ kms: db.kms });
    expect(await state()).toBe("ready");
    configureSecrets({ kms: null });
    await db.registry.call(kasun, "connect_github", {}, { source: "mcp" }).catch(() => null);
    const local = await state();
    configureSecrets({ kms: db.kms });
    expect([cached, expired, local, await state()]).toEqual(["ready", "unchecked", "unchecked", "ready"]);
  });

  it("AC5 every field the Integrations card reads is one the status returns", async () => {
    await app(GOOD);
    const status = (await db.registry.call(kasun, "get_github_app_status", {}, { source: "mcp" })) as Record<string, unknown>;
    const card = readFileSync(join(__dirname, "../../../apps/web/components/settings/GitHubAppCard.tsx"), "utf8");
    const fields = [...(card.match(/export type GitHubAppStatus = \{([^}]+)\}/)?.[1] ?? "").matchAll(/(\w+):/g)].map((m) => m[1]);
    expect([fields.length >= 5, fields.filter((f) => !(f in status))]).toEqual([true, []]);
  });
});
