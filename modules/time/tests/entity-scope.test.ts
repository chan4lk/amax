import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@amax/db";
import { hasDb } from "@amax/db/testdb";
import { weekTotals } from "../contracts";
import { approveMany } from "../server/bulk";
import { ctxFor } from "../server/context";
import { correctEntry } from "../server/correct";
import { approveWeek, rejectWeek, remindWeek } from "../server/decide";
import { decideRequest } from "../server/decide-request";
import { reopenWeek } from "../server/reopen";
import { requestChange } from "../server/request";
import { teamWeek } from "../server/team";
import { T, timeDb } from "./db";

const W = "2026-W42";

describe.skipIf(!hasDb)("071 legal-entity scope on every check about another person's week (Postgres)", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  beforeAll(async () => { db = await timeDb(); }, 60_000);
  afterAll(() => db?.t.drop());

  const entity = async (key: string) => (await db.q(sql`select legal_entity_id as id from auth.user where email = ${`${key}@lumenlabs.test`}`))[0].id as string;
  const scopeAdmin = (key: string, ids: string[] | null) => db.t.owner`update auth.role_assignment set legal_entity_ids = ${ids} where role = 'Admin'
    and user_id = (select id from auth.user where email = ${`${key}@lumenlabs.test`})`;
  const weekId = async (key: string) => (await db.q(sql`select w.id from time.week w join auth.user u on u.id = w.user_id where u.email = ${`${key}@lumenlabs.test`} and w.iso_week = 42`))[0].id as string;
  const entryOf = async (key: string) => (await db.q(sql`select e.id from time.entry e join auth.user u on u.id = e.user_id where u.email = ${`${key}@lumenlabs.test`}
    and e.day between '2026-10-12' and '2026-10-16' and e.deleted_at is null order by e.day limit 1`))[0].id as string;

  it("AC4 AC5 an Admin scoped to another entity can't see or act on these weeks, with the error a missing week gives", async () => {
    const lk = await entity("kasun");
    const [{ id: other }] = await db.q(sql`select id from core.legal_entity where id <> ${lk} limit 1`);
    const missing = await approveWeek(ctxFor(await db.as("sahan")), { weekId: "00000000-0000-4000-8000-000000000001" }).catch((e: Error) => e.message);
    const request = await requestChange(ctxFor(await db.as("kasun")), { entryId: await entryOf("kasun"), hours: 1, reason: "Left early" });
    await scopeAdmin("sahan", [other as string]);
    const sahan = await db.as("sahan");
    const [kasunWeek, tharushiWeek] = [{ weekId: await weekId("kasun") }, { weekId: await weekId("tharushi") }];
    for (const act of [() => approveWeek(ctxFor(sahan), kasunWeek), () => rejectWeek(ctxFor(sahan), { ...kasunWeek, comment: "Split Tuesday" }),
      () => remindWeek(ctxFor(sahan), tharushiWeek)]) await expect(act()).rejects.toThrow(missing);
    await expect(correctEntry(ctxFor(sahan), { entryId: await entryOf("tharushi"), hours: 1, reason: "Fix" })).rejects.toThrow(/data scope/);
    await expect(decideRequest(ctxFor(sahan), { requestId: request.id, decision: "decline", note: "Not needed" })).rejects.toThrow();
    expect((await approveMany(ctxFor(sahan), { weekIds: [kasunWeek.weekId] })).results.map((r) => r.status)).toEqual(["skipped"]);
    expect((await teamWeek(sahan, { year: 2026, week: 42 })).rows).toEqual([]);
    expect(await withTenant(db.app, T, (tx) => weekTotals(tx, sahan, { year: 2026, week: 42 }))).toEqual([]);

    await scopeAdmin("sahan", null);
    await expect(approveWeek(ctxFor(await db.as("sahan")), kasunWeek)).resolves.toMatchObject({ status: "approved" });
    await expect(reopenWeek(ctxFor(await db.as("sahan")), { ...kasunWeek, reason: "Fix Monday" })).resolves.toMatchObject({ status: "draft" });
  }, 60_000);

  it("AC4 an owner with no entity is out of an entity-scoped Admin's reach, and in an unscoped one's", async () => {
    const lk = await entity("tharushi");
    await db.t.owner`update auth.user set legal_entity_id = null where email = 'dinesh@lumenlabs.test'`;
    await scopeAdmin("sahan", [lk]);
    const scoped = await db.as("sahan");
    await expect(correctEntry(ctxFor(scoped), { entryId: await entryOf("dinesh"), hours: 1, reason: "Fix" })).rejects.toThrow(/data scope/);
    await expect(correctEntry(ctxFor(scoped), { entryId: await entryOf("tharushi"), hours: 1, reason: "Fix" })).resolves.toMatchObject({ hours: 1 });
    expect((await teamWeek(scoped, { year: 2026, week: 42 })).rows.map((r) => r.personName)).not.toContain("Dinesh Wickrama");
    await scopeAdmin("sahan", null);
    await expect(correctEntry(ctxFor(await db.as("sahan")), { entryId: await entryOf("dinesh"), hours: 1, reason: "Fix" })).resolves.toMatchObject({ hours: 1 });
  }, 60_000);
});
