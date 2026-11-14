import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@amax/db";
import { hasDb } from "@amax/db/testdb";
import { contextFor, type ServiceContext } from "@amax/core/server";
import { ctxFor } from "../server/context";
import { COMMIT_CLAIMS_JOB, releaseCommitClaims } from "../server/claims";
import { draftCommitTime } from "../server/commit-time";
import { SpecRecordInput } from "../server/push";
import { draftSyncTime } from "../server/sync-time";
import { at, commit, fakeRepo, sha, syncTimeDb, T } from "./sync-time-db";

const CI = (onBehalfOf: string): ServiceContext => ({ tenantId: T, actor: { id: "sp:ci", kind: "service" }, onBehalfOf, source: "api" });
const N = "nimal@lumenlabs.test";

// 104 review round 3: one estimate per push, a day drafts only what isn't drafted yet; a dismissed untrusted draft's
// commits go back to the person's own path; one key per commit.
describe.skipIf(!hasDb)("104 review round 3: claims, releases and one estimate", () => {
  let db: Awaited<ReturnType<typeof syncTimeDb>>;
  let proposalId: string;
  const sync = (ctx: ServiceContext, commits: ReturnType<typeof commit>[]) =>
    withTenant(db.app, T, (tx) => draftSyncTime(tx, ctx, { id: "", key: "FLT" }, [{ proposalId, proposalKey: "FLT-101", commits }], { source: "main@abc1234", now: new Date("2026-11-20T12:00:00Z") }));
  const hours = async (day: string) => Number((await db.q(sql`select coalesce(sum(hours), 0) as h from delivery.commit_day_draft where day = ${day}`))[0].h);
  beforeAll(async () => {
    db = await syncTimeDb();
    await db.push(fakeRepo([]));
    await db.consent("2026-11-01T00:00:00Z");
    proposalId = (await db.q(sql`select id from delivery.proposal where key = 'FLT-101'`))[0].id as string;
  }, 120_000);
  afterAll(() => db?.t.drop());

  it.each([
    ["all at once", [[1, 2, 3]]],
    ["one commit at a time", [[1], [1, 2], [1, 2, 3]]],
    ["the last commit first", [[3], [1, 2, 3]]],
  ])("review-3 B4 the day's total is the same however the commits arrive: %s", async (_, pushes) => {
    await db.t.owner`delete from delivery.commit_day_draft`;
    await db.t.owner`delete from delivery.commit_draft`;
    const all = [commit(1, N, at("09:00", "2026-11-12")), commit(2, N, at("09:40", "2026-11-12")), commit(3, N, at("10:15", "2026-11-12"))];
    for (const p of pushes) await sync(ctxFor(db.nimal), p.map((i) => all[i - 1]));
    expect(await hours("2026-11-12")).toBe(1.75);
  });

  it("review-3 B1 a dismissed CI draft is released: the person's own sync drafts it, CI never again", async () => {
    await db.t.owner`delete from delivery.commit_day_draft`;
    await db.t.owner`delete from delivery.commit_draft`;
    const c = [commit(11, N, at("09:00", "2026-11-13"))];
    expect((await sync(CI(`user:${db.ayesha.userId}`), c)).drafted).toBe(1);
    await releaseCommitClaims(contextFor.job(T, COMMIT_CLAIMS_JOB), { userId: db.nimal.userId, commitIds: [sha(11)] });
    expect((await sync(CI(`user:${db.ayesha.userId}`), c)).drafted).toBe(0);
    const own = await sync(ctxFor(db.nimal), c);
    expect([own.drafted, await hours("2026-11-13")]).toEqual([1, 1]);
    expect(await db.q(sql`select released_at from delivery.commit_draft where commit_id = ${sha(11)}`)).toEqual([{ released_at: null }]);
  });

  it.each([
    ["another job", () => contextFor.job(T, "delivery.ingest")],
    ["a person", () => ctxFor(db.nimal)],
  ])("review-3 only Time's job may release claims: not %s", async (_, ctx) => {
    await expect(releaseCommitClaims(ctx(), { userId: db.nimal.userId, commitIds: [sha(11)] })).rejects.toThrow();
  });

  it("review-3 B1 the webhook takes back a released claim too, under one lowercase key", async () => {
    await db.t.owner`delete from delivery.commit_draft`;
    await sync(CI(`user:${db.ayesha.userId}`), [commit(21, N, at("09:00", "2026-11-14"))]);
    await releaseCommitClaims(contextFor.job(T, COMMIT_CLAIMS_JOB), { userId: db.nimal.userId, commitIds: [sha(21)] });
    const hook = (id: string) => draftCommitTime(contextFor.job(T, "delivery.ingest", `user:${db.nimal.userId}`), { userId: db.nimal.userId, key: "FLT-101", at: at("09:00", "2026-11-14"), hours: 1, commit: id });
    expect(await hook(sha(21).toUpperCase())).toMatchObject({ drafted: true });
    expect(await hook(sha(21))).toMatchObject({ drafted: false, repeated: true });
  });

  it.each([
    ["a full lowercase sha", sha(31), true],
    ["a short sha", sha(31).slice(0, 12), false],
    ["an uppercase sha", sha(31).toUpperCase(), false],
  ])("review-3 the push takes only one key per commit: %s", (_, id, ok) => {
    const r = fakeRepo([{ id, email: N, at: at("09:00") }])[0];
    expect(SpecRecordInput.safeParse(r).success).toBe(ok);
  });

  it("review-3 a commit repeated in one payload counts once", async () => {
    await db.t.owner`delete from delivery.commit_day_draft`;
    await db.t.owner`delete from delivery.commit_draft`;
    const c = commit(41, N, at("09:00", "2026-11-15"));
    expect(await sync(ctxFor(db.nimal), [c, c, { ...c }])).toMatchObject({ drafted: 1 });
    expect(await db.q(sql`select commits, commit_ids from delivery.commit_day_draft`)).toEqual([{ commits: 1, commit_ids: [sha(41)] }]);
  });

  it("review-3 the webhook's day-only form keeps the consent period too", async () => {
    const day = (d: string, id: string) => draftCommitTime(contextFor.job(T, "delivery.ingest", `user:${db.nimal.userId}`), { userId: db.nimal.userId, key: "FLT-101", day: d, hours: 1, commit: id });
    expect(await day("2026-10-31", sha(51))).toMatchObject({ drafted: false, repeated: false });
    expect(await day("2026-11-02", sha(52))).toMatchObject({ drafted: true });
  });
});
