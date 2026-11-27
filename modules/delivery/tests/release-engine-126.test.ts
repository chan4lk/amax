import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { contextFor } from "@amax/core/server";
import { createRelease, recordDeployment } from "../server/services";
import { evaluateReleases } from "../server/release-check";
import { getRelease, type ReleaseRow } from "../server/queries";
import { mapPill, nextStep } from "../ui/ReleasesPage";
import { why } from "../ui/ReleaseHistory";
import { OPEN, releaseDb, T } from "./release-db";

describe.skipIf(!hasDb)("126 the release status engine (Postgres)", () => {
  let db: Awaited<ReturnType<typeof releaseDb>>;
  const pin = (day: string) => db.t.owner`insert into delivery.clock_pin (tenant_id, today) values (${T}, ${day}) on conflict (tenant_id) do update set today = excluded.today`;
  const check = () => evaluateReleases(contextFor.job(T, "delivery.release-status"), {});
  const create = (version: string, more = {}) => createRelease(db.admin(), { ...OPEN, projectKey: "RTK", version, startDate: "2026-12-01", targetDate: "2026-12-10", ...more });
  const deploy = (version: string, environment: string, status: "deployed" | "testing" | "rolled-back" | "failed" = "deployed") => recordDeployment(db.admin(), { projectKey: "RTK", version, environment, status });
  const status = async (version: string) => (await db.row("RTK", version)).status;
  beforeAll(async () => { db = await releaseDb(); await pin("2026-11-20"); }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC-4 AC-5 AC-7 the check moves releases as dates pass, once, with the reason, and never touches a completed one", async () => {
    await create("s1");
    await create("s2", { category: "dev" });
    expect([await status("s1"), await status("s2")]).toEqual(["planned", "planned"]);
    await pin("2026-12-05");
    expect(await check()).toEqual({ changed: 2 });
    await deploy("s2", "Dev");
    await pin("2026-12-11");
    expect(await check()).toEqual({ changed: 1 });
    expect(await check()).toEqual({ changed: 0 });
    expect([await status("s1"), await status("s2")]).toEqual(["overdue", "completed"]);
    expect(await db.history("RTK", "s1")).toEqual(["null>planned:create", "planned>in_progress:schedule", "in_progress>overdue:schedule"]);
    const h = (await getRelease(db.sahan, "RTK", "s1"))!.statusHistory;
    expect(h.slice(1).map((c) => [why(c, []), c.by])).toEqual([["Start date reached", "amax"], ["Target date passed", "amax"]]);
  });

  it("AC-6 the day is the project's entity zone, UTC without one", async () => {
    const [e] = await db.t.owner`select id from core.legal_entity where tenant_id = ${T} limit 1`;
    await db.t.owner`insert into workflows.entity_zone (legal_entity_id, tenant_id, timezone) values (${e.id}, ${T}, 'Pacific/Kiritimati') on conflict (legal_entity_id) do update set timezone = excluded.timezone`;
    await db.t.owner`update delivery.project set legal_entity_id = ${e.id} where key = 'RTK'`;
    await pin("2026-11-20");
    await create("z1", { targetDate: "2026-12-10" });
    await pin("2026-12-10");
    await check();
    expect(await status("z1")).toBe("overdue");
    await db.t.owner`update delivery.project set legal_entity_id = null where key = 'RTK'`;
  });

  it("AC-1 AC-3 failed, testing, rolled-back and other environments don't complete; once completed, nothing reopens it", async () => {
    await pin("2026-12-05");
    await create("f1", { category: "uat" });
    for (const [env, s] of [["UAT", "failed"], ["UAT", "testing"], ["UAT", "rolled-back"], ["Dev", "deployed"]] as const) await deploy("f1", env, s);
    expect(await status("f1")).toBe("in_progress");
    await deploy("f1", "UAT");
    for (const s of ["rolled-back", "failed"] as const) await deploy("f1", "UAT", s);
    expect(await db.row("RTK", "f1")).toMatchObject({ status: "completed", completion: "on_time" });
  });

  it("AC-2 a failed stage reads like a rollback: its own word on the map, and Retry next", () => {
    const stage = (environment: string, position: number, s: string | null) => ({ environment, environmentId: environment, deploymentId: null, position, isProd: environment === "Prod", status: s, at: s ? "2026-10-14T11:00:00Z" : null, note: null, run: null });
    const r = { stages: [stage("Dev", 1, "deployed"), stage("UAT", 2, "failed"), stage("Prod", 3, null)] } as unknown as ReleaseRow;
    expect(mapPill(r)).toEqual({ kind: "back", text: "Failed Wed Oct 14" });
    expect(nextStep(r)).toMatchObject({ label: "Retry UAT" });
  });
});
