import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@amax/db";
import { hasDb } from "@amax/db/testdb";
import { weekTotals } from "../contracts";
import { ctxFor } from "../server/context";
import { correctEntry, deleteEntry } from "../server/correct";
import { approveWeek } from "../server/decide";
import { myWeek } from "../server/my";
import { reopenWeek } from "../server/reopen";
import { T, timeDb } from "./db";

const W = "2026-W42";

describe.skipIf(!hasDb)("070 amendment: locked weeks, fixes by a PM or Admin, soft delete (Postgres)", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  beforeAll(async () => { db = await timeDb(); }, 60_000);
  afterAll(() => db?.t.drop());

  const entry = async (key: string, day: string, project: string) => (await db.q(sql`select e.id, e.hours::float as hours from time.entry e join auth.user u on u.id = e.user_id
    join delivery.project p on p.id = e.project_id where u.email = ${`${key}@lumenlabs.test`} and e.day = ${day} and p.key = ${project} and e.deleted_at is null order by e.hours desc limit 1`))[0] as { id: string; hours: number } | undefined;
  const count = async (q: ReturnType<typeof sql>) => Number((await db.q(q))[0].n);

  it("AC13 an approved week refuses corrections and deletes from everyone, Admin included, until it is reopened", async () => {
    const [kasun, sahan] = await Promise.all([db.as("kasun"), db.as("sahan")]);
    const mon = (await entry("kasun", "2026-10-12", "CON"))!;
    await approveWeek(ctxFor(sahan), { person: "kasun@lumenlabs.test", week: W });
    const locked = sql`select count(*) as n from core.audit_event where action = 'time.week.locked_change'`;
    const before = await count(locked);
    for (const who of [kasun, sahan]) {
      await expect(correctEntry(ctxFor(who), { entryId: mon.id, hours: 7, reason: "Monday was 7 h" })).rejects.toThrow(/approved and locked; reopen it with a reason \(reopen_week\)/);
      await expect(deleteEntry(ctxFor(who), { entryId: mon.id, reason: "Logged twice" })).rejects.toThrow(/approved and locked/);
    }
    expect(await count(locked)).toBe(before);
    await reopenWeek(ctxFor(sahan), { person: "kasun@lumenlabs.test", week: W, reason: "Monday was 7 h" });
    await expect(correctEntry(ctxFor(kasun), { entryId: mon.id, hours: 7 })).resolves.toMatchObject({ hours: 7 });
  });

  it("AC14 a PM fixes an entry on a project they manage with a reason; other projects, other people and no reason are refused", async () => {
    const [nimal, kasun, sahan] = await Promise.all([db.as("nimal"), db.as("kasun"), db.as("sahan")]);
    const wed = (await entry("tharushi", "2026-10-14", "FLT"))!;
    await expect(correctEntry(ctxFor(nimal), { entryId: wed.id, hours: 6 })).rejects.toThrow(/invalid input: reason/);
    await expect(correctEntry(ctxFor(nimal), { entryId: wed.id, projectKey: "HRI", reason: "Wrong project" })).rejects.toThrow(/data scope/);
    await expect(correctEntry(ctxFor(kasun), { entryId: wed.id, hours: 6, reason: "On leave Wednesday afternoon" })).rejects.toThrow(/data scope/);
    await expect(correctEntry(ctxFor(nimal), { entryId: wed.id, hours: 6, reason: "On leave Wednesday afternoon" })).resolves.toMatchObject({ hours: 6 });
    const [ev] = await db.q(sql`select payload from core.event where name = 'time.entry.corrected' and payload->>'entryId' = ${wed.id}`);
    expect(ev.payload).toMatchObject({ by: nimal.userId, byOther: true, reason: "On leave Wednesday afternoon", projectName: "Fleet Tracker", week: W });
    const [audit] = await db.q(sql`select after from core.audit_event where action = 'time.entry.correct' and resource_id = ${wed.id}`);
    expect(audit.after).toMatchObject({ reason: "On leave Wednesday afternoon" });
    const thu = (await entry("tharushi", "2026-10-15", "CON"))!;
    await expect(deleteEntry(ctxFor(sahan), { entryId: thu.id, reason: "Logged on the wrong day" })).resolves.toMatchObject({ deleted: true });
  });

  it("AC16 a deleted entry stays as a row but leaves every read, total and later write", async () => {
    const tharushi = await db.as("tharushi");
    const tue = (await entry("tharushi", "2026-10-13", "FLT"))!;
    const total = async () => (await withTenant(db.app, T, (tx) => weekTotals(tx, tharushi, { year: 2026, week: 42 }))).find((p) => p.userId === tharushi.userId)!.hours;
    const [beforeTotal, beforeMine] = [await total(), await myWeek(tharushi, { year: 2026, week: 42 })];
    await deleteEntry(ctxFor(tharushi), { entryId: tue.id });
    const mine = await myWeek(tharushi, { year: 2026, week: 42 });
    expect(await total()).toBeCloseTo(beforeTotal - tue.hours, 2);
    expect(mine.total).toBeCloseTo(beforeMine.total - tue.hours, 1);
    expect(mine.entries.map((e) => e.id)).not.toContain(tue.id);
    expect(await db.q(sql`select deleted_by is not null as marked from time.entry where id = ${tue.id} and deleted_at is not null`)).toEqual([{ marked: true }]);
    await expect(correctEntry(ctxFor(tharushi), { entryId: tue.id, hours: 1 })).rejects.toThrow(/data scope/);
  });
});
