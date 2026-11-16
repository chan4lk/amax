import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import type { ModuleManifest } from "@amax/core";
import { configureRuntime } from "@amax/core/server";
import { installAuthorizer, setGrants, setViewerScopeResolvers, viewerForUser, type Viewer } from "@amax/auth";
import { authFixtures } from "@amax/auth/fixtures";
import { configureAi } from "@amax/ai";
import { fakeProvider } from "@amax/ai/fake";
import { chatTurn, confirmAction } from "@amax/chat";
import { createRegistry, type Registry } from "@amax/mcp";
import { loadFixtures, lumen } from "@amax/testing";

const T = lumen.tenant.id;
const installed = (id: string): Promise<ModuleManifest> => import(`@amax/${id}/module`).then((m) => m.default);

// 110 AC-7: the Add to project card, its Through edited on the card, is worded again at confirm: the stored card's done
// line names the months and percent written, through the chat engine's own confirm path.
describe.skipIf(!hasDb)("110 the confirmed Add to project card names what was written (Postgres)", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  let registry: Registry;
  let maya: Viewer;
  beforeAll(async () => {
    // 111 AC-4: a clock fixed before the months it allocates, so the test doesn't drift as the real date passes them.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-16T10:00:00Z"));
    t = await migratedDatabase();
    app = t.app();
    configureRuntime({ db: app, auditKey: "k".repeat(32) });
    const mods = await Promise.all(["delivery", "hr", "allocations"].map(installed));
    setGrants(mods);
    setViewerScopeResolvers(mods.map((m) => m.viewerScopes!).filter(Boolean));
    installAuthorizer();
    await loadFixtures(app, [{ id: "auth", fixtures: [authFixtures] }, ...mods], lumen);
    await t.owner`insert into ai.settings (tenant_id, zdr_confirmed) values (${T}, true) on conflict do nothing`;
    registry = createRegistry(mods);
    const [u] = await withTenant(app, T, (tx) => tx.execute(sql`select id from auth.user where email = 'maya@lumenlabs.test'`));
    maya = (await withTenant(app, T, (tx) => viewerForUser(tx, T, u.id as string)))!;
  }, 120_000);
  afterAll(() => { vi.useRealTimers(); return t?.drop(); });

  it.each([
    ["Through as drafted", {}, "Added Dinesh Wickrama to CON · 40% Mar–May"],
    ["Through edited to July", { through: "2027-07" }, "Added Dinesh Wickrama to CON · 40% Mar–Jul"],
    ["Through edited into the next year", { through: "2028-01" }, "Added Dinesh Wickrama to CON · 40% Mar 2027–Jan 2028"],
  ])("AC7 %s", async (_name, edits, done) => {
    await withTenant(app, T, (tx) => tx.execute(sql`delete from allocations.allocation where person_id = (select id from hr.person where name = 'Dinesh Wickrama') and month >= '2027-03-01'`));
    const input = { person: "Dinesh Wickrama", projectKey: "CON", month: "2027-03", through: "2027-05", percent: 40, standing: false };
    configureAi({ db: app, model: "m", provider: fakeProvider([() => ({ toolCalls: [{ type: "tool_use" as const, id: "c1", name: "allocate", input }] }), () => ({ text: "Check the card." })]) });
    const turn = await chatTurn(app, registry, maya, { text: "add Dinesh to CON from March to May" });
    const { action } = await confirmAction(app, registry, maya, turn.conversationId, turn.pending[0].id, { edits });
    expect(action.look?.done).toBe(done);
  });
});
