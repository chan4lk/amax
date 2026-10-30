import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import { chatTurn } from "@amax/chat";
import { chatWorld, registry, scripted, T } from "../../../packages/chat/tests/world";
import { sameUser, SignedInElsewhere } from "../lib/same-user";

const signedIn = vi.hoisted(() => ({ viewer: undefined as unknown, db: undefined as unknown }));
vi.mock("@amax/auth", async (real) => ({ ...(await real<object>()), currentViewer: async () => signedIn.viewer }));
vi.mock("../lib/server", () => ({ getDb: () => signedIn.db, toolRegistry: () => registry, chatIntents: () => [] }));

const { confirmChat, sendChat } = await import("../app/actions/chat");
const { listChats } = await import("../app/actions/chat-history");

describe("070 AC53 a page rendered for one user can't act as another", () => {
  it("AC53 the check passes the same user, refuses another, and grants nothing", () => {
    expect(() => sameUser({ userId: "u1" }, "u1")).not.toThrow();
    expect(() => sameUser({ userId: "u2" }, "u1")).toThrow(SignedInElsewhere);
    expect(() => sameUser(null, "u1")).toThrow(SignedInElsewhere);
  });
});

describe.skipIf(!hasDb)("070 AC53 chat actions after another tab switched the session (Postgres)", () => {
  let world: Awaited<ReturnType<typeof chatWorld>>;
  let maya: Viewer, sahan: Viewer;
  const chats = async () => (await withTenant(world.app, T, (tx) => tx.execute(sql`select count(*)::int as n from chat.conversation`)))[0].n;

  beforeAll(async () => {
    world = await chatWorld();
    signedIn.db = world.app as Db;
    [maya, sahan] = await Promise.all([world.as("maya"), world.as("sahan")]);
  });
  afterAll(() => world?.t.drop());

  it("AC53 a tab rendered for Maya, now carrying Sahan's session, can't send, confirm or list; nothing is written", async () => {
    scripted(world.app, [() => ({ text: "Sure." })]);
    const keep = (await chatTurn(world.app, registry, sahan, { text: "Keep this chat" })).conversationId;
    scripted(world.app, [() => ({ toolCalls: [{ type: "tool_use", id: "c1", name: "archive_conversation", input: { id: keep } }] }), () => ({ text: "Archive it?" })]);
    const turn = await chatTurn(world.app, registry, sahan, { text: "archive it" });
    signedIn.viewer = sahan;
    const before = await chats();
    expect(await sendChat({ text: "hello", as: maya.userId })).toMatchObject({ ok: false, error: expect.stringContaining("another tab") });
    expect(await chats()).toBe(before);
    expect(await confirmChat(turn.conversationId, turn.pending[0].id, maya.userId)).toMatchObject({ state: "error", note: expect.stringContaining("another tab") });
    expect(await withTenant(world.app, T, (tx) => tx.execute(sql`select archived_at from chat.conversation where id = ${keep}`))).toEqual([{ archived_at: null }]);
    expect(await listChats("", maya.userId)).toMatchObject({ ok: false, error: expect.stringContaining("another tab") });
    expect(await confirmChat(turn.conversationId, turn.pending[0].id, sahan.userId)).toMatchObject({ state: "done" });
  });
});
