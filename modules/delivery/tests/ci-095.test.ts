import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import { ctxFor } from "../server/context";
import { knownTime } from "../server/repo-time";
import { syncProposal } from "../server/services";
import { proposalDb } from "./proposal-db";

// 095 AC-1: tool inputs carry plain datetimes (every module's tools are converted for chat by apps/web's registry-wide
// tool-schemas test, with the converter chat uses); the bound on future repo dates lives where they're written.
describe("095 AC-1 knownTime", () => {
  it.each([
    ["absent", undefined, null],
    ["null", null, null],
    ["in the past", "2026-10-01T00:00:00.000Z", "2026-10-01T00:00:00.000Z"],
    ["in the future", "2030-01-01T00:00:00.000Z", null],
  ])("a repo date %s is stored as %s", (_, t, want) => {
    expect(knownTime(t)).toBe(want);
  });
});

// Review round 1: the write itself bounds the dates, so sync_proposal (which doesn't go through desired()) keeps the
// stored ones when it sends dates in the future.
describe.skipIf(!hasDb)("095 AC-1 sync_proposal's write keeps stored dates over future ones", () => {
  let db: Awaited<ReturnType<typeof proposalDb>>;
  let maya: Viewer;
  let at = 0;
  const STORED = { created: "2026-10-01T00:00:00.000Z", done: "2026-10-03T09:00:00.000Z" };
  const sync = (createdAt: string, doneAt: string) => syncProposal(ctxFor(maya), {
    projectKey: "FLT", project: { name: "Fleet", client: "C" }, key: "FLT-951", title: "Dated", phase: "building", tasksDone: 1, tasksTotal: 1,
    source: "specclaw", sourceRef: "951-dated", releasedAt: null, meta: { source: "main@abc1234" }, createdAt,
    tasks: [{ ref: "T1", title: "first", done: true, doneAt }], committedAt: new Date(Date.parse("2026-10-08T09:00:00Z") + ++at * 60_000).toISOString(),
  });
  const stored = async () => {
    const [r] = await db.q(sql`select p.created_at, t.done_at from delivery.proposal p join delivery.task t on t.proposal_id = p.id where p.key = 'FLT-951'`);
    return { created: new Date(r.created_at as string).toISOString(), done: new Date(r.done_at as string).toISOString() };
  };

  beforeAll(async () => {
    db = await proposalDb();
    maya = await db.as("maya");
    await sync(STORED.created, STORED.done);
  }, 120_000);
  afterAll(() => db?.t.drop());

  const future = "2030-01-01T00:00:00.000Z";
  it.each([
    ["a future created date", future, STORED.done, STORED],
    ["a future task date", STORED.created, future, STORED],
    ["both in the future", future, future, STORED],
    ["past dates (control): the repo's newer word is taken", "2026-09-20T00:00:00.000Z", "2026-10-04T00:00:00.000Z", { created: "2026-09-20T00:00:00.000Z", done: "2026-10-04T00:00:00.000Z" }],
  ])("%s", async (_, createdAt, doneAt, want) => {
    await sync(createdAt, doneAt);
    expect(await stored()).toEqual(want);
  });
});
