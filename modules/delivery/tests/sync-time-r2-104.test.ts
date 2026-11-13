import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@amax/db";
import { hasDb } from "@amax/db/testdb";
import { contextFor, type ServiceContext } from "@amax/core/server";
import { ctxFor } from "../server/context";
import { draftCommitTime } from "../server/commit-time";
import { draftSyncTime } from "../server/sync-time";
import { at, commit, fakeRepo, sha, syncTimeDb, T } from "./sync-time-db";

const CI = (onBehalfOf: string): ServiceContext => ({ tenantId: T, actor: { id: "sp:ci", kind: "service" }, onBehalfOf, source: "api" });

// 104 review round 2 (product owner, 2026-11-13: drafts are untrusted): each commit is counted once, claimed before it's
// counted, whichever path gets it first; nothing claims a whole day; a draft says who pushed it.
describe.skipIf(!hasDb)("104 review round 2: commits, not days, are claimed", () => {
  let db: Awaited<ReturnType<typeof syncTimeDb>>;
  let proposalId: string;
  const sync = (ctx: ServiceContext, commits: ReturnType<typeof commit>[]) =>
    withTenant(db.app, T, (tx) => draftSyncTime(tx, ctx, { id: "", key: "FLT" }, [{ proposalId, proposalKey: "FLT-101", commits }], { source: "main@abc1234", now: new Date("2026-11-20T12:00:00Z") }));
  const hook = (id: string, when: string) =>
    draftCommitTime(contextFor.job(T, "delivery.ingest", `user:${db.nimal.userId}`), { userId: db.nimal.userId, key: "FLT-101", at: when, hours: 1, commit: id });
  beforeAll(async () => {
    db = await syncTimeDb();
    await db.push(fakeRepo([]));
    await db.consent("2026-11-01T00:00:00Z");
    proposalId = (await db.q(sql`select id from delivery.proposal where key = 'FLT-101'`))[0].id as string;
  }, 120_000);
  afterAll(() => db?.t.drop());

  it("review-2 B6 a draft from someone else's push never blocks the person's own commits that day", async () => {
    const ci = await sync(CI(`user:${db.ayesha.userId}`), [commit(71, "nimal@lumenlabs.test", at("09:00", "2026-11-10"))]);
    const own = await sync(ctxFor(db.nimal), [commit(72, "nimal@lumenlabs.test", at("15:00", "2026-11-10"))]);
    expect([ci.drafted, own.drafted]).toEqual([1, 1]);
    expect(await sync(ctxFor(db.nimal), [commit(72, "nimal@lumenlabs.test", at("15:00", "2026-11-10"))])).toMatchObject({ drafted: 0 });
    expect((await db.q(sql`select drafted_by, commit_ids from delivery.commit_day_draft where day = '2026-11-10' order by drafted_at`)).map((r) => [r.drafted_by, r.commit_ids])).toEqual([
      [`sp:ci for user:${db.ayesha.userId}`, [sha(71)]], [expect.stringContaining(db.nimal.userId), [sha(72)]]]);
    // Each draft names its own first commit in full, so two drafts on one day stay two suggestions, and says who pushed it.
    const sent = [...ci.events, ...own.events].map((e) => e.payload as { commit: string; pushedBy: string }).map((p) => [p.commit, p.pushedBy]);
    expect(sent).toEqual([[`FLT-101/2026-11-10/${sha(71)}`, `sp:ci for user:${db.ayesha.userId}`], [`FLT-101/2026-11-10/${sha(72)}`, expect.stringContaining(db.nimal.userId)]]);
  });

  it("review-2 B7 the sync and the webhook racing over the same commit count it once, five times over", async () => {
    for (let i = 0; i < 5; i++) {
      const id = sha(80 + i), when = at(`1${i}:00`, "2026-11-11");
      await Promise.all([sync(CI(`user:${db.nimal.userId}`), [{ id, email: "nimal@lumenlabs.test", at: when }]), hook(id, when)]);
      const bySync = (await db.q(sql`select 1 from delivery.commit_day_draft where commit_ids ? ${id}`)).length;
      const byHook = (await db.q(sql`select 1 from core.event where name = 'delivery.commit.time' and payload->>'commit' = ${id}`)).length;
      expect([id, bySync + byHook]).toEqual([id, 1]);
    }
  });

  it("review-2 commits of today aren't claimed, so a later sync still drafts them", async () => {
    const today = commit(90, "nimal@lumenlabs.test", at("09:00", "2026-11-20"));
    expect(await sync(ctxFor(db.nimal), [today])).toMatchObject({ drafted: 0 });
    expect(await db.q(sql`select 1 from delivery.commit_draft where commit_id = ${today.id}`)).toEqual([]);
  });
});
