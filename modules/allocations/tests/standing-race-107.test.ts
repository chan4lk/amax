import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { contextFor } from "@amax/core/server";
import { ctxFor } from "../server/context";
import { allocate } from "../server/services";
import { extendStanding } from "../server/standing-jobs";
import { allocationsDatabase, T } from "./setup";

// Review round 3: the real monthly job (session A) holds a standing row's lock while it writes 2028-01. It is held there
// by session C, which has the same 2028-01 row uncommitted. Each writer (session B) then runs; it must wait on A's lock
// before it reads or deletes, so once A has written 2028-01 the writer sees it. Without lock-first the end and the hand
// removal fail; a month set by hand wins either way, as the job only inserts where no row is (on conflict do nothing).
describe.skipIf(!hasDb)("107 standing writers against the monthly job (Postgres, three sessions)", () => {
  let db: Awaited<ReturnType<typeof allocationsDatabase>>;
  beforeAll(async () => { db = await allocationsDatabase(); }, 60_000);
  afterAll(() => db?.t.drop());
  const waiting = async () => Number((await db.t.owner`select count(*)::int as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`)[0].n);
  const until = async (n: number) => { for (let i = 0; i < 200 && (await waiting()) < n; i++) await new Promise((r) => setTimeout(r, 25)); expect(await waiting()).toBeGreaterThanOrEqual(n); };
  const jan = async (who: string) => (await db.tx((tx) => tx.execute(sql`select a.percent from allocations.allocation a join hr.person p on p.id = a.person_id
    join delivery.project j on j.id = a.project_id where p.name = ${who} and j.key = 'CON' and a.month = '2028-01-01'`)))[0]?.percent;

  it.each([
    ["ending it from June removes the month the job wrote", "Kasun Dias", { month: "2027-06", percent: 0, standing: true }, undefined],
    ["a month removed by hand stays removed", "Nimal Silva", { month: "2028-01", percent: 0 }, undefined],
    ["a month set by hand wins over the job's", "Tharushi Wijesinghe", { month: "2028-01", percent: 20 }, 20],
  ])("B7 %s", async (_name, person, writer, expected) => {
    const maya = ctxFor(await db.as("maya"), "mcp");
    await allocate(maya, { person, projectKey: "CON", month: "2027-01", percent: 30, standing: true });
    const [s] = await db.tx((tx) => tx.execute(sql`select s.person_id, s.project_id from allocations.standing s join hr.person p on p.id = s.person_id where p.name = ${person} and s.until_month is null`));
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const c = db.t.owner.begin(async (tx) => {
      await tx`insert into allocations.allocation (tenant_id, person_id, project_id, month, percent, updated_by) values (${T}, ${s.person_id as string}, ${s.project_id as string}, '2028-01-01', 99, 'session c')`;
      await gate;
      throw new Error("roll back");
    }).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 50));
    const job = extendStanding(contextFor.job(T, "allocations.standing-extend"), { today: "2027-02-05" });
    await until(1);
    const write = allocate(maya, { person, projectKey: "CON", ...writer });
    await until(2);
    release();
    await Promise.all([c, job, write]);
    expect(await jan(person)).toBe(expected);
  });
});
