import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { ctxFor } from "../server/context";
import { allocateOnly } from "../server/only";
import { allocationsDatabase } from "./setup";

describe.skipIf(!hasDb)("allocate_only (Postgres)", () => {
  let db: Awaited<ReturnType<typeof allocationsDatabase>>;
  beforeAll(async () => { db = await allocationsDatabase(); }, 60_000);
  afterAll(() => db?.t.drop());

  it("AC19 puts a person on one project at 100% and clears their others in one call", async () => {
    const pm = await db.as("maya");
    await allocateOnly(ctxFor(pm), { person: "LL-0417", projectKey: "HRI", month: "2026-12" });
    const rows = await db.tx((tx) => tx.execute(sql`select p.key, a.percent from allocations.allocation a join delivery.project p on p.id = a.project_id join hr.person h on h.id = a.person_id where h.employee_no = 'LL-0417' and a.month = '2026-12-01'`));
    expect(rows.map((r) => [r.key, r.percent])).toEqual([["HRI", 100]]);
  });
});
