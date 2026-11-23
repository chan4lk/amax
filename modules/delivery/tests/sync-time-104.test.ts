import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { at, commit, fakeRepo, sha, syncTimeDb } from "./sync-time-db";

// 104 AC-5 to AC-8: the push drafts hours from the change's commits for their authors, under consent, once per day,
// and never logs time itself.
describe.skipIf(!hasDb)("104 sync_specclaw drafts hours from commits", () => {
  let db: Awaited<ReturnType<typeof syncTimeDb>>;
  const today = new Date().toISOString().slice(0, 10);
  beforeAll(async () => { db = await syncTimeDb(); }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC-6 with commit time off for the author's entity the push drafts nothing and reads as today", async () => {
    const r = await db.push(fakeRepo([commit(1, "nimal@lumenlabs.test", at("09:00"))]));
    expect(r).toMatchObject({ outcome: "applied", created: 1, drafted: 0, unlinked: 0 });
    expect(await db.drafts()).toEqual([]);
  });

  it("AC-5, AC-7 hours go to the commit's author by verified git identity, once per day, for ended days after consent; unlinked and webhook-drafted commits are left out", async () => {
    await db.consent("2026-11-10T00:00:00Z");
    // The webhook's `Time:` line already drafted commit 9: it's in the day's ledger as the webhook's (review round 4).
    await db.q(sql`insert into delivery.commit_ledger (tenant_id, user_id, proposal_id, day, commits)
      select ${db.nimal.tenantId}, ${db.nimal.userId}, id, '2026-11-12', ${JSON.stringify({ [sha(9)]: { at: at("15:00"), by: "hook" } })}::jsonb from delivery.proposal where key = 'FLT-101'`);
    const commits = [
      commit(1, "nimal@lumenlabs.test", at("09:00")), commit(2, "nimal@lumenlabs.test", at("09:40")), commit(3, "nimal@lumenlabs.test", at("10:15")),
      commit(4, "nimal@lumenlabs.test", at("10:00", "2026-11-09")),
      commit(5, "stranger@example.test", at("11:00")),
      commit(6, "nimal@lumenlabs.test", `${today}T03:00:00Z`),
      commit(9, "nimal@lumenlabs.test", at("15:00")),
    ];
    expect(await db.push(fakeRepo(commits))).toMatchObject({ drafted: 1, unlinked: 1, unverified: 0 });
    expect(await db.drafts()).toEqual([
      { userId: db.nimal.userId, projectId: expect.any(String), projectKey: "FLT", proposalKey: "FLT-101", day: "2026-11-12", hours: 1.75, commit: `FLT-101/2026-11-12/${sha(1)}`, commits: 3, source: "repo", draftId: expect.any(String), trusted: true },
    ]);
    expect(await db.push(fakeRepo(commits))).toMatchObject({ outcome: "unchanged", drafted: 0 });
    expect(await db.drafts()).toHaveLength(1);
  });

  it("AC-8 the sync's own writes are the draft and its audit line; no time entry, week or approval", async () => {
    const actions = (await db.q(sql`select distinct action from core.audit_event where action like 'delivery.%' order by action`)).map((a) => a.action);
    expect(actions).toEqual(["delivery.commit_time.draft", "delivery.project.repo", "delivery.proposal.sync", "delivery.sync.push"]);
    expect(await db.q(sql`select after from core.audit_event where action = 'delivery.commit_time.draft'`)).toEqual([
      { after: { proposalId: expect.any(String), userId: db.nimal.userId, day: "2026-11-12", hours: 1.75, commits: 3, source: expect.stringMatching(/^main@a1b2c/), commitIds: [sha(1), sha(2), sha(3)] } }]);
    expect(await db.q(sql`select 1 from time.entry`)).toEqual([]);
  });
});
