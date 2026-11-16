import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { contextFor } from "@amax/core/server";
import { ctxFor } from "../server/context";
import { addPerson, applyStatusDates, recordLeaver, zoneNote } from "../server/services";
import { hrDatabase } from "./setup";

// 109 AC-5: Sri Lanka is UTC+5:30 and Sydney UTC+11 in November. At 20:00 UTC on the 15th it is already the 16th in
// both, while UTC is still on the 15th; at 06:00 UTC on the 16th it is the 16th everywhere. One entity-local today
// decides the join date, joining or active, left, and the daily job.
const EVENING = "2026-11-15T20:00:00Z";

describe.skipIf(!hasDb)("109 one today for HR (Postgres)", () => {
  let db: Awaited<ReturnType<typeof hrDatabase>>;
  beforeAll(async () => { db = await hrDatabase(); }, 60_000);
  afterAll(() => db?.t.drop());
  afterEach(() => { vi.useRealTimers(); });
  const at = (now: string) => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(now)); };
  const add = async (name: string, entity: string, joinedOn?: string) =>
    addPerson(ctxFor(await db.as("sahan"), "mcp"), { name, title: "Engineer", department: "Engineering", entity, ...(joinedOn ? { joinedOn } : {}) });
  const row = async (name: string) => (await db.tx((tx) => tx.execute(sql`select employee_no, to_char(joined_on, 'YYYY-MM-DD') as joined, status from hr.person where name = ${name}`)))[0];

  // Review round 2: an entity with no zone set (the fixtures give Australia one; here it is taken away) is refused, never UTC.
  describe("with Australia's zone taken away", () => {
    const AU = "Lumen Labs Pty Ltd has no time zone set: set one before adding people there or recording leavers";
    beforeAll(async () => { await db.t.owner`delete from workflows.entity_zone where legal_entity_id in (select id from core.legal_entity where country = 'AU')`; });

    it.each([
      ["Australia, no zone set: the refusal", "Australia", AU],
      ["Sri Lanka, its country's zone: nothing", "Sri Lanka", undefined],
      ["an entity that isn't there: why", "Atlantis", "no legal entity Atlantis"],
    ])("the card says it as the entity is picked: %s", async (_name, entity, note) => {
      expect(await db.tx((tx) => zoneNote(tx, entity))).toBe(note);
    });

    it("110 AC6 a failed query is an error, never the card's note", async () => {
      const down = { execute: () => Promise.reject(new Error("db down")) };
      await expect(zoneNote(down as never, "Australia")).rejects.toThrow("db down");
    });

    it("add_person is refused, and the daily job leaves the entity's people as they are and names it", async () => {
      at(EVENING);
      await expect(add("Unzoned Australia", "Australia")).rejects.toThrow(AU);
      const r = await applyStatusDates(contextFor.job(db.maya.tenantId, "hr.person.status"), {});
      expect(r.unzoned).toEqual(["Lumen Labs Pty Ltd"]);
    });
  });

  describe("with Australia's zone set", () => {
    beforeAll(async () => {
      await db.t.owner`insert into workflows.entity_zone (legal_entity_id, tenant_id, timezone)
        select id, tenant_id, 'Australia/Sydney' from core.legal_entity where country = 'AU' on conflict (legal_entity_id) do nothing`;
    });

    it.each([
      ["Sri Lanka, the evening before in UTC", "Sri Lanka", EVENING, undefined, "2026-11-16", "active"],
      ["Australia, the evening before in UTC", "Australia", EVENING, undefined, "2026-11-16", "active"],
      ["Sri Lanka, the same day in UTC", "Sri Lanka", "2026-11-16T06:00:00Z", undefined, "2026-11-16", "active"],
      ["Sri Lanka, joining on its today, UTC's tomorrow", "Sri Lanka", EVENING, "2026-11-16", "2026-11-16", "active"],
      ["Sri Lanka, joining on its tomorrow", "Sri Lanka", EVENING, "2026-11-17", "2026-11-17", "joining"],
    ])("AC5 %s", async (_name, entity, now, joinedOn, joined, status) => {
      at(now);
      const name = `Test ${entity} ${now} ${joinedOn ?? "today"}`;
      const r = await add(name, entity, joinedOn);
      const p = await row(name);
      expect([r.status, p.joined, p.status]).toEqual([status, joined, status]);
    });

    it.each([
      ["Sri Lanka", "Sri Lanka"],
      ["Australia", "Australia"],
    ])("review round 1: %s, someone leaving on its today has left, though UTC is a day behind", async (_name, entity) => {
      at("2026-11-10T00:00:00Z");
      await add(`Leaver ${entity}`, entity);
      at(EVENING);
      const p = await row(`Leaver ${entity}`);
      const r = await recordLeaver(ctxFor(db.mayaAs("HR")), { employeeNo: p.employee_no as string, leftOn: "2026-11-16" });
      expect(r.status).toBe("left");
    });

    it("review round 1: the daily job starts someone on their entity's today, though UTC is a day behind", async () => {
      at("2026-11-10T00:00:00Z");
      await add("Starter Sri Lanka", "Sri Lanka", "2026-11-16");
      at(EVENING);
      const r = await applyStatusDates(contextFor.job(db.maya.tenantId, "hr.person.status"), {});
      expect([r.started.includes((await row("Starter Sri Lanka")).employee_no as string), (await row("Starter Sri Lanka")).status]).toEqual([true, "active"]);
    });
  });
});
