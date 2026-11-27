import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { applyViewAs } from "@amax/auth";
import { mcpTools } from "../mcp";
import { ctxFor } from "../server/context";
import { createRelease, recordDeployment, setReleaseProposals, tagRelease, updateRelease, voidDeployment } from "../server/services";
import { getRelease, listReleases } from "../server/queries";
import { OPEN, releaseDb } from "./release-db";

describe.skipIf(!hasDb)("123 release tracking: updates, completion and reads (Postgres)", () => {
  let db: Awaited<ReturnType<typeof releaseDb>>;
  beforeAll(async () => { db = await releaseDb(); });
  afterAll(() => db?.t.drop());
  const deploy = (version: string, environment: string, status: "deployed" | "testing" | "rolled-back" = "deployed") => recordDeployment(db.admin(), { projectKey: "RTK", version, environment, status });

  it("AC-7 update edits an open release with history, tracks an old one only whole, and a completed one refuses every edit", async () => {
    expect(mcpTools.find((x) => x.name === "update_release")).toMatchObject({ scope: "write", service: updateRelease });
    await createRelease(db.admin(), { ...OPEN, projectKey: "RTK", version: "u1" });
    expect(await updateRelease(db.admin(), { projectKey: "RTK", version: "u1", startDate: "2099-01-01" })).toMatchObject({ status: "planned" });
    expect(await db.history("RTK", "u1")).toEqual(["null>in_progress:create", "in_progress>planned:update"]);
    await expect(updateRelease(db.admin(), { projectKey: "RTK", version: "u1", targetDate: "2026-01-01" })).rejects.toThrow(/before the start date/);
    await expect(updateRelease(db.admin(), { projectKey: "CON", version: "v2.5.0", category: "uat" })).rejects.toThrow(/isn't tracked yet: give its category, start and target together/);
    await updateRelease(db.admin(), { projectKey: "CON", version: "v2.5.0", name: "Portal", category: "prod", startDate: "2026-10-01", targetDate: "2099-12-31" });
    expect(await db.row("CON", "v2.5.0")).toMatchObject({ name: "Portal", category: "prod", status: "in_progress" });
    await deploy("u1", "UAT");
    await expect(updateRelease(db.admin(), { projectKey: "RTK", version: "u1", name: "x" })).rejects.toThrow(/RTK u1 is completed; it can't change/);
    await expect(setReleaseProposals(db.admin(), { projectKey: "RTK", version: "u1", proposalKeys: [] })).rejects.toThrow(/is completed/);
    await expect(tagRelease(db.admin(), { projectKey: "RTK", version: "u1", newVersion: "u1b" })).rejects.toThrow(/is completed/);
  });

  it("AC-8 a deployed record to the category environment completes it, on time or late; testing, rollbacks and other environments don't", async () => {
    await createRelease(db.admin(), { ...OPEN, projectKey: "RTK", version: "d1" });
    for (const [environment, status] of [["UAT", "testing"], ["UAT", "rolled-back"], ["Dev", "deployed"]] as const) await deploy("d1", environment, status);
    expect((await db.row("RTK", "d1")).status).toBe("in_progress");
    await deploy("d1", "UAT");
    expect(await db.row("RTK", "d1")).toMatchObject({ status: "completed", completion: "on_time" });
    expect((await db.history("RTK", "d1")).at(-1)).toBe("in_progress>completed:deployment");
    await createRelease(db.admin(), { ...OPEN, projectKey: "RTK", version: "d2", category: "prod", targetDate: "2026-10-10" });
    await deploy("d2", "Prod");
    expect(await db.row("RTK", "d2")).toMatchObject({ status: "completed", completion: "late" });
  });

  it("AC-9 (amended by 126) Completed is final: voiding any record, the completing one included, leaves the release as it is", async () => {
    await createRelease(db.admin(), { ...OPEN, projectKey: "RTK", version: "v1" });
    for (const environment of ["UAT", "Dev"]) await deploy("v1", environment);
    const before = await db.row("RTK", "v1");
    const voidIt = (environment: string, reason: string) => voidDeployment(db.admin(), { projectKey: "RTK", version: "v1", environment, reason });
    await voidIt("Dev", "dev redo");
    await voidIt("UAT", "wrong build");
    expect(await db.row("RTK", "v1")).toMatchObject({ status: "completed", completed_at: before.completed_at, completion: "on_time", completing_deployment_id: before.completing_deployment_id });
    expect(await db.history("RTK", "v1")).toEqual(["null>in_progress:create", "in_progress>completed:deployment"]);
    expect((await getRelease(db.sahan, "RTK", "v1"))!.completingVoided).toMatchObject({ reason: "wrong build" });
  });

  it("AC-10 reads carry the tracking fields and status history; the proposal count leaves out withdrawn ones", async () => {
    const [a, b] = [await db.proposal("RTK"), await db.proposal("RTK")];
    await createRelease(db.admin(), { ...OPEN, projectKey: "RTK", version: "r1", proposalKeys: [a, b] });
    await db.t.owner`update delivery.proposal set meta = meta || '{"withdrawn": true}'::jsonb where key = ${b}`;
    const listed = (await listReleases(db.sahan, { projectKey: "RTK" })).find((r) => r.version === "r1")!;
    expect(listed).toMatchObject({ name: "Open", category: "uat", startDate: "2026-10-01", targetDate: "2099-12-31", status: "in_progress", completedAt: null, proposals: 1 });
    expect((await getRelease(db.sahan, "RTK", "r1"))!.statusHistory).toMatchObject([{ from: null, to: "in_progress", source: "create" }]);
    expect((await listReleases(db.sahan, { projectKey: "CON" })).find((r) => r.version === "v2.4.0")).toMatchObject({ name: "v2.4.0", category: null, status: null });
  });

  it("AC-11 only an Admin or the project's PM may write; another tenant's release is never found", async () => {
    await createRelease(ctxFor(db.maya), { ...OPEN, projectKey: "CON", version: "pm1" });
    await expect(createRelease(ctxFor(db.maya), { ...OPEN, projectKey: "RTK", version: "pm2" })).rejects.toThrow(/data scope/);
    await expect(updateRelease(ctxFor(db.maya), { projectKey: "RTK", version: "d1", name: "x" })).rejects.toThrow(/data scope/);
    for (const role of ["Engineer", "Finance", "HR"] as const)
      await expect(updateRelease(ctxFor(applyViewAs(db.sahan, role)), { projectKey: "CON", version: "pm1", name: "x" })).rejects.toThrow(/forbidden|data scope/);
    const other = "00000000-0000-4000-8000-000000000123";
    await db.t.owner`insert into core.tenant (id, name) values (${other}, 'Elsewhere')`;
    const [p] = await db.t.owner`insert into delivery.project (tenant_id, key, name, client, billing, color) values (${other}, 'ELS', 'e', 'x', 'internal', 'mint') returning id`;
    const [r] = await db.t.owner`insert into delivery.release (tenant_id, project_id, version, name) values (${other}, ${p.id}, 'v1', 'v1') returning id`;
    expect(await getRelease(db.sahan, undefined, undefined, r.id as string)).toBeNull();
    expect((await listReleases(db.sahan)).some((x) => x.id === r.id)).toBe(false);
  });
});
