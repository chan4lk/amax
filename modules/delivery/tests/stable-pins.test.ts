import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import { configureRuntime } from "@amax/core/server";
import { configureAi } from "@amax/ai";
import { fakeProvider, type FakeStep } from "@amax/ai/fake";
import { contextForViewer, installAuthorizer, setGrants, setViewerScopeResolvers, viewerForUser, type Viewer } from "@amax/auth";
import { authFixtures } from "@amax/auth/fixtures";
import { createRegistry } from "@amax/mcp";
import { chatPlatform, chatTurn, confirmAction, openConversation, UNAVAILABLE, type Pin } from "@amax/chat";
import { loadFixtures, lumen } from "@amax/testing";
import { facet } from "@amax/ui";
import delivery from "../module";
import { deploymentPin, environmentPin, historyPin, proposalPin, releasePin } from "../pins";
import { getProposal, getRelease, listEnvironments, listReleases } from "../server/queries";
import { createRelease, syncProposal, tagRelease, upsertEnvironment } from "../server/services";
import { tracked } from "./release-fields";

const T = lumen.tenant.id;

// 059: pins name records by id, and their labels are read from the record, so a rename by any path
// leaves every saved pin on the same record under its new name; old name-keyed pins move onto ids.
describe.skipIf(!hasDb)("059 stable pins (Postgres)", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  let sahan: Viewer;
  const registry = createRegistry([delivery, chatPlatform]);
  const q = (query: ReturnType<typeof sql>) => withTenant(app, T, (tx) => tx.execute(query));
  const ai = (steps: FakeStep[]) => configureAi({ provider: fakeProvider(steps), db: app, model: "claude-haiku-5-5" });
  beforeAll(async () => {
    t = await migratedDatabase();
    app = t.app();
    configureRuntime({ db: app, auditKey: "k".repeat(32) });
    setGrants([delivery, chatPlatform]);
    setViewerScopeResolvers([delivery.viewerScopes!]);
    installAuthorizer();
    await loadFixtures(app, [{ id: "auth", fixtures: [authFixtures] }, delivery], lumen);
    await t.owner`insert into ai.settings (tenant_id, zdr_confirmed) values (${T}, true) on conflict do nothing`;
    const [u] = await q(sql`select id from auth.user where email = 'sahan@lumenlabs.test'`);
    sahan = (await withTenant(app, T, (tx) => viewerForUser(tx, T, u.id as string)))!;
  }, 60_000);
  afterAll(() => t?.drop());

  const save = async (pins: Pin[]) => { ai([() => ({ text: "Noted." })]); return (await chatTurn(app, registry, sahan, { text: "look", pins })).conversationId; };
  const reopen = async (id: string) => (await openConversation(app, registry, sahan, id))!.pins;
  // The three ways a record is renamed: a person confirming in chat, an MCP client, and a job (an
  // agent or pipeline acting for the person, or the specclaw sync) calling the service.
  const by = {
    chat: async (tool: string, input: Record<string, unknown>) => {
      ai([() => ({ toolCalls: [{ type: "tool_use", id: "c1", name: tool, input }] }), () => ({ text: "Confirm?" })]);
      const turn = await chatTurn(app, registry, sahan, { text: "please" });
      await confirmAction(app, registry, sahan, turn.conversationId, turn.pending[0].id);
    },
    mcp: (tool: string, input: Record<string, unknown>) => registry.call(sahan, tool, input, { source: "mcp" }),
    job: (tool: string, input: Record<string, unknown>) => (tool === "tag_release" ? tagRelease : upsertEnvironment)(contextForViewer(sahan, "job"), input as never),
  };
  const release = async (version: string) => (await listReleases(sahan, { projectKey: "CON" })).find((r) => r.version === version)!;
  const environment = async (name: string) => ({ ...(await listEnvironments(sahan, "CON")).find((e) => e.name === name)!, projectKey: "CON" });
  const releasePins = async (version: string) => {
    const r = await release(version);
    const h = (await getRelease(sahan, "CON", version))!;
    return [releasePin(r), facet(historyPin(h), " proposals"), ...h.history.slice(0, 1).map((d) => deploymentPin({ ...h, ...d }))];
  };

  it.each([
    ["release", "chat", "v2.5.0", "v2.5.1"], ["release", "mcp", "v2.4.0", "v2.4.1"], ["release", "job", "v2.3.0", "v2.3.1"],
    ["environment", "chat", "Dev", "Build"], ["environment", "mcp", "QA", "Test"], ["environment", "job", "UAT", "Acceptance"],
  ] as const)("AC5 renaming a %s by %s: saved pins stay on the record and show its new name", async (kind, path, from, to) => {
    const pins = kind === "release" ? await releasePins(from) : [environmentPin(await environment(from))];
    const id = await save(pins);
    if (kind === "release") await by[path]("tag_release", { projectKey: "CON", version: from, newVersion: to });
    else await by[path]("upsert_environment", { projectKey: "CON", name: from, rename: to });
    const want = kind === "release" ? await releasePins(to) : [environmentPin(await environment(to))];
    expect(await reopen(id)).toEqual(want);
    expect(want.map((p) => p.args)).toEqual(pins.map((p) => p.args));
    expect(want.every((p) => p.label.includes(to) && !p.label.includes(`${from} `) && !p.label.endsWith(from))).toBe(true);
  }, 60_000);

  const sync = (key: string) => syncProposal(contextForViewer(sahan, "job"), { projectKey: "CON", project: { name: "Contoso Portal", client: "Contoso" }, key, title: "From the spec",
    phase: "planned", tasksDone: 0, tasksTotal: 1, source: "specclaw", sourceRef: `changes/${key}`, committedAt: "2026-10-01T00:00:00Z", releasedAt: null, meta: {} });

  it("AC5 a proposal rekeyed by the specclaw sync (job): its saved pin stays on it and shows the new key", async () => {
    const before = (await getProposal(sahan, { key: "CON-014" }))!;
    const id = await save([proposalPin(before)]);
    await sync("CON-014");
    const after = (await getProposal(sahan, { proposalId: before.id }))!;
    expect(after.key).not.toBe("CON-014");
    expect(await reopen(id)).toEqual([proposalPin(after)]);
  }, 60_000);

  it("AC2 old name-keyed pins move onto ids once; one whose name was reused shows No longer available", async () => {
    const env = await environment("Prod");
    const old: Pin[] = [
      { label: "Contoso Portal v9.0.0", tool: "get_release", args: { projectKey: "CON", version: "v9.0.0" } },
      { label: "CON Prod", tool: "get_environment", args: { projectKey: "CON", name: "Prod" } },
      { label: "CON-013 Dark mode", tool: "get_proposal", args: { key: "CON-013" } },
    ];
    await createRelease(contextForViewer(sahan, "job"), { ...tracked("prod"), projectKey: "CON", version: "v9.0.0", proposalKeys: [] });
    const reused = (await release("v9.0.0")).id;
    // Saved before 059: straight into the row, as an older build left it.
    const [c] = await q(sql`insert into chat.conversation (tenant_id, user_id, pins) values (${T}, ${sahan.userId}, ${JSON.stringify(old)}::jsonb) returning id`);
    // Then the release is re-tagged and its old tag reused, and the sync gives the key to a new proposal.
    await tagRelease(contextForViewer(sahan, "job"), { projectKey: "CON", version: "v9.0.0", newVersion: "v9.0.1" });
    await createRelease(contextForViewer(sahan, "job"), { ...tracked("prod"), projectKey: "CON", version: "v9.0.0", proposalKeys: [] });
    await sync("CON-013");
    const gone = { ...old[0], label: UNAVAILABLE, unavailable: true };
    const want = [gone, environmentPin(env), { ...old[2], label: UNAVAILABLE, unavailable: true }];
    expect(await reopen(c.id as string)).toEqual(want);
    expect(await reopen(c.id as string)).toEqual(want);
    expect((await release("v9.0.1")).id).toBe(reused);
    // The model is never sent the release that took the old tag.
    let sent = "";
    ai([(req) => { sent = JSON.stringify(req.messages); return { text: "Noted." }; }]);
    await chatTurn(app, registry, sahan, { conversationId: c.id as string, text: "and now?", pins: want });
    expect(sent).toContain(env.id);
    expect(sent).not.toContain((await release("v9.0.0")).id);
    expect(sent).toContain("no longer available");
  }, 60_000);
});
