import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { getPerson } from "@amax/hr/contracts";
import { contextFor } from "@amax/core/server";
import { ctxFor } from "../server/context";
import { allocate } from "../server/services";
import { stillOver } from "../server/stale";
import { allocationsDatabase, T } from "./setup";

describe.skipIf(!hasDb)("stale suggestions (Postgres)", () => {
  let db: Awaited<ReturnType<typeof allocationsDatabase>>;
  beforeAll(async () => { db = await allocationsDatabase(); }, 60_000);
  afterAll(() => db?.t.drop());

  it("AC22 a suggestion is dropped once the person is no longer over 100% that month", async () => {
    const pm = await db.as("maya", "PM");
    const kasun = await db.tx((tx) => getPerson(tx, contextFor.job(T, "allocations.test"), "LL-0417"));
    const row = { id: "s1", proposed: { personId: kasun!.id, month: "2026-12-01" } };
    await allocate(ctxFor(pm), { person: "LL-0417", projectKey: "CON", month: "2026-12", percent: 90 });
    expect([...(await stillOver(pm, [row]))]).toEqual(["s1"]);
    await allocate(ctxFor(pm), { person: "LL-0417", projectKey: "CON", month: "2026-12", percent: 0 });
    expect([...(await stillOver(pm, [row]))]).toEqual([]);
  });
});
