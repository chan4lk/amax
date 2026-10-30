import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { createRegistry } from "@amax/mcp";
import manifest from "../module";
import type { WeekUtilisation } from "../server/utilisation";
import { sql } from "drizzle-orm";
import { setInstalledModules } from "@amax/core/server";
import { installedModules } from "./installed";
import { timeDb } from "./db";

// 072 review rounds 1 and 2 (module standard): Leave is an optional integration. Switched off the way
// AMAX_MODULES_DISABLED does it (never migrated, not installed), weekly utilisation still answers, with no leave
// adjustment and no leaveVisible flag.
describe.skipIf(!hasDb)("072 weekly utilisation without Leave installed (Postgres)", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  const registry = createRegistry([manifest]);
  beforeAll(async () => {
    db = await timeDb([], ["leave", "payroll"]); // payroll depends on leave, so it goes with it
  }, 60_000);
  afterAll(() => db?.t.drop());

  it("answers for W42 with Ayesha's hours against her full target, no leave fields", async () => {
    const rows = (await registry.call(await db.as("maya"), "get_week_utilisation", { week: "2026-W42" }, { source: "mcp" })) as WeekUtilisation[];
    const ayesha = rows.find((r) => r.person === "Ayesha Rahman")!;
    expect(ayesha).toMatchObject({ hours: 23.5, target: 40, utilisation: 59 });
    expect([ayesha.leaveDays, ayesha.adjustedTarget, ayesha.leaveVisible]).toEqual([undefined, undefined, undefined]);
  }, 60_000);
});

// Review round 3: the case a table check can't see. Leave's tables are there (migrated, seeded), but this deployment
// runs without the Leave module (AMAX_MODULES_DISABLED=leave after it was once installed): hasModule says no, so no
// leave is read, adjusted or flagged.
describe.skipIf(!hasDb)("072 weekly utilisation with Leave's tables present but the module switched off (Postgres)", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  const registry = createRegistry([manifest]);
  beforeAll(async () => {
    db = await timeDb();
    setInstalledModules((await installedModules(["leave", "payroll"])).map((m) => m.id));
  }, 60_000);
  afterAll(() => db?.t.drop());

  it("answers for W42 with Ayesha's hours against her full target, no leave fields, though her leave rows exist", async () => {
    expect((await db.q(sql`select count(*)::int as n from leave.request where status = 'approved'`))[0].n).toBeGreaterThan(0);
    const rows = (await registry.call(await db.as("maya"), "get_week_utilisation", { week: "2026-W42" }, { source: "mcp" })) as WeekUtilisation[];
    const ayesha = rows.find((r) => r.person === "Ayesha Rahman")!;
    expect(ayesha).toMatchObject({ hours: 23.5, target: 40, utilisation: 59 });
    expect([ayesha.leaveDays, ayesha.adjustedTarget, ayesha.leaveVisible]).toEqual([undefined, undefined, undefined]);
  }, 60_000);
});

