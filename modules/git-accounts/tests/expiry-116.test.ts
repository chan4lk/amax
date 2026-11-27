import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { hasDb } from "@amax/db/testdb";
import { putSecret, revokeSecret } from "@amax/core/secrets";
import { contextFor } from "@amax/core/server";
import type { Viewer } from "@amax/auth";
import { forgetAppCheck } from "../server/app";
import { gitAccountsDatabase, T } from "./setup";

const day = 86_400_000;

// 116 review round 1: replacing the GitHub app keeps its expiry by 052's rule (a past one is refused, never dropped),
// and the screen and the card read the same credential: an expired app shows as Expired and the card replaces it.
describe.skipIf(!hasDb)("116 the GitHub app's expiry and state (Postgres)", () => {
  let db: Awaited<ReturnType<typeof gitAccountsDatabase>>;
  let maya: Viewer;
  beforeAll(async () => { db = await gitAccountsDatabase(); maya = await db.as("maya"); }, 120_000);
  afterAll(() => db?.drop());
  const job = contextFor.job(T, "test");
  const fresh = async (expiresAt: Date | null) => {
    forgetAppCheck(T);
    await revokeSecret(job, { connector: "github-oauth", reason: "replaced" }).catch(() => {});
    await db.t.owner`delete from secrets.version where credential_id in (select id from secrets.credential where connector = 'github-oauth')`;
    await db.t.owner`delete from secrets.credential where connector = 'github-oauth'`;
    await putSecret(job, { connector: "github-oauth", value: `Ov23liFAKEdemo01:${"a".repeat(40)}`, expiresAt: expiresAt && expiresAt > new Date() ? expiresAt.toISOString() : null });
    if (expiresAt && expiresAt <= new Date()) await db.t.owner`update secrets.credential set expires_at = ${expiresAt} where connector = 'github-oauth'`;
  };
  const replace = (input: Record<string, unknown> = {}) =>
    db.registry.call(maya, "set_github_app", { clientId: "Ov23liFAKEdemo02", ...input }, { source: "mcp", secret: "b".repeat(40) });
  const expiry = async () => {
    const at = (await db.tx((tx) => tx.execute(sql`select expires_at from secrets.credential where connector = 'github-oauth'`)))[0]?.expires_at;
    return at ? new Date(at as string) : null;
  };

  it.each([
    ["a future expiry is kept", new Date(Date.now() + 30 * day), {}, "kept"],
    ["no expiry stays none", null, {}, null],
    ["a past expiry is refused, never dropped", new Date(Date.now() - day), {}, /has passed; give a new expiresAt/],
    ["a past expiry with a new one given takes the new one", new Date(Date.now() - day), { expiresAt: "2099-01-31" }, "2099-01-31"],
  ])("%s", async (_n, before, input, after) => {
    await fresh(before);
    if (after instanceof RegExp) { await expect(replace(input)).rejects.toThrow(after); return; }
    await replace(input);
    const now = await expiry();
    expect(after === "kept" ? now?.toISOString() : after === null ? now : now?.toISOString().slice(0, 10)).toBe(after === "kept" ? before!.toISOString() : after);
  });

  it.each([
    ["refused before the secret is typed when the expiry has passed", new Date(Date.now() - day), {}, "refused"],
    ["allowed when a new expiry is given", new Date(Date.now() - day), { expiresAt: "2099-01-31" }, "allowed"],
    ["allowed while the expiry is ahead", new Date(Date.now() + 30 * day), {}, "allowed"],
    ["refused for a given day that has passed (round 3)", null, { expiresAt: "2020-01-31" }, /2020-01-31 has passed/],
    ["refused for a given day that isn't real (round 3)", null, { expiresAt: "2026-13-45" }, /isn't a real day/],
    ["refused for February 30 (round 3)", null, { expiresAt: "2099-02-30" }, /isn't a real day/],
  ])("review round 2: the card is %s", async (_n, before, input, outcome) => {
    await fresh(before);
    const propose = db.registry.toolsFor(maya).find((t) => t.name === "set_github_app")!.propose!(maya as never, { clientId: "Ov23liFAKEdemo02", ...input } as never);
    if (outcome === "allowed") await expect(propose).resolves.toBeUndefined();
    else await expect(propose).rejects.toThrow(outcome === "refused" ? /has passed; give a new expiresAt/ : outcome);
  });

  it("an expired app is Expired on the status and the card replaces it", async () => {
    await fresh(new Date(Date.now() - day));
    const status = await db.registry.call(maya, "get_github_app_status", {}, { source: "mcp" });
    const card = await db.registry.toolsFor(maya).find((t) => t.name === "set_github_app")!.card!(maya as never, { clientId: "Ov23liFAKEdemo02" } as never);
    expect([status, card.title, card.lines.find((l) => l.label === "Replaces")?.value]).toEqual([
      expect.objectContaining({ state: "expired" }), "Replace the GitHub app", expect.stringContaining("expired GitHub app"),
    ]);
  });
});
