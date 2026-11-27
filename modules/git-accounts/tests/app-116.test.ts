import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { configureSecrets, localKms, NO_KEY_SERVICE, putSecret, revokeSecret, useSecret } from "@amax/core/secrets";
import { contextFor } from "@amax/core/server";
import type { Viewer } from "@amax/auth";
import { completeGitHubConnect } from "../contracts";
import { githubCallback } from "../server/callback";
import { resultCodeOf } from "../server/connect";
import { returnResult } from "../server/read";
import { ctxFor } from "../server/context";
import { APP_INCOMPLETE } from "../words";
import { gitAccountsDatabase, T } from "./setup";

const stores = (value: string) => useSecret(contextFor.job(T, "test"), { connector: "github-oauth", purpose: "test" }, async (s) => s.reveal() === value);

// 116 AC-1, AC-6: one card sets up the GitHub app; what goes wrong is said, never "I can't tell whether this was done".
describe.skipIf(!hasDb)("116 setting up the GitHub app (Postgres)", () => {
  let db: Awaited<ReturnType<typeof gitAccountsDatabase>>;
  let kasun: Viewer, maya: Viewer;
  beforeAll(async () => { db = await gitAccountsDatabase(); [kasun, maya] = [await db.as("kasun"), await db.as("maya")]; }, 120_000);
  afterAll(() => db?.drop());
  const tool = () => db.registry.toolsFor(maya).find((t) => t.name === "set_github_app")!;
  const set = (clientId: string, secret?: string) => db.registry.call(maya, "set_github_app", { clientId }, { source: "chat", secret });

  it.each([
    ["the placeholder", "<Client ID>", "a".repeat(40), /Client ID/],
    ["a client id with a space", "Ov23li abc", "a".repeat(40), /Client ID/],
    ["a client id with a colon", "Ov23li:abc", "a".repeat(40), /Client ID/],
    ["a short secret", "Ov23liFAKEdemo01", "short", /Client secret/],
    ["a secret with a space", "Ov23liFAKEdemo01", `${"a".repeat(30)} b`, /Client secret/],
    ["no secret typed", "Ov23liFAKEdemo01", undefined, /Client secret/],
  ])("AC1 refuses %s, saying what GitHub shows", async (_n, id, secret, words) => {
    await expect(set(id, secret)).rejects.toThrow(words);
  });

  it("AC1 the card names the callback URL to copy, then the app is stored as <id>:<secret>, and a second one replaces it", async () => {
    expect(db.registry.toolsFor(kasun).some((t) => t.name === "set_github_app")).toBe(false);
    const card = await tool().card!(maya as never, { clientId: "Ov23liFAKEdemo01" } as never);
    expect([card.title, card.lines.find((l) => l.copy)?.value]).toEqual(["Set up the GitHub app", "http://localhost:3000/api/git/github/callback"]);
    await set("Ov23liFAKEdemo01", "f".repeat(40));
    expect(await stores(`Ov23liFAKEdemo01:${"f".repeat(40)}`)).toBe(true);
    expect((await tool().card!(maya as never, { clientId: "Ov23liFAKEdemo02" } as never)).title).toBe("Replace the GitHub app");
    await set("Ov23liFAKEdemo02", "e".repeat(40));
    expect(await stores(`Ov23liFAKEdemo02:${"e".repeat(40)}`)).toBe(true);
  });

  it.each([
    ["a credential without its client id", "only-the-secret-0000000000", APP_INCOMPLETE],
    ["a credential ending in its colon", "Ov23liFAKEdemo01:", APP_INCOMPLETE],
  ])("AC6 connecting with %s says an Admin sets the app up again", async (_n, value, words) => {
    await revokeSecret(contextFor.job(T, "test"), { connector: "github-oauth", reason: "replaced" }).catch(() => {});
    await putSecret(contextFor.job(T, "test"), { connector: "github-oauth", value });
    await expect(db.registry.call(kasun, "connect_github", {}, { source: "chat" })).rejects.toThrow(words);
  });

  it("AC6 GitHub refusing the callback URL comes back as its own result, naming the URL", async () => {
    await revokeSecret(contextFor.job(T, "test"), { connector: "github-oauth", reason: "replaced" }).catch(() => {});
    await db.setUpApp();
    const r = (await db.registry.call(kasun, "connect_github", {}, { source: "mcp" })) as { open: { url: string } };
    const e = await completeGitHubConnect(ctxFor(kasun), { state: new URL(r.open.url).searchParams.get("state")!, code: "mismatch" }).catch((x: unknown) => x);
    expect([resultCodeOf(e), (e as Error).message]).toEqual(["callback", expect.stringContaining("http://localhost:3000/api/git/github/callback")]);
  });

  it("final pass: GitHub's own redirect_uri_mismatch return (forwarded from the homepage) records the callback result", async () => {
    const r = (await db.registry.call(kasun, "connect_github", {}, { source: "mcp" })) as { open: { url: string } };
    const query = await githubCallback(ctxFor(kasun), { error: "redirect_uri_mismatch", state: new URL(r.open.url).searchParams.get("state")! });
    expect(await returnResult(kasun, query.ref!)).toEqual({ result: "callback", skipped: 0 });
  });

  it("AC6 with no key service, setting the app up says an operator sets AMAX_KMS", async () => {
    configureSecrets({ kms: null });
    try { await expect(set("Ov23liFAKEdemo03", "d".repeat(40))).rejects.toThrow(NO_KEY_SERVICE); }
    finally { configureSecrets({ kms: localKms(new Uint8Array(randomBytes(32))) }); }
  });
});
