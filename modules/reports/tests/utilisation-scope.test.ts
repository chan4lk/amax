import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { Report } from "../server/view";
import { reportsDb } from "./db";

describe.skipIf(!hasDb)("071 AC-13 utilisation follows Time's week scope (Postgres)", () => {
  let db: Awaited<ReturnType<typeof reportsDb>>;
  beforeAll(async () => { db = await reportsDb(); }, 240_000);
  afterAll(() => db?.t.drop());

  const names = (r: Report) => r.rows.map((x) => x.name).sort();
  const scopeAdmin = (ids: string[] | null) => db.t.owner`update auth.role_assignment set legal_entity_ids = ${ids}
    where role = 'Admin' and user_id = (select id from auth.user where email = 'sahan@lumenlabs.test')`;

  it("AC13 a PM sees the people with hours on their project; an Admin scoped to another entity sees nobody; a colleague's figure is refused", async () => {
    expect((await db.call<Report>("sahan", "get_utilisation", {}, "PM")).rows).toEqual([]);
    await db.t.owner`update delivery.project set manager_user_id = (select id from auth.user where email = 'sahan@lumenlabs.test') where key = 'FLT'`;
    const onFleet = (await db.q(sql`select distinct u.name from time.entry e join auth.user u on u.id = e.user_id join delivery.project p on p.id = e.project_id
      where p.key = 'FLT' and e.deleted_at is null and e.day between '2026-10-01' and '2026-10-31'`)).map((r) => r.name as string);
    const all = names(await db.call<Report>("maya", "get_utilisation", {}));
    const pm = names(await db.call<Report>("sahan", "get_utilisation", {}, "PM"));
    expect(pm.length).toBeGreaterThan(0);
    expect(pm).toEqual(all.filter((n) => onFleet.includes(n)));

    const [{ lk }] = await db.q(sql`select legal_entity_id as lk from auth.user where email = 'maya@lumenlabs.test'`);
    const [{ id: other }] = await db.q(sql`select id from core.legal_entity where id <> ${lk as string} limit 1`);
    await scopeAdmin([other as string]);
    expect((await db.call<Report>("sahan", "get_utilisation", {})).rows).toEqual([]);
    await scopeAdmin(null);
    expect(names(await db.call<Report>("sahan", "get_utilisation", {}))).toEqual(all);

    const [{ id: nimal }] = await db.q(sql`select id from auth.user where email = 'nimal@lumenlabs.test'`);
    expect(await db.call("kasun", "get_person_utilisation", { userId: nimal }).catch((e: Error) => e.message)).toSatisfy((r: unknown) => r === null || /forbidden/.test(String(r)));
  }, 120_000);
});
