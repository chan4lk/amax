import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { registryFrom, runDueJobs } from "@amax/core/server";
import { createRegistry } from "@amax/mcp";
import { installedModules } from "./installed";
import { timeDb } from "./db";

describe.skipIf(!hasDb)("072 Time's consumers through the outbox, with a retried event (Postgres)", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  let registry: ReturnType<typeof createRegistry>;
  let tick: () => Promise<unknown>;
  beforeAll(async () => {
    db = await timeDb();
    const modules = await installedModules();
    registry = createRegistry(modules);
    tick = () => runDueJobs(db.app, registryFrom(modules));
  }, 120_000);
  afterAll(() => db?.t.drop());

  const call = async (key: string, tool: string, args: object) => registry.call(await db.as(key), tool, args, { source: "mcp" }) as Promise<Record<string, unknown>>;
  const billable = async () => Number((await db.q(sql`select coalesce(sum(b.hours), 0) as h from finance.billable b where b.period = '2026-10' and b.source = 'time'`))[0].h);
  const status = async (weekId: string) => (await db.q(sql`select status from reports.week_status where week_id = ${weekId}`))[0]?.status;

  it("AC3 AC10 submit and request events carry the route; a redelivered approval changes neither Finance nor Reports", async () => {
    await call("tharushi", "submit_week", { week: "2026-W42" });
    const [sub] = await db.q(sql`select payload from core.event where name = 'time.week.submitted' order by created_at desc limit 1`);
    const [{ lk }] = await db.q(sql`select legal_entity_id as lk from auth.user where email = 'tharushi@lumenlabs.test'`);
    expect(sub.payload).toMatchObject({ legalEntityId: lk, projectIds: expect.arrayContaining([expect.any(String)]) });
    await call("sahan", "approve_week", { person: "tharushi@lumenlabs.test", week: "2026-W42" });
    await tick(); await tick();
    const [ev] = await db.q(sql`select id, payload->>'weekId' as week_id from core.event where name = 'time.week.approved' order by created_at desc limit 1`);
    const [h, s] = [await billable(), await status(ev.week_id as string)];
    expect(s).toBe("approved");
    await db.t.owner`delete from core.processed_event where event_id = ${ev.id as string}`;
    await db.t.owner`update core.event set delivered_at = null where id = ${ev.id as string}`;
    await tick(); await tick();
    expect([await billable(), await status(ev.week_id as string)]).toEqual([h, s]);

    const [e] = await db.q(sql`select e.id, e.hours::float as hours from time.entry e join auth.user u on u.id = e.user_id where u.email = 'tharushi@lumenlabs.test' and e.day between '2026-10-12' and '2026-10-16' and e.hours >= 1 and e.deleted_at is null limit 1`);
    await call("tharushi", "request_time_change", { entryId: e.id, hours: Number(e.hours) - 0.5, reason: "Half an hour less" });
    const [req] = await db.q(sql`select payload from core.event where name = 'time.change.requested' order by created_at desc limit 1`);
    expect(req.payload).toMatchObject({ legalEntityId: lk, projectIds: expect.arrayContaining([expect.any(String)]) });
  }, 120_000);
});
