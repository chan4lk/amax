import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase, tablesMissingRls } from "@amax/db/testdb";
import { configureRuntime } from "@amax/core/server";
import { applyViewAs, installAuthorizer, setGrants, setViewerScopeResolvers, viewerForUser, type Viewer } from "@amax/auth";
import { authFixtures } from "@amax/auth/fixtures";
import { loadFixtures, lumen } from "@amax/testing";
import manifest from "../module";
import { EVENTS, getProjectRef, listProjectRefs, managedProjectIds, PHASES } from "../contracts";
import { mcpTools } from "../mcp";
import { ctxFor } from "../server/context";
import { getProject, listProjects, listProposals, listReleases, phaseCounts, shippedPerWeek, today, weeklyThroughput } from "../server/queries";
import { moveProposal, recordDeployment } from "../server/services";
import { nextStep, onActiveMap } from "../ui/ReleasesPage";

const T = lumen.tenant.id;

describe("AC-5 contract shape", () => {
  it("exports phases and event names", () => {
    expect(PHASES).toEqual(["proposed", "planned", "building", "verified", "released"]);
    expect(EVENTS).toEqual({ releaseDeployed: "delivery.release.deployed", proposalPhaseChanged: "delivery.proposal.phase_changed", proposalRekeyed: "delivery.proposal.rekeyed", proposalWithdrawn: "delivery.proposal.withdrawn", taskDone: "delivery.task.done", taskReopened: "delivery.task.reopened", commitTime: "delivery.commit.time", ownerChanged: "delivery.proposal.owner_changed" });
    expect(manifest.events?.emits).toEqual(Object.values(EVENTS));
  });
  it("AC-4 declares the five MCP tools and three chat intents", () => {
    expect(mcpTools.map((t) => t.name)).toEqual(expect.arrayContaining(["list_projects", "get_project", "list_proposals", "get_release", "record_deployment"]));
    expect((manifest.chatIntents as { id: string }[]).map((c) => c.id)).toEqual(expect.arrayContaining(["delivery.new-project", "delivery.new-proposal", "delivery.new-release"]));
  });
});

describe.skipIf(!hasDb)("delivery against Postgres", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  let maya: Viewer, nimal: Viewer, liam: Viewer, sahan: Viewer;
  const as = async (email: string) => {
    const [u] = await withTenant(app, T, (tx) => tx.execute(sql`select id from auth.user where email = ${email}`));
    const v = (await withTenant(app, T, (tx) => viewerForUser(tx, T, u.id as string)))!;
    return v;
  };

  beforeAll(async () => {
    t = await migratedDatabase();
    app = t.app();
    configureRuntime({ db: app, auditKey: "k".repeat(32) });
    setGrants([manifest]);
    setViewerScopeResolvers([manifest.viewerScopes!]);
    installAuthorizer();
    await loadFixtures(app, [{ id: "auth", fixtures: [authFixtures] }, manifest], lumen);
    [maya, nimal, liam, sahan] = await Promise.all(["maya", "nimal", "liam", "sahan"].map((k) => as(`${k}@lumenlabs.test`)));
    // Maya is also an Admin in the fixtures; act as her PM role so data scopes apply.
    maya = applyViewAs(maya, "PM");
  });
  afterAll(() => t?.drop());

  it("AC-1 the delivery schema is tenant-isolated", async () => {
    expect(await tablesMissingRls(t.owner)).toEqual([]);
  });

  it("every retention entry names real columns of its table, and an idle clock has updated_at (review round 4)", async () => {
    const missing: string[] = [];
    for (const r of manifest.retention ?? []) {
      const [schema, table] = r.table.split(".");
      const cols = new Set((await t.owner`select column_name from information_schema.columns where table_schema = ${schema} and table_name = ${table}`).map((c) => c.column_name as string));
      for (const c of [...r.fields, ...r.start.at, ...(r.start.idle ? ["updated_at"] : [])]) if (!cols.has(c)) missing.push(`${r.table}.${c}`);
    }
    expect(missing).toEqual([]);
  });

  it("closing a project records when; reopening clears it (review round 4)", async () => {
    await t.owner`update delivery.project set status = 'closed' where key = 'CON'`;
    expect((await t.owner`select closed_at from delivery.project where key = 'CON'`)[0].closed_at).not.toBeNull();
    await t.owner`update delivery.project set status = 'active' where key = 'CON'`;
    expect((await t.owner`select closed_at from delivery.project where key = 'CON'`)[0].closed_at).toBeNull();
    // Created closed (fixtures, imports): recorded too (review round 5).
    await t.owner`insert into delivery.project (tenant_id, key, name, client, billing, color, status) values (${T}, 'OLDC', 'old', 'x', 'internal', 'mint', 'closed')`;
    expect((await t.owner`select closed_at from delivery.project where key = 'OLDC'`)[0].closed_at).not.toBeNull();
    // Already closed before the migration (closed_at null): its backfill statement fills it.
    await t.owner`update delivery.project set closed_at = null where key = 'OLDC'`;
    const migration = readFileSync(join(__dirname, "../db/migrations/0007_project_closed_at_insert.sql"), "utf8");
    await t.owner.unsafe(migration.match(/^update delivery\.project set closed_at.*$/m)![0]);
    expect((await t.owner`select closed_at from delivery.project where key = 'OLDC'`)[0].closed_at).not.toBeNull();
  });

  it("AC-1 fixtures follow fixtures.md", async () => {
    const projects = await listProjects(maya);
    expect(projects.map((p) => [p.key, p.client, p.sprintDone, p.sprintTotal])).toEqual([["CON", "Contoso", 9, 16], ["FLT", "Wide World Importers", 5, 16], ["HRI", "Northwind HR", 14, 17]]);
    expect(projects.reduce((n, p) => n + (p.contractValue ?? 0), 0)).toBe(774000);
    const counts = await phaseCounts(maya, new Date("2026-10-16T15:00:00Z"));
    expect(counts).toEqual({ proposed: 6, planned: 4, building: 18, verified: 9, inFlight: 37, releasedThisMonth: 5, month: "October" });
    const board = (await getProject(maya, "CON"))!.proposals;
    const lane = (ph: string) => board.filter((p) => p.phase === ph).map((p) => p.key).sort();
    expect([lane("proposed"), lane("planned"), lane("building"), lane("verified"), lane("released")]).toEqual([["CON-016", "CON-017"], ["CON-013"], ["CON-011", "CON-014"], ["CON-010", "CON-012"], ["CON-009"]]);
    const rel = await listReleases(maya);
    expect(rel.map((r) => `${r.projectKey} ${r.version} ${r.proposals}`)).toEqual(["CON v2.5.0 3", "CON v2.4.0 2", "FLT v1.8.0 5", "HRI v0.9.2 4",
      "CON v2.3.0 1", "FLT v1.7.0 2", "HRI v0.9.0 3", "FLT v1.7.1 1", "HRI v0.9.1 4", "FLT v1.7.2 3", "FLT v1.7.3 1"]);
    // The Active map is the mock's three rows: CON and FLT in flight, HRI's live v0.9.2; older live releases drop off.
    expect(onActiveMap(rel, new Date("2026-10-16T15:00:00Z")).map((r) => `${r.projectKey} ${r.version}`)).toEqual(["CON v2.4.0", "FLT v1.8.0", "HRI v0.9.2"]);
    // Every released proposal, in every project, has a real release that reached Prod (review rounds 1 and 2).
    const orphans = await withTenant(app, T, (tx) => tx.execute(sql`select p.key from delivery.proposal p where p.phase = 'released' and not exists (
      select 1 from delivery.deployment d join delivery.environment e on e.id = d.environment_id where d.release_id = p.release_id and e.is_prod and d.status = 'deployed' and d.voided_at is null)`));
    expect(orphans.map((o) => o.key)).toEqual([]);
    expect((await listProposals(maya, { projectKey: "CON", phase: "released" })).map((p) => [p.key, p.release])).toEqual([["CON-009", "v2.3.0"]]);
  });

  it("weekly charts: shipped counts released_at like 'Released this month'; the portfolio row is not double counted; missing weeks are null (review round 1)", async () => {
    const now = new Date("2026-10-16T15:00:00Z");
    const shipped = await shippedPerWeek(maya, now);
    expect(shipped.labels).toEqual(["W35", "W36", "W37", "W38", "W39", "W40", "W41", "W42"]);
    expect(shipped.values).toEqual([2, 3, 1, 4, 3, 5, 1, 0]);
    // Same source as the phase card: October's weeks sum to the month's count once September's days are out.
    const [{ n }] = await withTenant(app, T, (tx) => tx.execute(sql`select count(*)::int as n from delivery.proposal where phase = 'released' and released_at >= '2026-09-28' and released_at < '2026-10-01'`));
    expect(shipped.values.slice(5).reduce((a, b) => a + b, 0) - Number(n)).toBe((await phaseCounts(maya, now)).releasedThisMonth);
    const before = await weeklyThroughput(maya, now);
    expect(before.done).toEqual([24, 29, 31, 27, 33, 35, 30, 38]);
    // Per-project rows beside the portfolio row (ingestion writes both) don't change the portfolio.
    const [con] = await withTenant(app, T, (tx) => tx.execute(sql`select id from delivery.project where key = 'CON'`));
    await withTenant(app, T, (tx) => tx.execute(sql`insert into delivery.weekly_stat (tenant_id, project_id, week, planned, done) values (${T}, ${con.id}, '2026-10-12', 12, 11)`));
    try {
      expect((await weeklyThroughput(maya, now)).done).toEqual(before.done);
    } finally {
      await withTenant(app, T, (tx) => tx.execute(sql`delete from delivery.weekly_stat where project_id = ${con.id}`));
    }
    // A week with no roll-up is null, never 0; a window with none at all is all nulls.
    const later = await weeklyThroughput(maya, new Date("2026-11-03T15:00:00Z"));
    expect(later.labels.slice(-3)).toEqual(["W43", "W44", "W45"]);
    expect(later.done.slice(-3)).toEqual([null, null, null]);
    expect((await weeklyThroughput(maya, new Date("2027-06-01T15:00:00Z"))).planned.every((x) => x === null)).toBe(true);
  });

  it("today is the tenant's clock pin, else the real date; the windows follow it (review round 2)", async () => {
    const before = Date.now();
    expect((await today(maya)).getTime()).toBeGreaterThanOrEqual(before);
    await withTenant(app, T, (tx) => tx.execute(sql`insert into delivery.clock_pin (tenant_id, today) values (${T}, '2026-10-16')`));
    try {
      expect((await today(maya)).toISOString()).toBe("2026-10-16T15:00:00.000Z");
      expect((await shippedPerWeek(maya)).labels.at(-1)).toBe("W42");
      expect((await weeklyThroughput(maya)).done.at(-1)).toBe(38);
      expect((await phaseCounts(maya)).releasedThisMonth).toBe(5);
      // Windows stop at the pinned day: a release recorded after it is not counted (final review).
      await withTenant(app, T, (tx) => tx.execute(sql`update delivery.proposal set released_at = '2026-10-20T10:00:00Z' where key = 'HRI-100'`));
      try {
        expect((await phaseCounts(maya)).releasedThisMonth).toBe(4);
        expect((await shippedPerWeek(maya)).values.slice(-3)).toEqual([4, 1, 0]);
      } finally {
        await withTenant(app, T, (tx) => tx.execute(sql`update delivery.proposal set released_at = '2026-10-01T09:00:00Z' where key = 'HRI-100'`));
      }
      // A pin is a date: anything else is refused by the column.
      await expect(withTenant(app, T, (tx) => tx.execute(sql`update delivery.clock_pin set today = 'yesterday-ish'`))).rejects.toThrow();
    } finally {
      await withTenant(app, T, (tx) => tx.execute(sql`delete from delivery.clock_pin`));
    }
  });

  it("AC-5 contract lookups", async () => {
    const refs = await withTenant(app, T, (tx) => listProjectRefs(tx));
    expect(refs.map((r) => r.key)).toEqual(["CON", "FLT", "HRI"]);
    expect((await withTenant(app, T, (tx) => getProjectRef(tx, "FLT")))?.name).toBe("Fleet Tracker");
    expect(maya.managedProjects).toHaveLength(1);
  });

  it("AC-3 Move is explicit, scoped to the PM's projects and audited with an event", async () => {
    await moveProposal(ctxFor(maya), { key: "CON-016", to: "planned" });
    await expect(moveProposal(ctxFor(maya), { key: "FLT-015", to: "planned" })).rejects.toThrow(/outside your data scope/);
    await expect(moveProposal(ctxFor(liam), { key: "CON-017", to: "planned" })).rejects.toThrow(/forbidden/);
    const [audit] = await withTenant(app, T, (tx) => tx.execute(sql`select before, after, actor from core.audit_event where action = 'delivery.proposal.move' order by seq desc limit 1`));
    expect(audit).toMatchObject({ before: { phase: "proposed" }, after: { phase: "planned" }, actor: `user:${maya.userId}` });
    const [ev] = await withTenant(app, T, (tx) => tx.execute(sql`select payload from core.event where name = ${EVENTS.proposalPhaseChanged} order by created_at desc limit 1`));
    expect(ev.payload).toMatchObject({ key: "CON-016", from: "proposed", to: "planned" });
  });

  it("AC-3 Released means Prod: a board move can't release, a Prod deployment does", async () => {
    await expect(moveProposal(ctxFor(sahan), { key: "CON-012", to: "released" as never })).rejects.toThrow(/invalid input/);
    await recordDeployment(ctxFor(sahan), { projectKey: "CON", version: "v2.4.0", environment: "UAT", status: "deployed" });
    expect((await listProposals(sahan, { projectKey: "CON", phase: "released" })).map((p) => p.key)).toEqual(["CON-009"]);
    const r = await recordDeployment(ctxFor(sahan), { projectKey: "CON", version: "v2.4.0", environment: "Prod" });
    expect(r.released).toBe(true);
    expect((await listProposals(sahan, { projectKey: "CON", phase: "released" })).map((p) => p.key).sort()).toEqual(["CON-009", "CON-010", "CON-012"]);
    await expect(moveProposal(ctxFor(sahan), { key: "CON-010", to: "building" })).rejects.toThrow(/in Prod/);
    const events = await withTenant(app, T, (tx) => tx.execute(sql`select payload from core.event where name = ${EVENTS.releaseDeployed} order by created_at`));
    expect(events.map((e) => (e.payload as { released: boolean }).released)).toEqual([false, true]);
  });

  it("next release step: promote, retry after a rollback, nothing once live", async () => {
    const rel = await listReleases(maya);
    const step = (key: string) => nextStep(rel.find((r) => `${r.projectKey} ${r.version}` === key)!);
    expect(step("FLT v1.8.0")).toMatchObject({ label: "Retry UAT", environment: "UAT" });
    expect(step("HRI v0.9.2")).toBeNull();
    expect(step("CON v2.5.0")).toMatchObject({ label: "Deploy to Dev" });
  });

  it("AC-4 MCP tools run as the caller: record_deployment needs PM on that project or Admin", async () => {
    const tool = (n: string) => mcpTools.find((t) => t.name === n)!;
    expect(((await tool("list_projects").run(nimal as never, {} as never, "mcp")) as unknown[]).length).toBe(3);
    await expect(tool("record_deployment").run(maya as never, { projectKey: "FLT", version: "v1.8.0", environment: "UAT" } as never, "mcp")).rejects.toThrow(/data scope/);
    const [row] = await withTenant(app, T, (tx) => tx.execute(sql`select source from core.audit_event where action = 'delivery.deployment.record' order by seq desc limit 1`));
    expect(row.source).toBe("ui");
    await tool("record_deployment").run(sahan as never, { projectKey: "FLT", version: "v1.8.0", environment: "UAT" } as never, "mcp");
    const [mcp] = await withTenant(app, T, (tx) => tx.execute(sql`select source from core.audit_event where action = 'delivery.deployment.record' order by seq desc limit 1`));
    expect(mcp.source).toBe("mcp");
  });

  it("roles without delivery:read are refused", async () => {
    await expect(listProjects(liam)).rejects.toThrow(/forbidden/);
  });
});
