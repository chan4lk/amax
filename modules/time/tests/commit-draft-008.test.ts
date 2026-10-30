import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@amax/db";
import { hasDb } from "@amax/db/testdb";
import { contextForViewer, setGrants } from "@amax/auth";
import { agentsPlatform } from "@amax/agents/module";
import { installedModules } from "./installed";
import { acceptSuggestion, setSuggestionKinds, undoSuggestion } from "@amax/agents/server";
import { EVENTS as DELIVERY, type CommitTime } from "@amax/delivery/contracts";
import { commitDraft, commitTimeHandler } from "../suggestions";
import { T, timeDb } from "./db";

describe.skipIf(!hasDb)("008 AC-3 a commit's hours are a draft suggestion on the person's own timesheet", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  beforeAll(async () => { db = await timeDb(); setGrants([...(await installedModules()), agentsPlatform as never]); setSuggestionKinds([commitDraft]); }, 120_000);
  afterAll(() => db?.t.drop());

  it("nothing is logged until the person accepts; accepted it's agent time in a draft week; undo takes it back", async () => {
    const nimal = await db.as("nimal");
    const [con] = await db.q(sql`select id from delivery.project where key = 'CON'`);
    const c: CommitTime = { userId: nimal.userId, projectId: con.id as string, projectKey: "CON", proposalKey: "CON-014", day: "2026-10-19", hours: 1.5, commit: "a91f3c2e5" };
    await withTenant(db.app, T, (tx) => commitTimeHandler.handle({ tx, tenantId: T, event: { id: "ev-1", name: DELIVERY.commitTime, payload: c } }));
    const entries = () => db.q(sql`select e.hours, e.source, e.agent, w.status from time.entry e join time.week w on w.id = e.week_id where e.user_id = ${nimal.userId} and e.day = '2026-10-19' and e.deleted_at is null`);
    expect(await entries()).toEqual([]);
    const [s] = await db.q(sql`select id, title, acts_for from agents.suggestion where kind = 'time.commit-draft'`);
    expect(s).toMatchObject({ title: "Add 1.5 h on CON for 2026-10-19", acts_for: `user:${nimal.userId}` });
    await acceptSuggestion(contextForViewer(nimal, "chat"), { id: s.id as string });
    expect(await entries()).toEqual([{ hours: "1.50", source: "agent", agent: "Git", status: "draft" }].map((e) => ({ ...e, hours: expect.anything() })));
    const [{ id: entryId }] = await db.q(sql`select id from time.entry where user_id = ${nimal.userId} and day = '2026-10-19'`);
    // Review round 1: a closed change request on the entry no longer blocks the undo (it was a hard delete).
    await db.t.owner`insert into time.change_request (tenant_id, week_id, entry_id, user_id, kind, before, revision, reason, status)
      select tenant_id, week_id, id, user_id, 'delete', '{}'::jsonb, revision, 'Earlier ask', 'declined' from time.entry where id = ${entryId as string}`;
    await undoSuggestion(contextForViewer(nimal, "chat"), { id: s.id as string });
    expect(await entries()).toEqual([]);
    // The undo is the same soft delete as delete_time_entry (AC-16): the row stays, marked, and says who.
    expect(await db.q(sql`select deleted_at is not null as gone, deleted_by from time.entry where id = ${entryId as string}`)).toEqual([{ gone: true, deleted_by: expect.stringContaining(nimal.userId) }]);
    // 070 AC-6: the undo tells consumers the entry is gone.
    expect(await db.q(sql`select payload->>'revision' as revision from core.event where name = 'time.entry.deleted' and payload->>'entryId' = ${entryId as string}`)).toEqual([{ revision: "2" }]);
  });
});
