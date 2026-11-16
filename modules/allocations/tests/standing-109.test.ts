import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { contextFor } from "@amax/core/server";
import { ctxFor } from "../server/context";
import { allocate } from "../server/services";
import { extendStanding, onLeaver } from "../server/standing-jobs";
import { EVENTS } from "../contracts";
import { allocationsDatabase, T } from "./setup";

describe.skipIf(!hasDb)("109 standing allocations end cleanly and keep hand removals (Postgres)", () => {
  let db: Awaited<ReturnType<typeof allocationsDatabase>>;
  beforeAll(async () => {
    db = await allocationsDatabase();
    await db.t.owner`insert into delivery.project (tenant_id, key, name, client, billing, manager_user_id) select ${T}, 'GONE', 'Gone tools', 'Internal', 'internal', id from auth.user where email = 'maya@lumenlabs.test'`;
  }, 60_000);
  afterAll(() => db?.t.drop());
  const months = async (who: string, key: string) => Object.fromEntries((await db.tx((tx) => tx.execute(sql`select to_char(a.month, 'YYYY-MM') as m, a.percent from allocations.allocation a
    join hr.person p on p.id = a.person_id join delivery.project j on j.id = a.project_id where p.name = ${who} and j.key = ${key}`))).map((r) => [r.m as string, Number(r.percent)]));
  const set = async (person: string, key: string, month: string, percent: number, standing?: boolean) => allocate(ctxFor(await db.as("maya"), "mcp"), { person, projectKey: key, month, percent, standing });

  it.each([
    ["someone who left", "Kasun Dias", "CON", async () => { await db.t.owner`update hr.person set status = 'left' where name = 'Kasun Dias'`; }],
    ["a project that closed", "Nimal Silva", "GONE", async () => { await db.t.owner`update delivery.project set status = 'closed' where key = 'GONE'`; }],
  ])("AC1 the job ends one for %s from next month, removing the months it wrote; a month set by hand stays", async (_name, who, key, stop) => {
    await set(who, key, "2027-01", 30, true);
    await set(who, key, "2027-09", 15);
    await stop();
    await extendStanding(contextFor.job(T, "allocations.standing-extend"), { today: "2027-02-05" });
    const m = await months(who, key);
    expect([m["2027-02"], m["2027-03"], m["2027-08"], m["2027-09"], m["2027-12"]]).toEqual([30, undefined, undefined, 15, undefined]);
  });

  // Review rounds 1 and 2: both ways a standing allocation ends without a hand keep what the end removed in the audit, and
  // send the hand end's event (no months, 0%, standing), through the real job and the real hr.person.left handler.
  it.each([
    ["the monthly job, for a closed project", "Ayesha Rahman", "SHUT", "allocations.standing.extend", async () => {
      await db.t.owner`update delivery.project set status = 'closed' where key = 'SHUT'`;
      await extendStanding(contextFor.job(T, "allocations.standing-extend"), { today: "2027-02-05" });
    }],
    ["the leaver handler, for someone who left", "Dinesh Wickrama", "CON", "allocations.standing.leaver", async (personId: string) => {
      await onLeaver.handle({ tenantId: T, event: { name: "hr.person.left", payload: { personId, userId: null, leftOn: "2027-02-05" } } } as never);
    }],
  ])("the end by %s is audited and sent like a hand end, in the name it follows from (110 AC4)", async (_name, who, key, action, end) => {
    if (key === "SHUT") await db.t.owner`insert into delivery.project (tenant_id, key, name, client, billing, manager_user_id) select ${T}, 'SHUT', 'Shut tools', 'Internal', 'internal', id from auth.user where email = 'maya@lumenlabs.test'`;
    await set(who, key, "2027-01", 20, true);
    const [p] = await db.tx((tx) => tx.execute(sql`select id from hr.person where name = ${who}`));
    const [{ updated_by: setBy }] = await db.tx((tx) => tx.execute(sql`select s.updated_by from allocations.standing s join delivery.project j on j.id = s.project_id
      where s.person_id = ${p.id as string} and j.key = ${key} and s.until_month is null`));
    await end(p.id as string);
    const [audit] = await db.tx((tx) => tx.execute(sql`select before from core.audit_event where action = ${action} order by seq desc limit 1`));
    const ended = (audit.before as { ended: { personId: string; rows: { month: string }[]; standing: unknown[] }[] }).ended.find((e) => e.personId === p.id)!;
    expect([ended.rows.map((r) => String(r.month).slice(0, 7)), ended.standing.length]).toEqual([expect.arrayContaining(["2027-03", "2027-12"]), 1]);
    const [event] = await db.tx((tx) => tx.execute(sql`select payload from core.event where name = ${EVENTS.allocationSet} and payload->>'personId' = ${p.id as string} order by created_at desc, id desc limit 1`));
    expect(event.payload).toMatchObject({ months: [], percent: 0, standing: true });
    // 110 AC-4: in the name of whoever set it (the job), or naming the leaver's record (the handler).
    expect((event.payload as { by: string }).by).toBe(action === "allocations.standing.extend" ? `allocations.standing for ${setBy}` : `hr leaver ${p.id as string}`);
  });

  it.each([
    ["a new percent from the same start", "2027-01", 40, { "2027-03": undefined, "2027-04": 40, "2027-11": undefined }],
    ["a later start", "2027-05", 25, { "2027-04": 30, "2027-05": 25, "2027-11": undefined }],
  ])("AC2 a re-set with %s keeps the months removed by hand", async (_name, from, percent, expected) => {
    const who = "Tharushi Wijesinghe";
    await db.t.owner`delete from allocations.standing where person_id = (select id from hr.person where name = ${who})`;
    await db.t.owner`delete from allocations.allocation where person_id = (select id from hr.person where name = ${who})`;
    await set(who, "CON", "2027-01", 30, true);
    for (const m of ["2027-03", "2027-11"]) await set(who, "CON", m, 0);
    await set(who, "CON", from, percent, true);
    const m = await months(who, "CON");
    for (const [month, value] of Object.entries(expected)) expect([month, m[month]]).toEqual([month, value]);
  });
});
