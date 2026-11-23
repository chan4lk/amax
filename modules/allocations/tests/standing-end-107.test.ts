import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { contextFor } from "@amax/core/server";
import { ctxFor } from "../server/context";
import { allocate } from "../server/services";
import { endStandingForLeaver, extendStanding } from "../server/standing-jobs";
import { teamFor } from "../server/team";
import { allocationsDatabase, T } from "./setup";

const job = (name: string) => contextFor.job(T, name);

describe.skipIf(!hasDb)("107 final pass: when a standing allocation stops (Postgres)", () => {
  let db: Awaited<ReturnType<typeof allocationsDatabase>>;
  beforeAll(async () => {
    db = await allocationsDatabase();
    await db.t.owner`insert into delivery.project (tenant_id, key, name, client, billing, manager_user_id) select ${T}, 'OLD', 'Old tools', 'Internal', 'internal', id from auth.user where email = 'maya@lumenlabs.test'`;
  }, 60_000);
  afterAll(() => db?.t.drop());
  const months = async (who: string, key: string) => Object.fromEntries((await db.tx((tx) => tx.execute(sql`select to_char(a.month, 'YYYY-MM') as m, a.percent from allocations.allocation a
    join hr.person p on p.id = a.person_id join delivery.project j on j.id = a.project_id where p.name = ${who} and j.key = ${key}`))).map((r) => [r.m as string, Number(r.percent)]));
  const open = async (who: string, key: string) => (await db.tx((tx) => tx.execute(sql`select 1 from allocations.standing s join hr.person p on p.id = s.person_id
    join delivery.project j on j.id = s.project_id where p.name = ${who} and j.key = ${key} and s.until_month is null`))).length > 0;

  it("B6 a leaver's standing allocations end the month after they leave; earlier months stay", async () => {
    const maya = ctxFor(await db.as("maya"), "mcp");
    await allocate(maya, { person: "Ayesha Rahman", projectKey: "CON", month: "2027-01", percent: 20, standing: true });
    const [p] = await db.tx((tx) => tx.execute(sql`select id from hr.person where name = 'Ayesha Rahman'`));
    await endStandingForLeaver(job("allocations.standing-leaver"), { personId: p.id as string, leftOn: "2027-03-15" });
    const m = await months("Ayesha Rahman", "CON");
    expect([m["2027-03"], m["2027-04"], await open("Ayesha Rahman", "CON")]).toEqual([20, undefined, false]);
  });

  it.each([
    ["someone who no longer works here", "Kasun Dias", "CON", async () => { await db.t.owner`update hr.person set status = 'left' where name = 'Kasun Dias'`; }, false],
    ["a project that is no longer active", "Nimal Silva", "OLD", async () => { await db.t.owner`update delivery.project set status = 'closed' where key = 'OLD'`; }, false],
    ["someone still here on an active project", "Tharushi Wijesinghe", "CON", async () => undefined, true],
  ])("B6 the monthly job, for %s", async (_name, who, key, make, stays) => {
    await allocate(ctxFor(await db.as("maya"), "mcp"), { person: who, projectKey: key, month: "2027-01", percent: 30, standing: true });
    await make();
    await extendStanding(job("allocations.standing-extend"), { today: "2027-02-05" });
    expect([await open(who, key), (await months(who, key))["2028-01"]]).toEqual(stays ? [true, 30] : [false, undefined]);
  });

  it("B3 a PM whose account is deactivated shows as such, not as no PM", async () => {
    await db.t.owner`update delivery.project set manager_user_id = (select id from auth.user where email = 'rizwan@lumenlabs.test'), manager_name = 'Rizwan Farook' where key = 'OLD'`;
    expect((await teamFor(await db.as("maya"), "OLD"))?.manager).toMatchObject({ name: "Rizwan Farook", inactive: true });
  });
});
