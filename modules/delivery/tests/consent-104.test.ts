import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@amax/db";
import { hasDb } from "@amax/db/testdb";
import { contextFor } from "@amax/core/server";
import { contextForViewer } from "@amax/auth";
import { lumen } from "@amax/testing";
import { commitTimeSince, draftCommitTime, setCommitTimeLogging } from "../server/commit-time";
import { draftSyncTime } from "../server/sync-time";
import { ctxFor } from "../server/context";
import { at, commit, fakeRepo, sha, syncTimeDb, T } from "./sync-time-db";

const LK = lumen.entities[0].id;

// 104 review round 2: the one consent rule, through the real switch. Each off→on starts a new period, on→on keeps it,
// and both the webhook and the sync draft only from the period's start.
describe.skipIf(!hasDb)("104 review round 2: the consent period", () => {
  let db: Awaited<ReturnType<typeof syncTimeDb>>;
  let admin: ReturnType<typeof contextForViewer>;
  const since = async () => (await withTenant(db.app, T, (tx) => commitTimeSince(tx, [db.nimal.userId]))).get(db.nimal.userId);
  const set = (enabled: boolean) => setCommitTimeLogging(admin, { legalEntityId: LK, enabled, peopleNotified: enabled });
  const backdate = (to: string) => db.t.owner`update delivery.commit_time set notified_at = ${to} where legal_entity_id = ${LK}`;
  beforeAll(async () => {
    db = await syncTimeDb();
    await db.push(fakeRepo([]));
    const [{ id }] = await db.q(sql`select id from auth.user where email = 'maya@lumenlabs.test'`);
    admin = contextForViewer((await withTenant(db.app, T, async (tx) => (await import("@amax/auth")).viewerForUser(tx, T, id as string)))!, "chat");
  }, 120_000);
  afterAll(() => db?.t.drop());

  it.each([
    ["off → on starts a period now", ["on"], "new"],
    ["on → on keeps the period", ["on", "on"], "kept"],
    ["on → off → on starts a new one", ["on", "off", "on"], "new"],
    ["on → off leaves it off", ["on", "off"], "off"],
  ])("review-2 %s", async (_, steps, want) => {
    await db.t.owner`delete from delivery.commit_time`;
    for (const [i, s] of steps.entries()) {
      await set(s === "on");
      // The first period is moved into the past, so a later step that keeps it is told apart from one that restarts it.
      if (i === 0 && s === "on" && steps.length > 1) await backdate("2026-10-01T00:00:00Z");
    }
    const got = await since();
    if (want === "off") expect(got).toBeUndefined();
    else if (want === "kept") expect(got).toBe("2026-10-01T00:00:00.000Z");
    else expect(Date.now() - Date.parse(got!)).toBeLessThan(60_000);
  });

  it("review-2 commits from before the period draft nothing, by the webhook or by the sync", async () => {
    await db.t.owner`delete from delivery.commit_time`;
    await set(true);
    await backdate("2026-11-05T00:00:00Z");
    const hook = (id: string, when: string) => draftCommitTime(contextFor.job(T, "delivery.ingest", `user:${db.nimal.userId}`), { userId: db.nimal.userId, key: "FLT-101", at: when, hours: 1, commit: id });
    expect(await hook(sha(51), at("09:00", "2026-11-04"))).toMatchObject({ drafted: false });
    expect(await hook(sha(52), at("09:00", "2026-11-06"))).toMatchObject({ drafted: true });
    const [{ id: proposalId }] = await db.q(sql`select id from delivery.proposal where key = 'FLT-101'`);
    const sync = await withTenant(db.app, T, (tx) => draftSyncTime(tx, ctxFor(db.nimal), { id: "", key: "FLT" }, [{ proposalId: proposalId as string, proposalKey: "FLT-101",
      commits: [commit(53, "nimal@lumenlabs.test", at("09:00", "2026-11-03")), commit(54, "nimal@lumenlabs.test", at("09:00", "2026-11-07"))] }], { source: "main@abc1234", now: new Date("2026-11-20T12:00:00Z") }));
    expect(sync.drafted).toBe(1);
    expect((await db.q(sql`select to_char(day, 'YYYY-MM-DD') as day from delivery.commit_day_draft`)).map((r) => r.day)).toEqual(["2026-11-07"]);
  });

  it("review-2 the webhook's day is the author's own: 20:00 UTC on Nov 8 is Nov 9 in Colombo", async () => {
    const r = await draftCommitTime(contextFor.job(T, "delivery.ingest", `user:${db.nimal.userId}`), { userId: db.nimal.userId, key: "FLT-101", at: at("20:00", "2026-11-08"), hours: 1, commit: sha(61) });
    expect(r).toMatchObject({ drafted: true });
    const [e] = await db.q(sql`select payload->>'day' as day from core.event where name = 'delivery.commit.time' and payload->>'commit' = ${sha(61)}`);
    expect(e.day).toBe("2026-11-09");
  });
});
