import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@amax/db";
import { hasDb } from "@amax/db/testdb";
import { createRegistry } from "@amax/mcp";
import { installedModules } from "./installed";
import { expectedBy, expectedIn } from "../server/expected";
import { T, timeDb } from "./db";

// 073 review rounds 1 and 2: who is expected to log reads allocations and people through their owners' contracts, and
// nobody allocated is lost: Liam (Sales, no time logged anywhere) is expected once he is allocated to Fleet Tracker,
// by Fleet Tracker's PM and by the daily reminder of his entity; before that, by neither.
describe.skipIf(!hasDb)("073 expected to log: allocated people come through the contracts (Postgres)", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  beforeAll(async () => { db = await timeDb(); }, 60_000);
  afterAll(() => db?.t.drop());
  const DAY = "2026-10-28";

  it.each([["before the allocation", false], ["after Liam is allocated to Fleet Tracker", true]] as const)("%s", async (_, allocated) => {
    const [liam] = await db.q(sql`select id, legal_entity_id from auth.user where email = 'liam@lumenlabs.test'`);
    expect(await db.q(sql`select 1 from time.entry where user_id = ${liam.id as string}`)).toEqual([]);
    if (allocated) {
      const registry = createRegistry(await installedModules());
      await registry.call(await db.as("sahan"), "allocate", { person: "Liam Murphy", projectKey: "FLT", month: "2026-10", percent: 20 }, { source: "mcp" });
    }
    const byPm = await withTenant(db.app, T, async (tx) => expectedBy(tx, await db.as("nimal"), DAY));
    const byDaily = await withTenant(db.app, T, (tx) => expectedIn(tx, T, liam.legal_entity_id as string, DAY));
    expect([byPm.includes(liam.id as string), byDaily.includes(liam.id as string)]).toEqual([allocated, allocated]);
  }, 60_000);
});
