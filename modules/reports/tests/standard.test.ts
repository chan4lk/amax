import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb, repoRoot } from "@amax/db/testdb";
import { discoverModules } from "@amax/core/registry";
import type { Report } from "../server/view";
import { installedModules } from "./installed";
import { reportsDb } from "./db";

const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? (d.name === "node_modules" ? [] : files(join(dir, d.name))) : /\.tsx?$/.test(d.name) ? [join(dir, d.name)] : []);

describe("AC-3 module standard", () => {
  it("AC3 can be switched off: nothing outside modules/reports imports it, and the others load without it", async () => {
    expect(discoverModules(join(repoRoot, "modules"), ["reports"])).not.toContain("reports");
    const outside = [...readdirSync(join(repoRoot, "modules")).filter((m) => m !== "reports").map((m) => join(repoRoot, "modules", m)), join(repoRoot, "packages"), join(repoRoot, "apps/web/app")].flatMap(files);
    expect(outside.filter((f) => /@amax\/reports(?!\/contracts")/.test(readFileSync(f, "utf8")))).toEqual([]);
    expect((await installedModules(["reports"])).map((m) => m.id)).not.toContain("reports");
  }, 60_000);
});

describe.skipIf(!hasDb)("without time, leave and allocations (Postgres)", () => {
  let db: Awaited<ReturnType<typeof reportsDb>>;
  beforeAll(async () => { db = await reportsDb(["time", "leave", "allocations", "payroll"]); }, 240_000);
  afterAll(() => db?.t.drop());

  it("AC3 utilisation still reads, with no leave taken off and no allocations, and says so", async () => {
    expect(db.modules.map((m) => m.id)).not.toContain("leave");
    const r = await db.call<Report>("maya", "get_utilisation", {});
    expect(r.notes).toEqual(["Leave isn't installed, so available hours don't take leave off."]);
    expect(r.team).toMatchObject({ availableHours: 288, billableHours: 222, utilisation: 77 });
    expect(r.availability).toMatchObject({ allocationsOn: false });
    expect(r.availability.rows.every((x) => x.allocated === null)).toBe(true);
  }, 60_000);
});

describe.skipIf(!hasDb)("pulse without allocations and leave (Postgres)", () => {
  let db: Awaited<ReturnType<typeof reportsDb>>;
  beforeAll(async () => { db = await reportsDb(["time", "leave", "allocations", "payroll"]); }, 240_000);
  afterAll(() => db?.t.drop());

  it("AC14 a card whose module is not installed says so and the pulse still reads", async () => {
    const p = await db.call<{ capacity: { state: string }; hours: { state: string }; away: { state: string }; utilisation: number }>("maya", "get_delivery_pulse", {});
    expect([p.capacity.state, p.hours.state, p.away.state, p.utilisation]).toEqual(["off", "off", "off", 77]);
  }, 60_000);
});
