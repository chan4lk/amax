import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { exportData } from "../server/export-data";
import { utilisation } from "../server/sections-people";
import type { Report } from "../server/view";
import { reportsDb } from "./db";

describe.skipIf(!hasDb)("100 the utilisation target is a setting every figure follows (Postgres)", () => {
  let db: Awaited<ReturnType<typeof reportsDb>>;
  beforeAll(async () => { db = await reportsDb(); }, 240_000);
  afterAll(() => db?.t.drop());

  it("AC-1 AC-2 changing the target changes the page's target, the lede, who is under it and the report's wording", async () => {
    const maya = await db.as("maya");
    const under = async () => utilisation.findings(await exportData(maya, {}, undefined, new Date(), "utilisation", undefined, ["utilisation"])).filter((f) => /under target/.test(f));
    const before = await db.call<Report>("maya", "get_utilisation", {});
    expect(before.target).toBe(80);
    expect(before.lede).toMatch(/84%, against an 80% target/);
    expect(await under()).toEqual([expect.stringMatching(/^Ayesha Rahman is at 73%, 7 points under target/)]);

    await db.call("maya", "set_utilisation_target", { target: 70 });
    const after = await db.call<Report>("maya", "get_utilisation", {});
    expect(after.target).toBe(70);
    expect(after.lede).toMatch(/84%, against a 70% target/);
    expect(await under()).toEqual([]);

    await db.call("maya", "set_utilisation_target", { target: 90 });
    expect((await db.call<Report>("maya", "get_utilisation", {})).lede).toMatch(/below the 90% target/);
    expect((await under()).map((f) => f.split(" is at ")[0]).sort()).toEqual(["Ayesha Rahman", "Kasun Dias"]);
  }, 120_000);

  it("AC-3 101 Admin, Leadership and PM are offered the tool and can change it; Finance and others are not", async () => {
    const offered = async (role?: "PM" | "Leadership" | "Finance") => db.registry.toolsFor(await db.as("maya", role)).some((x) => x.name === "set_utilisation_target");
    expect([await offered(), await offered("PM"), await offered("Leadership"), await offered("Finance")]).toEqual([true, true, true, false]);
    await db.call("maya", "set_utilisation_target", { target: 65 }, "PM");
    expect((await db.call<Report>("maya", "get_utilisation", {}, "PM")).target).toBe(65);
    const refused = await db.call<{ error?: string }>("maya", "set_utilisation_target", { target: 60 }, "Finance").catch((e: Error) => ({ error: e.message }));
    expect(JSON.stringify(refused)).toMatch(/forbidden|not allowed|permission|can't|unknown/i);
    expect((await db.call<Report>("maya", "get_utilisation", {}, "PM")).target).toBe(65);
  }, 90_000);
});
