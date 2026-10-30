import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { ctxFor } from "../server/context";
import { correctEntry, deleteEntry } from "../server/correct";
import { approveWeek } from "../server/decide";
import { logTime } from "../server/log";
import { userFacing } from "@amax/mcp";
import { timeDb } from "./db";

const W = "2026-W42";

describe.skipIf(!hasDb)("070 entry corrections (Postgres)", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  beforeAll(async () => { db = await timeDb(); }, 60_000);
  afterAll(() => db?.t.drop());

  const entry = async (key: string, day: string, project: string) => (await db.q(sql`select e.id, e.hours::float as hours from time.entry e join auth.user u on u.id = e.user_id
    join delivery.project p on p.id = e.project_id where u.email = ${`${key}@lumenlabs.test`} and e.day = ${day} and p.key = ${project} order by e.hours desc limit 1`))[0] as { id: string; hours: number } | undefined;
  const dayTotal = async (key: string, day: string) => Number((await db.q(sql`select sum(e.hours) as h from time.entry e join auth.user u on u.id = e.user_id where u.email = ${`${key}@lumenlabs.test`} and e.day = ${day}`))[0].h);
  const count = async (q: ReturnType<typeof sql>) => Number((await db.q(q))[0].n);

  it("AC1 the owner corrects a draft entry within the day's 24 h and 0.05 h steps; submitted, other people's and locked weeks are refused", async () => {
    const [tharushi, nimal, kasun, sahan] = await Promise.all([db.as("tharushi"), db.as("nimal"), db.as("kasun"), db.as("sahan")]);
    const wed = (await entry("tharushi", "2026-10-14", "FLT"))!;
    const room = Math.round((24 - (await dayTotal("tharushi", "2026-10-14")) + wed.hours) * 100) / 100;
    await expect(correctEntry(ctxFor(tharushi), { entryId: wed.id, hours: room + 0.05 })).rejects.toThrow(/more than 24 h/);
    await expect(correctEntry(ctxFor(tharushi), { entryId: wed.id, hours: room })).resolves.toMatchObject({ hours: room, revision: 2 });
    await expect(correctEntry(ctxFor(tharushi), { entryId: wed.id, hours: 6 })).resolves.toMatchObject({ hours: 6, revision: 3 });
    for (const hours of [0, 0.07, 24.05]) await expect(correctEntry(ctxFor(tharushi), { entryId: wed.id, hours })).rejects.toThrow(/invalid input/);
    await expect(correctEntry(ctxFor(tharushi), { entryId: wed.id })).rejects.toThrow(/invalid input/);
    const thu = (await entry("tharushi", "2026-10-15", "CON"))!;
    await correctEntry(ctxFor(tharushi), { entryId: thu.id, projectKey: "HRI", billable: false });
    expect(await entry("tharushi", "2026-10-15", "HRI")).toMatchObject({ id: thu.id });
    await expect(correctEntry(ctxFor(nimal), { entryId: thu.id, hours: 1 })).rejects.toThrow(/data scope/);
    const mon = (await entry("kasun", "2026-10-12", "CON"))!;
    await expect(correctEntry(ctxFor(kasun), { entryId: mon.id, hours: 7 })).rejects.toThrow(/submitted and waiting/);
    await approveWeek(ctxFor(sahan), { person: "kasun@lumenlabs.test", week: W });
    for (const who of [kasun, sahan]) await expect(correctEntry(ctxFor(who), { entryId: mon.id, hours: 7, reason: "Friday was 7 h" })).rejects.toThrow(/approved and locked; reopen it/);
  });

  it("AC2 delete follows the same rules: the owner's draft entry goes, someone else's is refused", async () => {
    const [tharushi, kasun] = await Promise.all([db.as("tharushi"), db.as("kasun")]);
    const tue = (await entry("tharushi", "2026-10-13", "FLT"))!;
    await expect(deleteEntry(ctxFor(kasun), { entryId: tue.id })).rejects.toThrow(/data scope/);
    await expect(deleteEntry(ctxFor(tharushi), { entryId: tue.id })).resolves.toMatchObject({ deleted: true });
    await expect(deleteEntry(ctxFor(tharushi), { entryId: tue.id })).rejects.toThrow(/data scope/);
  });

  it("AC3 corrected and deleted events carry the revision and the before state; the audit row has before and after", async () => {
    const tharushi = await db.as("tharushi");
    const mon = (await entry("tharushi", "2026-10-12", "FLT"))!;
    await correctEntry(ctxFor(tharushi), { entryId: mon.id, hours: 2 });
    await deleteEntry(ctxFor(tharushi), { entryId: mon.id });
    const events = await db.q(sql`select name, payload from core.event where payload->>'entryId' = ${mon.id} order by created_at, name`);
    expect(events.map((e) => [e.name, (e.payload as { revision: number }).revision])).toEqual([["time.entry.corrected", 2], ["time.entry.deleted", 3]]);
    expect(events[0].payload).toMatchObject({ hours: 2, before: { hours: mon.hours }, lockedChange: false, day: "2026-10-12" });
    const [audit] = await db.q(sql`select before, after from core.audit_event where action = 'time.entry.correct' and resource_id = ${mon.id}`);
    expect(audit).toMatchObject({ before: { hours: mon.hours }, after: { hours: 2 } });
  });

  it("AC4 a write that fails after the update leaves the entry, the audit log and the outbox unchanged", async () => {
    const tharushi = await db.as("tharushi");
    const { id } = await logTime(ctxFor(tharushi), { projectKey: "FLT", day: "2026-10-16", hours: 1.5 });
    const thu = { id, hours: 1.5 };
    await db.t.owner.unsafe(`create function time.t070_fail() returns trigger language plpgsql as $$ begin raise exception 't070 forced'; end $$;
      create trigger t070_fail before insert on core.event for each row when (new.name = 'time.entry.corrected') execute function time.t070_fail()`);
    try {
      await expect(correctEntry(ctxFor(tharushi), { entryId: thu.id, hours: 1 })).rejects.toMatchObject({ cause: expect.objectContaining({ message: "t070 forced" }) });
    } finally {
      await db.t.owner.unsafe(`drop trigger t070_fail on core.event; drop function time.t070_fail()`);
    }
    expect(await db.q(sql`select hours::float as hours, revision from time.entry where id = ${thu.id}`)).toEqual([{ hours: thu.hours, revision: 1 }]);
    expect(await count(sql`select count(*) as n from core.audit_event where action = 'time.entry.correct' and resource_id = ${thu.id}`)).toBe(0);
    expect(await count(sql`select count(*) as n from core.event where payload->>'entryId' = ${thu.id} and name <> 'time.entry.logged'`)).toBe(0);
  });
  // Review round 1: a confirmed card is checked again when it runs, so it never writes over an entry changed after it was shown.
  it.each([
    ["the hours moved", { hoursBefore: 2 }, /changed since you saw it \(hoursBefore is 1\.5\)/],
    ["the project moved", { project: "Contoso Portal" }, /changed since you saw it \(project is Fleet Tracker\)/],
    ["the day is not the entry's", { day: "2026-10-12" }, /changed since you saw it \(day is 2026-10-16\)/],
    ["the card still matches", { hoursBefore: 1.5, project: "fleet tracker", day: "2026-10-16" }, null],
    ["a direct call that names only the entry", {}, null],
  ] as const)("a correction and a delete re-check the card at write time: %s", async (_, card, problem) => {
    const tharushi = await db.as("tharushi");
    for (const write of ["correct", "delete"] as const) {
      const { id } = await logTime(ctxFor(tharushi), { projectKey: "FLT", day: "2026-10-16", hours: 1.5 });
      const run = write === "correct" ? correctEntry(ctxFor(tharushi), { entryId: id, hours: 1, ...card }) : deleteEntry(ctxFor(tharushi), { entryId: id, ...card });
      if (problem) {
        await expect(run).rejects.toThrow(problem);
        // Review round 4: a refusal the caller may read, so REST answers 400, not a 500 with a reference.
        expect(userFacing(await run.catch((e: unknown) => e))).toBe(true);
        expect(await db.q(sql`select hours::float as hours, revision, deleted_at from time.entry where id = ${id}`)).toEqual([{ hours: 1.5, revision: 1, deleted_at: null }]);
      } else await expect(run).resolves.toBeTruthy();
      if (!problem && write === "correct") await deleteEntry(ctxFor(tharushi), { entryId: id });
    }
  });
});
