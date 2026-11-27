import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@amax/db";
import { hasDb, tablesMissingRls } from "@amax/db/testdb";
import { createProject, createRelease, recordDeployment, removeEnvironment, setReleaseProposals, updateRelease } from "../server/services";
import { getRelease } from "../server/queries";
import { OPEN, releaseDb, T } from "./release-db";

describe.skipIf(!hasDb)("123 release tracking: data and create (Postgres)", () => {
  let db: Awaited<ReturnType<typeof releaseDb>>;
  beforeAll(async () => { db = await releaseDb(); });
  afterAll(() => db?.t.drop());

  it("AC-1 old releases keep their version and read their name as it, untracked; the table refuses a half-tracked row", async () => {
    expect(await db.row("CON", "v2.4.0")).toMatchObject({ version: "v2.4.0", category: null, status: null, start_date: null });
    expect((await getRelease(db.sahan, "CON", "v2.4.0"))!.name).toBe("v2.4.0");
    const [p] = await db.t.owner`select id from delivery.project where key = 'RTK'`;
    await expect(db.t.owner`insert into delivery.release (tenant_id, project_id, version, category) values (${T}, ${p.id}, 'half', 'dev')`).rejects.toThrow(/release_tracked_whole/);
    await expect(db.t.owner`insert into delivery.release (tenant_id, project_id, version, name, category, status, start_date, target_date)
      values (${T}, ${p.id}, 'back', 'b', 'dev', 'planned', '2026-12-02', '2026-12-01')`).rejects.toThrow(/release_dates/);
  });

  it("AC-2 status history: one row per status taken, none for an unchanged one, append-only for the app, tenant RLS", async () => {
    await createRelease(db.admin(), { ...OPEN, projectKey: "RTK", version: "h1" });
    await updateRelease(db.admin(), { projectKey: "RTK", version: "h1", name: "Renamed" });
    expect(await db.history("RTK", "h1")).toEqual(["null>in_progress:create"]);
    const denied = (q: ReturnType<typeof sql>) => withTenant(db.app, T, (tx) => tx.execute(q)).then(() => "allowed", (e: Error & { cause?: Error }) => e.cause?.message ?? e.message);
    expect(await denied(sql`delete from delivery.release_status_history`)).toMatch(/permission denied/);
    expect(await denied(sql`update delivery.release_status_history set to_status = 'completed'`)).toMatch(/permission denied/);
    expect((await tablesMissingRls(db.t.owner)).filter((x) => x.startsWith("delivery."))).toEqual([]);
  });

  it("AC-4 create takes name, category and dates, refuses bad ones clearly, returns status and href, and is audited", async () => {
    const create = (more: object) => createRelease(db.admin(), { ...OPEN, projectKey: "RTK", version: "c1", ...more });
    expect(await create({ startDate: "2099-01-01" })).toMatchObject({ status: "planned", href: "/delivery/releases/RTK/c1" });
    await expect(create({ version: "c2", startDate: "2026-12-02", targetDate: "2026-12-01" })).rejects.toThrow(/target date \(2026-12-01\) is before the start date/);
    await expect(create({ version: "c3", category: "QA" })).rejects.toThrow(/Dev, UAT or Prod/);
    await expect(create({ version: "c4", name: " " })).rejects.toThrow(/needs a name/);
    await expect(create({})).rejects.toThrow(/already has a release c1/);
    await createProject(db.admin(), { key: "NOU", name: "No UAT", client: "x", billing: "internal" });
    await removeEnvironment(db.admin(), { projectKey: "NOU", name: "UAT" });
    await expect(createRelease(db.admin(), { ...OPEN, projectKey: "NOU", version: "v1" })).rejects.toThrow(/NOU has no UAT environment/);
    const [a] = await db.t.owner`select after from core.audit_event where action = 'delivery.release.create' and after->>'version' = 'c1'`;
    expect(a.after).toMatchObject({ name: "Open", category: "uat", startDate: "2099-01-01" });
  });

  it("AC-5 only Verified or Released proposals go in; one already in the release keeps its place", async () => {
    const proposed = await db.proposal("RTK", false);
    await expect(createRelease(db.admin(), { ...OPEN, projectKey: "RTK", version: "e1", proposalKeys: [proposed] }))
      .rejects.toThrow(new RegExp(`${proposed} is Proposed; only Verified or Released`));
    await createRelease(db.admin(), { ...OPEN, projectKey: "RTK", version: "e1", proposalKeys: [await db.proposal("RTK")] });
    await expect(setReleaseProposals(db.admin(), { projectKey: "CON", version: "v2.5.0", proposalKeys: ["CON-014"] })).resolves.toBeTruthy();
  });

  it("AC-6 a proposal in another release is refused by both writers, naming it; once that one completes it moves only when asked (129)", async () => {
    const p = await db.proposal("RTK");
    await createRelease(db.admin(), { ...OPEN, projectKey: "RTK", version: "f1", proposalKeys: [p] });
    await createRelease(db.admin(), { ...OPEN, projectKey: "RTK", version: "f2" });
    const refusal = new RegExp(`${p} is already in RTK f1 \\(UAT, In progress\\); confirm moving it, or take it out there first`);
    await expect(createRelease(db.admin(), { ...OPEN, projectKey: "RTK", version: "f3", proposalKeys: [p] })).rejects.toThrow(refusal);
    await expect(setReleaseProposals(db.admin(), { projectKey: "RTK", version: "f2", proposalKeys: [p] })).rejects.toThrow(refusal);
    await expect(createRelease(db.admin(), { ...OPEN, projectKey: "CON", version: "v9.9.9", proposalKeys: ["CON-010"] })).rejects.toThrow(/already in CON v2.4.0 \(Untracked\)/);
    await recordDeployment(db.admin(), { projectKey: "RTK", version: "f1", environment: "UAT" });
    await expect(setReleaseProposals(db.admin(), { projectKey: "RTK", version: "f2", proposalKeys: [p] })).rejects.toThrow(new RegExp(`${p} is already in RTK f1 \\(UAT, Completed\\)`));
    await setReleaseProposals(db.admin(), { projectKey: "RTK", version: "f2", proposalKeys: [p], reassign: [p] });
    expect((await getRelease(db.sahan, "RTK", "f2"))!.proposals.find((x) => x.key === p)!.included).toBe(true);
  });
});
