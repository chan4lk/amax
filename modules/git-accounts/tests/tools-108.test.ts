import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { gitIdentitiesOf, linkGitIdentity } from "@amax/auth/git-identity";
import type { Viewer } from "@amax/auth";
import { completeGitHubConnect, OWNERS_NOTE } from "../contracts";
import { ctxFor } from "../server/context";
import { gitAccountsDatabase } from "./setup";

// 108 AC-7, AC-8: the tools: the red Disconnect card, an identity's pin, and an Admin's unlink of anyone's.
describe.skipIf(!hasDb)("108 the Git accounts tools (Postgres)", () => {
  let db: Awaited<ReturnType<typeof gitAccountsDatabase>>;
  let kasun: Viewer, maya: Viewer;
  beforeAll(async () => {
    db = await gitAccountsDatabase();
    [kasun, maya] = [await db.as("kasun"), await db.as("maya")];
    await db.setUpApp();
  }, 120_000);
  afterAll(() => db?.drop());
  const connect = async () => {
    const r = (await db.registry.call(kasun, "connect_github", {}, { source: "mcp" })) as { open: { url: string } };
    await completeGitHubConnect(ctxFor(kasun), { state: new URL(r.open.url).searchParams.get("state")!, code: "good" });
  };
  const toolOf = (v: Viewer, name: string) => db.registry.toolsFor(v).find((t) => t.name === name);

  it("AC7 Disconnect GitHub is a red card naming what goes; confirming removes it", async () => {
    await connect();
    const card = await toolOf(kasun, "disconnect_github")!.card!(kasun as never, {} as never);
    expect([card.title, card.look?.tone, card.look?.confirm, card.lines.find((l) => l.label === "Owners")?.value]).toEqual(["Disconnect GitHub: @kasun-dias and 2 emails", "danger", "Disconnect", OWNERS_NOTE]);
    await db.registry.call(kasun, "disconnect_github", {}, { source: "mcp" });
    expect(await db.tx((tx) => gitIdentitiesOf(tx, kasun.userId))).toEqual([]);
  });

  it("review round 1: Disconnect names every GitHub login the person holds, and removes exactly that", async () => {
    await connect();
    await db.tx((tx) => linkGitIdentity(tx, kasun.tenantId, { provider: "github", login: "kasun-old", email: null, userId: kasun.userId }));
    const card = await toolOf(kasun, "disconnect_github")!.card!(kasun as never, {} as never);
    expect(card.title).toBe("Disconnect GitHub: @kasun-dias, @kasun-old and 2 emails");
    expect(await db.registry.call(kasun, "disconnect_github", {}, { source: "mcp" })).toEqual({ logins: ["kasun-dias", "kasun-old"], removed: 3 });
    expect(await db.tx((tx) => gitIdentitiesOf(tx, kasun.userId))).toEqual([]);
  });

  it("AC8 an email's pin reads it back; only an Admin may unlink someone's identity", async () => {
    await connect();
    const [one] = await db.tx((tx) => gitIdentitiesOf(tx, kasun.userId));
    expect(await db.registry.call(kasun, "get_my_git_identity", { identityId: one.id }, { source: "mcp" })).toMatchObject({ email: one.email, login: "kasun-dias" });
    expect(toolOf(kasun, "unlink_git_identity")).toBeUndefined();
    await db.registry.call(maya, "unlink_git_identity", { identityId: one.id }, { source: "mcp" });
    expect((await db.tx((tx) => gitIdentitiesOf(tx, kasun.userId))).map((g) => g.id)).not.toContain(one.id);
  });
});
