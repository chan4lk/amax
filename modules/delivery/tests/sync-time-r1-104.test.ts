import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@amax/db";
import { hasDb } from "@amax/db/testdb";
import { contextFor, type ServiceContext } from "@amax/core/server";
import { ctxFor } from "../server/context";
import { draftCommitTime } from "../server/commit-time";
import { draftSyncTime } from "../server/sync-time";
import { at, commit, fakeRepo, sha, syncTimeDb, T } from "./sync-time-db";

// 104 review round 1: who a push may draft for, the webhook after the sync, an archived change's last days, the read
// each draft keeps, and the day in the author's own zone.
describe.skipIf(!hasDb)("104 review round 1: drafting from the sync", () => {
  let db: Awaited<ReturnType<typeof syncTimeDb>>;
  let proposalId: string;
  const draft = (ctx: ServiceContext, commits: ReturnType<typeof commit>[], key = "FLT-101") =>
    withTenant(db.app, T, (tx) => draftSyncTime(tx, ctx, { id: "", key: "FLT" }, [{ proposalId, proposalKey: key, commits }], { source: "main@abc1234", now: new Date("2026-11-20T12:00:00Z") }));
  beforeAll(async () => {
    db = await syncTimeDb();
    await db.push(fakeRepo([]));
    await db.consent("2026-11-01T00:00:00Z");
    proposalId = (await db.q(sql`select id from delivery.proposal where key = 'FLT-101'`))[0].id as string;
  }, 120_000);
  afterAll(() => db?.t.drop());

  it.each([
    ["a person's own push drafts only their own commits", () => ctxFor(db.nimal), { drafted: 1, unverified: 1 }, ["nimal"]],
    ["another person's push drafts nothing for either", () => ctxFor(db.ayesha, "mcp"), { drafted: 1, unverified: 1 }, ["ayesha"]],
    ["a service credential (CI) drafts for every author", () => ({ tenantId: T, actor: { id: "sp:ci", kind: "service" as const }, onBehalfOf: `user:${db.nimal.userId}`, source: "api" as const }), { drafted: 2, unverified: 0 }, ["nimal", "ayesha"]],
    ["a job drafts for nobody", () => contextFor.job(T, "test"), { drafted: 0, unverified: 2 }, []],
  ])("review-1 B6 %s", async (_, ctx, counts, who) => {
    await db.t.owner`delete from delivery.commit_day_draft`;
    await db.t.owner`delete from delivery.commit_ledger`;
    const r = await draft(ctx(), [commit(11, "nimal@lumenlabs.test", at("09:00", "2026-11-05")), commit(12, "ayesha@lumenlabs.test", at("09:00", "2026-11-05"))]);
    expect(r).toMatchObject(counts);
    const users = { nimal: db.nimal.userId, ayesha: db.ayesha.userId };
    expect((await db.q(sql`select user_id from delivery.commit_day_draft order by user_id`)).map((x) => x.user_id).sort()).toEqual(who.map((k) => users[k as keyof typeof users]).sort());
  });

  it("review-1 B5 a draft keeps its read, its commits and its pusher; B1 the webhook can't draft them again", async () => {
    await db.t.owner`delete from delivery.commit_day_draft`;
    await draft(ctxFor(db.nimal), [commit(21, "nimal@lumenlabs.test", at("09:00", "2026-11-06")), commit(22, "nimal@lumenlabs.test", at("09:20", "2026-11-06"))]);
    expect(await db.q(sql`select source, commit_ids, drafted_by from delivery.commit_day_draft`)).toEqual([{ source: "main@abc1234", commit_ids: [sha(21), sha(22)], drafted_by: expect.stringMatching(/nimal|user:|agent:/) }]);
    const job = contextFor.job(T, "delivery.ingest", `user:${db.nimal.userId}`);
    const again = (id: string, day: string) => draftCommitTime(job, { userId: db.nimal.userId, key: "FLT-101", day, hours: 1, commit: id });
    expect(await again(sha(21), "2026-11-06")).toMatchObject({ drafted: false, repeated: true });
    // Review round 2 (drafts are untrusted): commits are claimed, not days, so another commit that day still drafts.
    expect(await again(sha(23), "2026-11-06")).toMatchObject({ drafted: true });
    expect(await again(sha(24), "2026-11-07")).toMatchObject({ drafted: true });
  });

  it("review-1 B4 the day is the author's own: 20:00 UTC on Nov 8 is Nov 9 in Colombo", async () => {
    await db.t.owner`delete from delivery.commit_day_draft`;
    await draft(ctxFor(db.nimal), [commit(31, "nimal@lumenlabs.test", at("20:00", "2026-11-08"))]);
    expect((await db.q(sql`select to_char(day, 'YYYY-MM-DD') as day from delivery.commit_day_draft`)).map((x) => x.day)).toEqual(["2026-11-09"]);
  });

  it("review-1 B1 an archived change the push refuses as Released still drafts its last days", async () => {
    await db.t.owner`delete from delivery.commit_day_draft`;
    const r = await db.push(fakeRepo([commit(41, "nimal@lumenlabs.test", at("09:00", "2026-11-11"))], "101-export", true));
    expect(r).toMatchObject({ skipped: ["FLT-101: released comes from Prod deployments"], drafted: 1 });
  });
});
