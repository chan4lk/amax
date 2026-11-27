import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { withTenant } from "@amax/db";
import { hasDb, repoRoot } from "@amax/db/testdb";
import { contextFor } from "@amax/core/server";
import { discoverModules } from "@amax/core/registry";
import { approvedLeave } from "../contracts";
import { ctxFor } from "../server/context";
import { requestLeave } from "../server/request";
import { releaseHandler } from "../server/releases";
import { leaveDb, T } from "./db";

const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? (d.name === "node_modules" ? [] : files(join(dir, d.name))) : /\.tsx?$/.test(d.name) ? [join(dir, d.name)] : []);
const others = (keep: string[]) => discoverModules(join(repoRoot, "modules")).filter((m) => !keep.includes(m));

describe("module standard", () => {
  it("AC4 can be switched off: nothing outside modules/leave imports it", () => {
    expect(discoverModules(join(repoRoot, "modules"), ["leave"])).not.toContain("leave");
    // Other modules may integrate through the contract (014 payroll reads it there), never the internals.
    expect(others(["leave"]).flatMap((m) => files(join(repoRoot, "modules", m))).filter((f) => /@amax\/leave(?!\/contracts")/.test(readFileSync(f, "utf8")))).toEqual([]);
  });
});

describe.skipIf(!hasDb)("contracts, with and without delivery (Postgres)", () => {
  const dbs: Awaited<ReturnType<typeof leaveDb>>[] = [];
  afterAll(() => Promise.all(dbs.map((d) => d.t.drop())));

  it("AC4 without delivery a request still works and nothing clashes; with it, release events open and close windows", async () => {
    const bare = await leaveDb(others(["hr", "leave"]));
    dbs.push(bare);
    expect(bare.modules.map((m) => m.id)).toEqual(["hr", "leave"]);
    expect(await requestLeave(ctxFor(await bare.as("kasun")), { type: "annual", startsOn: "2026-10-22" })).toMatchObject({ status: "pending", clashes: [] });

    const full = await leaveDb();
    dbs.push(full);
    const [hri] = await full.q(sql`select id from delivery.project where key = 'HRI'`);
    const deployed = (released: boolean, status = "deployed") => withTenant(full.app, T, (tx) => releaseHandler.handle({ tx, tenantId: T, event: { id: "e1", name: releaseHandler.event,
      payload: { releaseId: hri.id, projectId: hri.id, version: "v0.9.3", environment: released ? "Prod" : "UAT", status, released } } }));
    for (const [status, retry] of [["rolled-back", true], ["failed", true], ["testing", false]] as const) {
      await deployed(false, status);
      expect([status, (await full.q(sql`select retry from leave.release_window where version = 'v0.9.3'`))[0]?.retry]).toEqual([status, retry]);
    }
    await deployed(false);
    expect(await full.q(sql`select project_title, environment, to_char(starts_on, 'YYYY-MM-DD') as f, to_char(ends_on, 'YYYY-MM-DD') as t from leave.release_window where version = 'v0.9.3'`))
      .toEqual([{ project_title: "HR Insights", environment: "UAT", f: "2026-10-16", t: "2026-10-30" }]);
    await deployed(true);
    expect(await full.q(sql`select 1 from leave.release_window where version = 'v0.9.3'`)).toEqual([]);
  }, 240_000);

  it("AC3 approvedLeave gives payroll every approved day, a viewer only theirs, and fails closed for a hand-built system context", async () => {
    const db = dbs[1];
    const oct16 = { from: "2026-10-16", to: "2026-10-16" };
    const all = await withTenant(db.app, T, (tx) => approvedLeave(tx, contextFor.job(T, "payroll.test"), oct16));
    expect(all.map((l) => l.type).sort()).toEqual(["annual", "annual", "annual", "casual", "casual", "medical"]);
    expect(all.every((l) => l.paid)).toBe(true);
    const ayesha = await db.as("ayesha");
    expect((await withTenant(db.app, T, (tx) => approvedLeave(tx, ayesha, oct16))).map((l) => [l.type, l.days])).toEqual([["casual", 1]]);
    const fake = { tenantId: T, actor: { id: "job:x", kind: "system" as const }, source: "job" as const };
    await expect(withTenant(db.app, T, (tx) => approvedLeave(tx, fake, oct16))).rejects.toThrow(/data scope/);
  });
});
