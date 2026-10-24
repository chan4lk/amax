import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@amax/db";
import { hasDb } from "@amax/db/testdb";
import { contextForViewer, setGrants } from "@amax/auth";
import { agentsPlatform } from "@amax/agents/module";
import { acceptSuggestion, setSuggestionKinds, undoSuggestion } from "@amax/agents/server";
import { EVENTS as DELIVERY, type CommitTime } from "@amax/delivery/contracts";
import { commitDraft, commitTimeHandler } from "../suggestions";
import { installedModules } from "./installed";
import { T, timeDb } from "./db";

describe.skipIf(!hasDb)("071 one commit logs one entry (Postgres)", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  beforeAll(async () => { db = await timeDb(); setGrants([...(await installedModules()), agentsPlatform as never]); setSuggestionKinds([commitDraft]); }, 120_000);
  afterAll(() => db?.t.drop());

  const push = (c: CommitTime, id: string) => withTenant(db.app, T, (tx) => commitTimeHandler.handle({ tx, tenantId: T, event: { id, name: DELIVERY.commitTime, payload: c } }));
  const suggestions = (commit: string) => db.q(sql`select id, status from agents.suggestion where kind = 'time.commit-draft' and target_id like ${`%:${commit}`} order by created_at`);
  const entries = (commit: string) => db.q(sql`select id from time.entry where source_ref = ${`git:${commit}`} and deleted_at is null`);

  it("AC6 a second suggestion for a logged commit logs nothing, its undo keeps the entry, and a re-push drafts nothing; accepting both at once logs one", async () => {
    const nimal = await db.as("nimal");
    const [con] = await db.q(sql`select id from delivery.project where key = 'CON'`);
    const c: CommitTime = { userId: nimal.userId, projectId: con.id as string, projectKey: "CON", proposalKey: "CON-014", day: "2026-10-19", hours: 1.5, commit: "d00b1e5a7" };
    await push(c, "ev-a");
    await push({ ...c, day: "2026-10-20" }, "ev-b");
    const [first, second] = await suggestions(c.commit);
    const ctx = contextForViewer(nimal, "chat");
    await acceptSuggestion(ctx, { id: first.id as string });
    await acceptSuggestion(ctx, { id: second.id as string });
    expect(await entries(c.commit)).toHaveLength(1);
    await undoSuggestion(ctx, { id: second.id as string });
    expect(await entries(c.commit)).toHaveLength(1);
    await push(c, "ev-c");
    expect(await suggestions(c.commit)).toHaveLength(2);

    const d = { ...c, commit: "e11c2f6b8" };
    await push(d, "ev-d");
    await push({ ...d, day: "2026-10-20" }, "ev-e");
    const both = await suggestions(d.commit);
    await Promise.allSettled(both.map((s) => acceptSuggestion(contextForViewer(nimal, "chat"), { id: s.id as string })));
    expect(await entries(d.commit)).toHaveLength(1);
  }, 60_000);
});
