import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { configureSecrets, localKms } from "@amax/core/secrets";
import type { Viewer } from "@amax/auth";
import { adminDb } from "./fixture";

const STEER = /Use set_github_app/;

// 116 AC-2, AC-6: the generic credential tools send the GitHub app to set_github_app, refuse a value without
// set_github_app, over MCP too, and say when no key service is set instead of "I can't tell whether this was done".
describe.skipIf(!hasDb)("116 the github-oauth guard (Postgres)", () => {
  let db: Awaited<ReturnType<typeof adminDb>>;
  let maya: Viewer;
  beforeAll(async () => { db = await adminDb(); maya = await db.as("maya"); });
  afterAll(() => db?.t.drop());
  const call = (tool: string, input: Record<string, unknown>, secret: string) => db.registry.call(maya, tool, input, { source: "mcp", secret });
  const propose = (tool: string, connector: string) => db.registry.toolsFor(maya).find((t) => t.name === tool)!.propose!(maya as never, { connector } as never);

  it.each([["put_secret"], ["rotate_secret"]])("AC2 chat is steered from %s to set_github_app for the GitHub app only", async (tool) => {
    await expect(propose(tool, "github-oauth")).rejects.toThrow(STEER);
    await expect(propose(tool, "xero")).resolves.toBeUndefined();
  });

  it.each([
    ["put_secret, a well-formed value", "put_secret", `Ov23liFAKEdemo01:${"f".repeat(40)}`],
    ["put_secret, only the secret", "put_secret", "f".repeat(40)],
    ["rotate_secret, a well-formed value", "rotate_secret", `Ov23liFAKEdemo01:${"f".repeat(40)}`],
  ])("AC2 review round 1: over MCP too, %s is refused for the GitHub app", async (_n, tool, value) => {
    await expect(call(tool, { connector: "github-oauth" }, value)).rejects.toThrow(STEER);
  });

  it.each([
    ["put_secret", "2020-01-31", /has passed/], ["put_secret", "2026-13-45", /isn't a real day/],
    ["rotate_secret", "2099-02-30", /isn't a real day/], ["put_secret", "2099-01-31", null],
  ])("review round 3: %s's card checks the given expiry %s before the value is typed", async (tool, expiresAt, refused) => {
    const t = db.registry.toolsFor(maya).find((x) => x.name === tool)!;
    const propose = t.propose!(maya as never, { connector: "xero", expiresAt } as never);
    if (refused) await expect(propose).rejects.toThrow(refused);
    else await expect(propose).resolves.toBeUndefined();
  });

  it("AC6 with no key service, adding a credential says an operator sets AMAX_KMS", async () => {
    configureSecrets({ kms: null });
    try { await expect(call("put_secret", { connector: "xero" }, "x".repeat(30))).rejects.toThrow(/no key service is set \(AMAX_KMS\)/); }
    finally { configureSecrets({ kms: localKms(new Uint8Array(randomBytes(32))) }); }
  });
});
