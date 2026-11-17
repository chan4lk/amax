import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import manifest from "../module";
import { EVENTS, utilisation } from "../contracts";
import { reportsDb } from "./db";

const LK = "11111111-1111-4111-8111-1111111111a1";
const OCT = { from: "2026-10-01", to: "2026-10-16" };

describe("AC-3 contract shape", () => {
  it("publishes every event the manifest emits, each with a declared payload", () => {
    expect(manifest.events?.emits).toEqual(Object.values(EVENTS));
    expect(Object.keys(manifest.events?.payloads ?? {})).toEqual(Object.values(EVENTS));
    expect(manifest).toMatchObject({ id: "reports", group: "Work", dependsOn: ["hr"], integratesWith: ["time", "leave", "allocations", "delivery"] });
  });
});

describe.skipIf(!hasDb)("AC-3 contract reads and payloads (Postgres)", () => {
  let db: Awaited<ReturnType<typeof reportsDb>>;
  beforeAll(async () => { db = await reportsDb(); }, 240_000);
  afterAll(() => db?.t.drop());

  it("utilisation reads as the viewer; a holiday leaves available hours; events carry no hours", async () => {
    expect((await db.tx(async (tx) => utilisation(tx, await db.as("maya"), OCT))).team).toMatchObject({ people: 3, availableHours: 264, billableHours: 222, utilisation: 84 });
    await expect(db.tx(async (tx) => utilisation(tx, await db.as("nimal"), OCT))).rejects.toThrow(/forbidden/);
    await db.call("maya", "set_holiday", { legalEntityId: LK, on: "2026-10-15", name: "Demo holiday (fictional)" });
    await db.call("maya", "set_utilisation_target", { target: 75 });
    expect((await db.tx(async (tx) => utilisation(tx, await db.as("maya"), OCT))).team).toMatchObject({ availableHours: 240 });
    const events = await db.q(sql`select name, payload from core.event where name like 'reports.%' order by created_at`);
    expect(events.map((e) => [e.name, Object.keys(e.payload as object).sort()])).toEqual([[EVENTS.holidaySet, ["by", "legalEntityId", "name", "on"]], [EVENTS.targetSet, ["by", "target"]]]);
  }, 60_000);
});
