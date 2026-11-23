import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb, tablesMissingRls } from "@amax/db/testdb";
import manifest from "../module";
import { CAPACITY, DEMAND } from "../fixtures/plan";
import { ctxFor } from "../server/context";
import { forecastFor } from "../server/forecast";
import { gridFor, headlines } from "../server/grid";
import { allocate, copyMonth } from "../server/services";
import { allocationsDatabase, TODAY } from "./setup";

describe.skipIf(!hasDb)("allocations against Postgres", () => {
  let db: Awaited<ReturnType<typeof allocationsDatabase>>;
  beforeAll(async () => { db = await allocationsDatabase(); }, 60_000);
  afterAll(() => db?.t.drop());

  it("AC-1 tenant-isolated schema; per-person totals with over 100% flagged (Ayesha, December)", async () => {
    expect(await tablesMissingRls(db.t.owner)).toEqual([]);
    const grid = await gridFor(await db.as("maya", "PM"), { today: TODAY });
    expect(grid.people.map((p) => p.name)).toEqual(["Ayesha Rahman", "Kasun Dias", "Nimal Silva"]);
    const by = (n: string) => grid.people.find((p) => p.name === n)!;
    expect(by("Ayesha Rahman").totals).toEqual([100, 100, 120, 100, 100, 0]);
    expect(by("Kasun Dias").totals).toEqual([100, 100, 100, 0, 0, 0]);
    expect(by("Nimal Silva").lines.map((l) => [l.label, l.manages])).toEqual([["Contoso Portal", false], ["Fleet Tracker", true]]);
    expect(grid.months.map((m) => m.forecast)).toEqual([false, false, false, true, true, true]);
    expect(headlines(grid)).toEqual({ over: [{ name: "Ayesha Rahman", month: "2026-12-01" }], idle: [{ name: "Ayesha Rahman", month: "2027-03-01" }, { name: "Kasun Dias", month: "2027-01-01" }, { name: "Nimal Silva", month: "2027-03-01" }] });
  });

  it("AC-2 capacity (hr FTE) and demand match fixtures.md; January bench is 6 by skill; works without the optional leave module", async () => {
    expect(manifest.integratesWith).toEqual(["leave"]);
    const f = await forecastFor(await db.as("maya", "Leadership"), { today: TODAY });
    expect(f.months.map((m) => m.capacity)).toEqual(CAPACITY);
    expect(f.months.map((m) => m.demand)).toEqual(DEMAND);
    expect(f.leaveAdjusted).toBe(false);
    const jan = f.months[3];
    expect(jan.bench).toHaveLength(6);
    expect(jan.bench.reduce<Record<string, number>>((n, b) => ({ ...n, [b.skill]: (n[b.skill] ?? 0) + 1 }), {})).toEqual({ ".NET": 3, React: 1, QA: 1, Data: 1 });
  });

  it("AC-3 allocate and Copy to next month are audited and emit events; a PM copies only rows on projects they manage", async () => {
    const pm = ctxFor(await db.as("maya", "PM"));
    await expect(allocate(pm, { person: "Kasun Dias", projectKey: "CON", month: "2027-01", through: "2027-02", percent: 40 })).resolves.toMatchObject({ months: ["2027-01-01", "2027-02-01"] });
    await expect(allocate(pm, { person: "LL-0417", projectKey: "FLT", month: "2027-01", percent: 40 })).rejects.toThrow(/data scope/);
    const copied = await copyMonth(pm, { from: "2027-02" });
    expect(copied).toMatchObject({ to: "2027-03-01", copied: 3, skipped: 141, forbidden: 2 });
    const audit = await db.tx((tx) => tx.execute(sql`select action, after from core.audit_event where action like 'allocations.%' order by seq`));
    expect(audit.map((a) => a.action)).toEqual(["allocations.allocation.set", "allocations.month.copy"]);
    const events = await db.tx((tx) => tx.execute(sql`select name from core.event where name like 'allocations.%' order by created_at, id`));
    expect(events.map((e) => e.name).sort()).toEqual(["allocations.allocation.set", "allocations.month.copied", "allocations.month.settled", "allocations.month.settled"]);
    const intent = (manifest.chatIntents as { id: string; tool: string }[]).find((i) => i.id === "allocations.allocate")!;
    expect(manifest.mcpTools!.map((t) => t.name)).toContain(intent.tool);
    // A second copy finds those rows already planned: skipped, not forbidden.
    expect(await copyMonth(pm, { from: "2027-02" })).toMatchObject({ copied: 0, skipped: 141 + 3, forbidden: 2 });
  });
});
