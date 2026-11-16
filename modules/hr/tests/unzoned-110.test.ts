import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { ctxFor } from "../server/context";
import { statusDatesJob } from "../server/jobs";
import { addPerson } from "../server/services";
import { getLegalEntity, unzonedEntities } from "../server/zones";
import { hrDatabase } from "./setup";

// 110 AC-3: an entity with no time zone is named where people look, and the hourly job's run fails naming it once the
// entities with a zone are moved, so it never reads as clean.
describe.skipIf(!hasDb)("110 entities with no time zone are shown (Postgres)", () => {
  let db: Awaited<ReturnType<typeof hrDatabase>>;
  beforeAll(async () => { db = await hrDatabase(); }, 60_000);
  afterAll(() => db?.t.drop());
  const zone = (set: boolean) => set
    ? db.t.owner`insert into workflows.entity_zone (legal_entity_id, tenant_id, timezone) select id, tenant_id, 'Australia/Sydney' from core.legal_entity where country = 'AU' on conflict (legal_entity_id) do nothing`
    : db.t.owner`delete from workflows.entity_zone where legal_entity_id in (select id from core.legal_entity where country = 'AU')`;

  it.each([
    ["with Australia's zone set: none", true, []],
    ["with it taken away: Australia", false, ["Lumen Labs Pty Ltd"]],
  ])("AC3 the entities with no zone, %s", async (_name, set, names) => {
    await zone(set);
    try {
      expect((await db.tx((tx) => unzonedEntities(tx))).map((e) => e.name)).toEqual(names);
      const [au] = await db.tx((tx) => tx.execute(sql`select id from core.legal_entity where country = 'AU'`));
      expect((await db.tx((tx) => getLegalEntity(tx, au.id as string)))?.timezone).toBe(set ? "Australia/Sydney" : null);
    } finally { await zone(true); }
  });

  it("AC3 the job moves Sri Lanka's joiner, then fails naming Australia", async () => {
    await zone(true);
    await addPerson(ctxFor(await db.as("sahan"), "mcp"), { name: "Starter 110", title: "Engineer", department: "Engineering", entity: "Sri Lanka", joinedOn: "2026-01-02" });
    await db.t.owner`update hr.person set status = 'joining' where name = 'Starter 110'`;
    await zone(false);
    try {
      await expect(statusDatesJob.run({ tenantId: db.maya.tenantId } as never)).rejects.toThrow(/Lumen Labs Pty Ltd has no time zone set/);
      const [p] = await db.tx((tx) => tx.execute(sql`select status from hr.person where name = 'Starter 110'`));
      expect(p.status).toBe("active");
    } finally { await zone(true); }
  });
});
