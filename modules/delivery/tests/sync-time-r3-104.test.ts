import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@amax/db";
import { hasDb } from "@amax/db/testdb";
import { contextFor, type ServiceContext } from "@amax/core/server";
import { ctxFor } from "../server/context";
import { COMMIT_CLAIMS_JOB, dismissRepoDraft } from "../server/ledger";
import { draftCommitTime } from "../server/commit-time";
import { SpecRecordInput } from "../server/push";
import { draftSyncTime } from "../server/sync-time";
import { at, commit, fakeRepo, sha, syncTimeDb, T } from "./sync-time-db";

const CI = (onBehalfOf: string): ServiceContext => ({ tenantId: T, actor: { id: "sp:ci", kind: "service" }, onBehalfOf, source: "api" });
const N = "nimal@lumenlabs.test";

// 104 review rounds 3 and 4 (the day ledger): a day's total is its estimate over the whole set, whatever order the
// commits arrive in; a dismissed CI draft's commits leave the estimate for good, unless the person's own sync brings
// them back; one key per commit.
describe.skipIf(!hasDb)("104 review rounds 3 and 4: the day ledger", () => {
  let db: Awaited<ReturnType<typeof syncTimeDb>>;
  let proposalId: string;
  const sync = (ctx: ServiceContext, commits: ReturnType<typeof commit>[]) =>
    withTenant(db.app, T, (tx) => draftSyncTime(tx, ctx, { id: "", key: "FLT" }, [{ proposalId, proposalKey: "FLT-101", commits }], { source: "main@abc1234", now: new Date("2026-11-20T12:00:00Z") }));
  const hours = async (day: string) => Number((await db.q(sql`select coalesce(sum(hours), 0) as h from delivery.commit_day_draft where day = ${day} and dismissed_at is null`))[0].h);
  const fresh = async () => { await db.t.owner`delete from delivery.commit_day_draft`; await db.t.owner`delete from delivery.commit_ledger`; await db.t.owner`delete from delivery.commit_draft`; };
  beforeAll(async () => {
    db = await syncTimeDb();
    await db.push(fakeRepo([]));
    await db.consent("2026-11-01T00:00:00Z");
    proposalId = (await db.q(sql`select id from delivery.proposal where key = 'FLT-101'`))[0].id as string;
  }, 120_000);
  afterAll(() => db?.t.drop());

  // 1 at 09:00, 2 at 09:40, 3 at 10:15 are one session (08:30 to 10:15, 1.75 h); 4 at 11:00 extends it to 2.5 h.
  it.each([
    ["all at once", [[1, 2, 3, 4]]],
    ["one commit at a time", [[1], [1, 2], [1, 2, 3], [1, 2, 3, 4]]],
    ["the last commit first", [[4], [1, 2, 3, 4]]],
    ["a commit inside the session after it (a zero-hour step)", [[1, 3], [2], [4]]],
    ["the same push twice in between", [[1, 3], [1, 3], [2, 4], [2, 4]]],
  ])("review-4 B1 the day's total is its estimate whatever the order: %s", async (_, pushes) => {
    await fresh();
    const all = [commit(1, N, at("09:00", "2026-11-12")), commit(2, N, at("09:40", "2026-11-12")), commit(3, N, at("10:15", "2026-11-12")), commit(4, N, at("11:00", "2026-11-12"))];
    for (const p of pushes) await sync(ctxFor(db.nimal), p.map((i) => all[i - 1]));
    expect(await hours("2026-11-12")).toBe(2.5);
  });

  it("review-4 B1 a dismissed CI draft's commits leave the estimate: CI can't push them again or carry their time; the person's own sync brings them back", async () => {
    await fresh();
    const ci = await sync(CI(`user:${db.ayesha.userId}`), [commit(11, N, at("09:00", "2026-11-13"))]);
    const draftId = (ci.events[0].payload as { draftId: string }).draftId;
    await dismissRepoDraft(contextFor.job(T, COMMIT_CLAIMS_JOB), { draftId });
    expect((await sync(CI(`user:${db.ayesha.userId}`), [commit(11, N, at("09:00", "2026-11-13"))])).drafted).toBe(0);
    expect((await sync(CI(`user:${db.ayesha.userId}`), [commit(12, N, at("15:00", "2026-11-13"))])).events.map((e) => (e.payload as { hours: number }).hours)).toEqual([0.5]);
    expect((await sync(ctxFor(db.nimal), [commit(11, N, at("09:00", "2026-11-13"))])).events.map((e) => (e.payload as { hours: number }).hours)).toEqual([0.5]);
    expect(await hours("2026-11-13")).toBe(1);
  });

  it.each([
    ["another job", () => contextFor.job(T, "delivery.ingest")],
    ["a person", () => ctxFor(db.nimal)],
  ])("review-3 only Time's job may dismiss a draft: not %s", async (_, ctx) => {
    await expect(dismissRepoDraft(ctx(), { draftId: "00000000-0000-4000-8000-000000000000" })).rejects.toThrow();
  });

  it("review-3 the webhook and the sync share one lowercase key per commit, in either order", async () => {
    await fresh();
    const hook = (id: string, day: string) => draftCommitTime(contextFor.job(T, "delivery.ingest", `user:${db.nimal.userId}`), { userId: db.nimal.userId, key: "FLT-101", at: at("09:00", day), hours: 1, commit: id });
    expect(await hook(sha(21).toUpperCase(), "2026-11-14")).toMatchObject({ drafted: true });
    expect((await sync(ctxFor(db.nimal), [commit(21, N, at("09:00", "2026-11-14"))])).drafted).toBe(0);
    expect((await sync(ctxFor(db.nimal), [commit(22, N, at("09:00", "2026-11-15"))])).drafted).toBe(1);
    expect(await hook(sha(22), "2026-11-15")).toMatchObject({ drafted: false, repeated: true });
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
    await fresh();
    const c = commit(41, N, at("09:00", "2026-11-16"));
    expect(await sync(ctxFor(db.nimal), [c, c, { ...c }])).toMatchObject({ drafted: 1 });
    expect(await db.q(sql`select commits, commit_ids, hours::float as hours from delivery.commit_day_draft`)).toEqual([{ commits: 1, commit_ids: [sha(41)], hours: 0.5 }]);
  });

  it("review-3 the webhook's day-only form keeps the consent period too", async () => {
    const day = (d: string, id: string) => draftCommitTime(contextFor.job(T, "delivery.ingest", `user:${db.nimal.userId}`), { userId: db.nimal.userId, key: "FLT-101", day: d, hours: 1, commit: id });
    expect(await day("2026-10-31", sha(51))).toMatchObject({ drafted: false, repeated: false });
    expect(await day("2026-11-02", sha(52))).toMatchObject({ drafted: true });
  });
});
