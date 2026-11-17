import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { getPerson } from "@amax/hr/contracts";
import manifest from "../module";
import { EVENTS, listAllocations, monthOf, monthOutlook, personMonthTotals } from "../contracts";
import { contextFor } from "@amax/core/server";
import { allocationsDatabase, T } from "./setup";

describe("AC-4 contract shape", () => {
  it("names the events the manifest emits and normalises months", () => {
    expect(EVENTS).toEqual({ allocationSet: "allocations.allocation.set", monthCopied: "allocations.month.copied", fixSuggested: "allocations.fix.suggested", monthSettled: "allocations.month.settled" });
    expect(manifest.events?.emits).toEqual(Object.values(EVENTS));
    expect(monthOf("2026-12-17")).toBe("2026-12-01");
  });
});

describe.skipIf(!hasDb)("AC-4 contract reads (Postgres)", () => {
  let db: Awaited<ReturnType<typeof allocationsDatabase>>;
  beforeAll(async () => { db = await allocationsDatabase(); }, 60_000);
  afterAll(() => db?.t.drop());

  it("listAllocations and personMonthTotals: Ayesha is at 120% in December", async () => {
    await db.tx(async (tx) => {
      const sys = contextFor.job(T, "allocations.test");
      const ayesha = (await getPerson(tx, sys, "LL-0291"))!;
      const rows = await listAllocations(tx, sys, { from: "2026-12-01", to: "2026-12-31", personIds: [ayesha.id] });
      expect(rows.rows.map((r) => r.percent).sort()).toEqual([50, 70]);
      expect(await personMonthTotals(tx, sys, { from: "2026-10-01", to: "2027-02-01", personIds: [ayesha.id] })).toEqual({ hidden: 0, rows:
        ["2026-10-01", "2026-11-01", "2026-12-01", "2027-01-01", "2027-02-01"].map((month, i) => ({ personId: ayesha.id, month, percent: i === 2 ? 120 : 100 })) });
      expect(await listAllocations(tx, sys, { from: "2026-10-01", to: "2026-10-01", personIds: [] })).toEqual({ rows: [], hidden: 0 });
    });
  });
  it("AC-5 monthOutlook gives capacity, demand, who is over and the bench by month", async () => {
    await db.tx(async (tx) => {
      const v = await db.as("maya");
      const months = await monthOutlook(tx, v, ["2026-11-01", "2026-12-01"], new Date("2026-10-16T12:00:00Z"));
      expect(months.map((m) => m.month)).toEqual(["2026-11-01", "2026-12-01"]);
      expect(months[1].over.map((o) => [o.name, o.percent])).toEqual([["Ayesha Rahman", 120]]);
      expect(months[1].capacity).toBeGreaterThan(0);
    });
  });
});
