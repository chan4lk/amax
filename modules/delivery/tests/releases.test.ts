import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import { configureRuntime } from "@amax/core/server";
import { applyViewAs, installAuthorizer, setGrants, viewerForUser, type Viewer, setViewerScopeResolvers } from "@amax/auth";
import { authFixtures } from "@amax/auth/fixtures";
import { loadFixtures, lumen } from "@amax/testing";
import delivery from "../module";
import { managedProjectIds } from "../contracts";
import { ctxFor } from "../server/context";
import { getRelease, listEnvironments, listProposals, listReleases } from "../server/queries";
import { createProject, createRelease, recordDeployment, removeEnvironment, setReleaseProposals, tagRelease, upsertEnvironment, voidDeployment } from "../server/services";
import { tracked, verify } from "./release-fields";

const T = lumen.tenant.id;

describe.skipIf(!hasDb)("042 release management (Postgres)", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  let maya: Viewer, sahan: Viewer;
  const as = async (email: string) => {
    const [u] = await withTenant(app, T, (tx) => tx.execute(sql`select id from auth.user where email = ${email}`));
    const v = (await withTenant(app, T, (tx) => viewerForUser(tx, T, u.id as string)))!;
    return v;
  };
  const envNames = async (key: string) => (await listEnvironments(sahan, key)).map((e) => `${e.name}${e.isProd ? "*" : ""}`);

  beforeAll(async () => {
    t = await migratedDatabase();
    app = t.app();
    configureRuntime({ db: app, auditKey: "k".repeat(32) });
    setGrants([delivery]);
    // Managed projects come from the real resolver, as in the app (not planted on the viewer).
    setViewerScopeResolvers([delivery.viewerScopes!]);
    installAuthorizer();
    await loadFixtures(app, [{ id: "auth", fixtures: [authFixtures] }, delivery], lumen);
    maya = applyViewAs(await as("maya@lumenlabs.test"), "PM");
    sahan = await as("sahan@lumenlabs.test");
  });
  afterAll(() => t?.drop());

  it("AC-1 each project has its own environments; new projects get Dev, QA, UAT, Prod", async () => {
    expect(await envNames("CON")).toEqual(["Dev", "QA", "UAT", "Prod*"]);
    await createProject(ctxFor(sahan), { key: "LAB", name: "Lab", client: "Internal", billing: "internal" });
    expect(await envNames("LAB")).toEqual(["Dev", "QA", "UAT", "Prod*"]);
  });

  it("AC-1 add, rename, reorder, mark Prod or none, and remove only when unused", async () => {
    await upsertEnvironment(ctxFor(sahan), { projectKey: "LAB", name: "UAT", rename: "Staging" });
    await upsertEnvironment(ctxFor(sahan), { projectKey: "LAB", name: "Preview", position: 2 });
    expect(await envNames("LAB")).toEqual(["Dev", "Preview", "QA", "Staging", "Prod*"]);
    await upsertEnvironment(ctxFor(sahan), { projectKey: "LAB", name: "Staging", isProd: true });
    expect(await envNames("LAB")).toEqual(["Dev", "Preview", "QA", "Staging*", "Prod"]);
    await upsertEnvironment(ctxFor(sahan), { projectKey: "LAB", name: "Staging", isProd: false });
    expect((await envNames("LAB")).some((n) => n.endsWith("*"))).toBe(false);
    await removeEnvironment(ctxFor(sahan), { projectKey: "LAB", name: "Prod" });
    await expect(removeEnvironment(ctxFor(sahan), { projectKey: "CON", name: "Dev" })).rejects.toThrow(/deployment records? .*kept as history/);
    await expect(upsertEnvironment(ctxFor(maya), { projectKey: "FLT", name: "X" })).rejects.toThrow(/data scope/);
  });

  it("AC-2 a Dev-only project: deploy to any environment; no Prod means nothing is released", async () => {
    await createRelease(ctxFor(sahan), { ...tracked("dev"), projectKey: "LAB", version: "v0.1.0", proposalKeys: [] });
    const r = await recordDeployment(ctxFor(sahan), { projectKey: "LAB", version: "v0.1.0", environment: "staging" });
    expect(r.released).toBe(false);
    await expect(recordDeployment(ctxFor(sahan), { projectKey: "LAB", version: "v0.1.0", environment: "Prod" })).rejects.toThrow(/no environment Prod/);
  });

  it("AC-2 tag and proposals are editable; Prod can be reached directly", async () => {
    await verify(t.owner, "CON-016");
    await tagRelease(ctxFor(maya), { projectKey: "CON", version: "v2.5.0", newVersion: "v2.6.0" });
    await setReleaseProposals(ctxFor(maya), { projectKey: "CON", version: "v2.6.0", proposalKeys: ["CON-014", "CON-016"] });
    const rel = await getRelease(maya, "CON", "v2.6.0");
    expect(rel!.proposals.filter((p) => p.included).map((p) => p.key)).toEqual(["CON-014", "CON-016"]);
    const out = await recordDeployment(ctxFor(maya), { projectKey: "CON", version: "v2.6.0", environment: "Prod" });
    expect(out.released).toBe(true);
    expect((await listProposals(maya, { projectKey: "CON", phase: "released" })).map((p) => p.key).sort()).toEqual(["CON-009", "CON-014", "CON-016"]);
  });

  it("AC-3 voiding the only Prod deployment un-releases; history keeps the voided record; the map ignores it", async () => {
    await voidDeployment(ctxFor(maya), { projectKey: "CON", version: "v2.6.0", environment: "Prod", reason: "recorded by mistake" });
    expect((await listProposals(maya, { projectKey: "CON", phase: "released" })).map((p) => p.key)).toEqual(["CON-009"]);
    const rel = await getRelease(maya, "CON", "v2.6.0");
    expect(rel!.history[0]).toMatchObject({ environment: "Prod", voidReason: "recorded by mistake" });
    const map = (await listReleases(maya)).find((r) => r.version === "v2.6.0")!;
    expect(map.stages.find((s) => s.environment === "Prod")!.status).toBeNull();
    const [a] = await withTenant(app, T, (tx) => tx.execute(sql`select after from core.audit_event where action = 'delivery.deployment.void' order by seq desc limit 1`));
    expect(a.after).toMatchObject({ reason: "recorded by mistake" });
    await expect(voidDeployment(ctxFor(maya), { projectKey: "CON", version: "v2.6.0", environment: "Prod", reason: "again" })).rejects.toThrow(/to void/);
  });
});

describe.skipIf(!hasDb)("voiding only un-releases through the record that released (review round 1)", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  let sahan: Viewer;
  const released = async (key: string) => (await listProposals(sahan, { projectKey: key, phase: "released" })).map((p) => p.key).sort();

  beforeAll(async () => {
    t = await migratedDatabase();
    app = t.app();
    configureRuntime({ db: app, auditKey: "k".repeat(32) });
    setGrants([delivery]);
    setViewerScopeResolvers([delivery.viewerScopes!]);
    installAuthorizer();
    await loadFixtures(app, [{ id: "auth", fixtures: [authFixtures] }, delivery], lumen);
    const [u] = await withTenant(app, T, (tx) => tx.execute(sql`select id from auth.user where email = 'sahan@lumenlabs.test'`));
    sahan = (await withTenant(app, T, (tx) => viewerForUser(tx, T, u.id as string)))!;
    await recordDeployment(ctxFor(sahan), { projectKey: "CON", version: "v2.4.0", environment: "Prod" });
  });
  afterAll(() => t?.drop());

  it("voiding a Dev deployment after Prod is unmarked leaves Released alone", async () => {
    await upsertEnvironment(ctxFor(sahan), { projectKey: "CON", name: "Prod", isProd: false });
    await voidDeployment(ctxFor(sahan), { projectKey: "CON", version: "v2.4.0", environment: "Dev", reason: "dev redo" });
    expect(await released("CON")).toEqual(["CON-009", "CON-010", "CON-012"]);
  });

  it("voiding a QA deployment after Prod moved to another environment leaves Released alone", async () => {
    await upsertEnvironment(ctxFor(sahan), { projectKey: "CON", name: "UAT", isProd: true });
    await voidDeployment(ctxFor(sahan), { projectKey: "CON", version: "v2.4.0", environment: "QA", reason: "qa redo" });
    expect(await released("CON")).toEqual(["CON-009", "CON-010", "CON-012"]);
  });

  it("voiding the deployment that released them un-releases", async () => {
    await voidDeployment(ctxFor(sahan), { projectKey: "CON", version: "v2.4.0", environment: "Prod", reason: "wrong pipeline" });
    expect(await released("CON")).toEqual(["CON-009"]);
  });

  it("a shipped proposal can't be moved into another release; unknown keys are refused in both paths", async () => {
    // v0.9.2 is live in Prod: it keeps its own proposals but takes no new one (final review).
    await expect(setReleaseProposals(ctxFor(sahan), { projectKey: "HRI", version: "v0.9.2", proposalKeys: ["HRI-100", "HRI-101", "HRI-102", "HRI-103", "HRI-001"] })).rejects.toThrow(/already live in Prod; put HRI-001 in a new release/);
    await expect(setReleaseProposals(ctxFor(sahan), { projectKey: "HRI", version: "v0.9.2", proposalKeys: ["HRI-090"] })).rejects.toThrow(/already shipped/);
    await expect(createRelease(ctxFor(sahan), { ...tracked(), projectKey: "HRI", version: "v1.0.0", proposalKeys: ["HRI-100"] })).rejects.toThrow(/already shipped/);
    await expect(createRelease(ctxFor(sahan), { ...tracked(), projectKey: "HRI", version: "v1.0.1", proposalKeys: ["HRI-999"] })).rejects.toThrow(/no proposal HRI-999/);
    await expect(setReleaseProposals(ctxFor(sahan), { projectKey: "HRI", version: "v0.9.2", proposalKeys: ["HRI-999"] })).rejects.toThrow(/no proposal HRI-999/);
  });
});

describe("release columns agree with every project's stage order (review round 2)", async () => {
  const { stageColumns } = await import("../server/queries");
  const rel = (...envs: string[]) => ({ stages: envs.map((environment, i) => ({ environment, position: i + 1, isProd: false, status: null, at: null, note: null, run: null })) }) as never;
  it.each([
    ["same order", [rel("Dev", "QA", "Prod"), rel("Dev", "QA", "Prod")], ["Dev", "QA", "Prod"]],
    ["QA at 2 in one project, 3 in another", [rel("Dev", "QA", "Prod"), rel("Dev", "UAT", "QA", "Prod")], ["Dev", "UAT", "QA", "Prod"]],
    ["the longer project listed first", [rel("Dev", "UAT", "QA", "Prod"), rel("QA", "Prod")], ["Dev", "UAT", "QA", "Prod"]],
    ["disjoint stages", [rel("Dev", "Prod"), rel("Staging")], ["Dev", "Staging", "Prod"]],
    ["projects contradict each other: still every name once", [rel("A", "B"), rel("B", "A")], ["A", "B"]],
  ])("%s", (_n, releases, expected) => expect(stageColumns(releases as never)).toEqual(expected));
});

describe("release map rows follow the project's own order (review round 3)", async () => {
  const { stageColumns } = await import("../server/queries");
  const { mapRow } = await import("../ui/ReleasesPage");
  const rel = (...envs: [string, string | null][]) => ({ stages: envs.map(([environment, status], i) => ({ environment, position: i + 1, isProd: false, status, at: null, note: null, run: null })) }) as never;
  it("orders that agree: stations under their columns, line to the furthest reached", () => {
    const a = rel(["Dev", "deployed"], ["QA", "deployed"], ["Prod", null]);
    const b = rel(["Dev", "deployed"], ["UAT", null], ["QA", null], ["Prod", null]);
    const cols = stageColumns([a, b]);
    expect(mapRow(a, cols)).toMatchObject({ agrees: true, lineTo: cols.indexOf("QA"), aheadTo: cols.indexOf("Prod"), back: false });
  });
  it("opposite orders: the contradicting row is drawn by its own order, reaching only what it reached", () => {
    const a = rel(["A", "deployed"], ["B", null]);
    const b = rel(["B", "deployed"], ["A", null]);
    const cols = stageColumns([a, b]);
    const rows = [mapRow(a, cols), mapRow(b, cols)];
    const bad = rows.find((r) => !r.agrees)!;
    expect(rows.filter((r) => r.agrees)).toHaveLength(1);
    expect(bad).toMatchObject({ lineTo: 0, aheadTo: 1 });
    expect(bad.stations.map((s) => [s.environment, s.slot, s.reached])).toEqual([["B", 0, true], ["A", 1, false]]);
  });
  it("a rollback is read from the last reached stage in the project's own order", () => {
    const a = rel(["Dev", "deployed"], ["QA", "rolled-back"], ["Prod", null]);
    expect(mapRow(a, ["Dev", "QA", "Prod"])).toMatchObject({ back: true, lineTo: 1 });
  });
});

describe.skipIf(!hasDb)("final review: release bugs", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  let sahan: Viewer;
  beforeAll(async () => {
    t = await migratedDatabase();
    app = t.app();
    configureRuntime({ db: app, auditKey: "k".repeat(32) });
    setGrants([delivery]);
    setViewerScopeResolvers([delivery.viewerScopes!]);
    installAuthorizer();
    await loadFixtures(app, [{ id: "auth", fixtures: [authFixtures] }, delivery], lumen);
    const [u] = await withTenant(app, T, (tx) => tx.execute(sql`select id from auth.user where email = 'sahan@lumenlabs.test'`));
    sahan = (await withTenant(app, T, (tx) => viewerForUser(tx, T, u.id as string)))!;
  });
  afterAll(() => t?.drop());
  const ctx = () => ctxFor(sahan);

  it("environment names match without regard to case in every service, and the database enforces it", async () => {
    await createProject(ctx(), { key: "ENV", name: "Env", client: "x", billing: "internal" });
    await upsertEnvironment(ctx(), { projectKey: "ENV", name: "prod", isProd: true });
    expect((await listEnvironments(sahan, "ENV")).map((e) => e.name)).toEqual(["Dev", "QA", "UAT", "Prod"]);
    await createRelease(ctx(), { ...tracked(), projectKey: "ENV", version: "v1", proposalKeys: [] });
    await recordDeployment(ctx(), { projectKey: "ENV", version: "v1", environment: "pRoD" });
    const [ev] = await t.owner`select payload from core.event where name = 'delivery.release.deployed' and payload->>'version' = 'v1' order by created_at desc limit 1`;
    expect(ev.payload.environment).toBe("Prod");
    await expect(t.owner`insert into delivery.environment (tenant_id, project_id, name, position) select ${T}, id, 'PROD', 9 from delivery.project where key = 'ENV'`).rejects.toThrow(/environment_name_ci/);
    await expect(removeEnvironment(ctx(), { projectKey: "ENV", name: "PROD" })).rejects.toThrow(/Prod has 1 deployment record .*kept as history/);
  });

  it("Void on a history row voids exactly that record", async () => {
    await createProject(ctx(), { key: "VID", name: "Vid", client: "x", billing: "internal" });
    await createRelease(ctx(), { ...tracked(), projectKey: "VID", version: "v1", proposalKeys: [] });
    await recordDeployment(ctx(), { projectKey: "VID", version: "v1", environment: "Dev" });
    await recordDeployment(ctx(), { projectKey: "VID", version: "v1", environment: "Dev" });
    const history = (await getRelease(sahan, "VID", "v1"))!.history; // newest first
    await voidDeployment(ctx(), { projectKey: "VID", version: "v1", environment: "Dev", deploymentId: history[1].id, reason: "the older one" });
    const after = (await getRelease(sahan, "VID", "v1"))!.history;
    expect(after.find((d) => d.id === history[1].id)!.voidedAt).not.toBeNull();
    expect(after.find((d) => d.id === history[0].id)!.voidedAt).toBeNull();
    await createRelease(ctx(), { ...tracked(), projectKey: "VID", version: "v2", proposalKeys: [] });
    await expect(voidDeployment(ctx(), { projectKey: "VID", version: "v2", environment: "Dev", deploymentId: history[0].id, reason: "wrong release" })).rejects.toThrow(/isn't a live Dev record of v2/);
    // The id and the environment must agree: a destructive call never voids a record elsewhere (round 13).
    await expect(voidDeployment(ctx(), { projectKey: "VID", version: "v1", environment: "Prod", deploymentId: history[0].id, reason: "mismatch" })).rejects.toThrow(/isn't a live Prod record of v1/);
    expect((await getRelease(sahan, "VID", "v1"))!.history.find((d) => d.id === history[0].id)!.voidedAt).toBeNull();
  });

  it("rename collisions are refused clearly; remove reports the stored name (round 13)", async () => {
    await createProject(ctx(), { key: "REN", name: "Ren", client: "x", billing: "internal" });
    await expect(upsertEnvironment(ctx(), { projectKey: "REN", name: "QA", rename: "dev" })).rejects.toThrow(/already has an environment called Dev/);
    await upsertEnvironment(ctx(), { projectKey: "REN", name: "QA", rename: "qa" });
    expect(await removeEnvironment(ctx(), { projectKey: "REN", name: "QA" })).toEqual({ removed: "qa" });
  });

  it("044 AC-1 voiding the deployment that released restores each proposal's own phase, with matching events", async () => {
    const { createProposal, moveProposal } = await import("../server/services");
    await createProject(ctx(), { key: "PRI", name: "Prior", client: "x", billing: "internal" });
    const building = await createProposal(ctx(), { projectKey: "PRI", title: "half built" });
    const planned = await createProposal(ctx(), { projectKey: "PRI", title: "only planned" });
    await moveProposal(ctx(), { key: building.key, to: "building" });
    await moveProposal(ctx(), { key: planned.key, to: "planned" });
    await createRelease(ctx(), { ...tracked(), projectKey: "PRI", version: "v1", proposalKeys: [] });
    await t.owner`update delivery.proposal set release_id = (select r.id from delivery.release r join delivery.project p on p.id = r.project_id where p.key = 'PRI') where key in (${building.key}, ${planned.key})`;
    await recordDeployment(ctx(), { projectKey: "PRI", version: "v1", environment: "Prod" });
    await voidDeployment(ctx(), { projectKey: "PRI", version: "v1", environment: "Prod", reason: "wrong pipeline" });
    const phases = await t.owner`select key, phase, released_at from delivery.proposal where key in (${building.key}, ${planned.key}) order by key`;
    expect(Object.fromEntries(phases.map((p) => [p.key, p.phase]))).toEqual({ [building.key]: "building", [planned.key]: "planned" });
    expect(phases.every((p) => p.released_at === null)).toBe(true);
    const back = await t.owner`select payload from core.event where name = 'delivery.proposal.phase_changed' and payload->>'from' = 'released' and payload->>'key' in (${building.key}, ${planned.key})`;
    expect(Object.fromEntries(back.map((e) => [e.payload.key, e.payload.to]))).toEqual({ [building.key]: "building", [planned.key]: "planned" });
  });

  it.each([["recordDeployment"], ["setReleaseProposals"]])("%s locks the release row (rounds 13 and 14)", async (which) => {
    const key = `LK${which.length}`;
    await createProject(ctx(), { key, name: key, client: "x", billing: "internal" });
    const { createProposal } = await import("../server/services");
    const p = await createProposal(ctx(), { projectKey: key, title: "p" });
    await verify(t.owner, p.key);
    await createRelease(ctx(), { ...tracked(), projectKey: key, version: "v1", proposalKeys: [] });
    let done = false;
    await t.owner.begin(async (tx) => {
      // A key-share lock is what a foreign-key write takes; it blocks only an explicit row lock, so
      // this pins releaseOf's "for update" on both sides, not just the foreign keys.
      await tx`select 1 from delivery.release r where r.version = 'v1' and r.project_id = (select id from delivery.project where key = ${key}) for key share`;
      const call = which === "recordDeployment"
        ? recordDeployment(ctx(), { projectKey: key, version: "v1", environment: "Prod" })
        : setReleaseProposals(ctx(), { projectKey: key, version: "v1", proposalKeys: [p.key] });
      const settled = call.then(() => { done = true; });
      await new Promise((r) => setTimeout(r, 300));
      expect(done).toBe(false);
      void settled;
    });
    await expect.poll(() => done, { timeout: 5000 }).toBe(true);
  });

  it("a release already live in Prod takes no new proposals; keeping its own is fine", async () => {
    await createProject(ctx(), { key: "LIV", name: "Live", client: "x", billing: "internal" });
    const { createProposal } = await import("../server/services");
    const a = await createProposal(ctx(), { projectKey: "LIV", title: "In the release" });
    const b = await createProposal(ctx(), { projectKey: "LIV", title: "Late" });
    await verify(t.owner, a.key);
    await createRelease(ctx(), { ...tracked(), projectKey: "LIV", version: "v1", proposalKeys: [a.key] });
    await recordDeployment(ctx(), { projectKey: "LIV", version: "v1", environment: "Prod" });
    await expect(setReleaseProposals(ctx(), { projectKey: "LIV", version: "v1", proposalKeys: [a.key, b.key] })).rejects.toThrow(/already live in Prod; put LIV-002 in a new release/);
    await setReleaseProposals(ctx(), { projectKey: "LIV", version: "v1", proposalKeys: [a.key] });
    const rows = await t.owner`select key, phase, release_id is not null as assigned from delivery.proposal p where key in (${a.key}, ${b.key}) order by key`;
    expect(rows).toEqual([{ key: a.key, phase: "released", assigned: true }, { key: b.key, phase: "proposed", assigned: false }]);
  });

  it("assignProposals is private to services.ts with exactly two call sites, both raced below (rounds 16 to 18)", async () => {
    const { readdirSync, statSync } = await import("node:fs");
    const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? (f === "tests" || f === "node_modules" ? [] : files(p)) : /\.tsx?$/.test(f) ? [p] : []; });
    const mentions = files(join(__dirname, "..")).flatMap((f) => {
      const src = readFileSync(f, "utf8");
      return [...src.matchAll(/\bassignProposals\b/g)].map((m) => ({ file: f.replace(/.*modules\/delivery\//, ""), line: src.slice(src.lastIndexOf("\n", m.index) + 1, src.indexOf("\n", m.index)) }));
    });
    // Every mention other than the declaration is a call; none is an export in any form.
    expect(mentions.filter((m) => /\bexport\b/.test(m.line))).toEqual([]);
    expect(mentions.map((m) => [m.file, /async function assignProposals\(/.test(m.line) ? "declaration" : "call"])).toEqual([
      ["server/services.ts", "declaration"], ["server/services.ts", "call"], ["server/services.ts", "call"],
    ]);
  });

  // Holds the first service that locks a release inside its transaction, right after the lock, until
  // released: the other service then runs against it for real (round 15). Test-only runtime wrapper.
  const holdAfterReleaseLock = (at: RegExp = /from delivery\.release .*for update/s) => {
    let entered!: () => void, release!: () => void;
    const inside = new Promise<void>((r) => { entered = r; });
    const gate = new Promise<void>((r) => { release = r; });
    let armed = true, done = false;
    const text = (q: { queryChunks?: { value?: unknown }[] }) => (q.queryChunks ?? []).map((c) => (Array.isArray(c?.value) ? c.value.join("") : "")).join("");
    const wrapTx = (tx: Db) => new Proxy(tx, { get: (target, prop) => prop !== "execute" ? Reflect.get(target, prop) : async (q: never) => {
      const out = await target.execute(q);
      if (armed && at.test(text(q))) { armed = false; entered(); await gate; }
      return out;
    } });
    const db = new Proxy(app, { get: (target, prop) => prop !== "transaction" ? Reflect.get(target, prop)
      : (fn: (tx: Db) => Promise<unknown>) => target.transaction((tx) => fn(wrapTx(tx as never))) });
    configureRuntime({ db: db as Db, auditKey: "k".repeat(32) });
    // Safe to call twice; always called from a finally, so a failed test never leaves the hold or the
    // wrapped runtime behind.
    return { inside, release: () => { if (done) return; done = true; armed = false; release(); configureRuntime({ db: app, auditKey: "k".repeat(32) }); } };
  };

  it.each([
    ["adding a proposal holds the release; a Prod deployment waits, then ships it", "assign-first"],
    ["a Prod deployment holds the release; adding a proposal waits, then is refused", "deploy-first"],
  ])("race, %s (rounds 14 and 15)", async (_n, order) => {
    const { createProposal } = await import("../server/services");
    const key = order === "assign-first" ? "RCA" : "RCB";
    await createProject(ctx(), { key, name: key, client: "x", billing: "internal" });
    const p = await createProposal(ctx(), { projectKey: key, title: "late" });
    await verify(t.owner, p.key);
    await createRelease(ctx(), { ...tracked(), projectKey: key, version: "v1", proposalKeys: [] });
    const assign = () => setReleaseProposals(ctx(), { projectKey: key, version: "v1", proposalKeys: [p.key] });
    const deploy = () => recordDeployment(ctx(), { projectKey: key, version: "v1", environment: "Prod" });
    const h = holdAfterReleaseLock();
    let first: Promise<unknown> = Promise.resolve(), second: Promise<unknown> = Promise.resolve();
    try {
      first = order === "assign-first" ? assign() : deploy();
      await h.inside;
      let secondDone = false;
      second = (order === "assign-first" ? deploy() : assign()).finally(() => { secondDone = true; });
      await new Promise((r) => setTimeout(r, 300));
      expect(secondDone).toBe(false); // waiting on the held release row
    } finally {
      h.release();
      await Promise.allSettled([first, second]); // nothing keeps writing after the test, whatever failed
    }
    await first;
    if (order === "assign-first") await expect(second).resolves.toMatchObject({ released: true });
    else await expect(second).rejects.toThrow(/already live in Prod/);
    const [row] = await t.owner`select phase, release_id is not null as assigned from delivery.proposal where id = ${p.id}`;
    expect(row).toEqual(order === "assign-first" ? { phase: "released", assigned: true } : { phase: "verified", assigned: false });
  });

  it("createRelease held after inserting its release: a Prod deployment of that version can't see it yet and is refused; nothing is released (round 17)", async () => {
    const { createProposal } = await import("../server/services");
    await createProject(ctx(), { key: "CRA", name: "CRA", client: "x", billing: "internal" });
    const p = await createProposal(ctx(), { projectKey: "CRA", title: "p" });
    await verify(t.owner, p.key);
    const h = holdAfterReleaseLock(/insert into delivery\.release/);
    let first: Promise<unknown> = Promise.resolve(), deploy: Promise<unknown> = Promise.resolve();
    try {
      first = createRelease(ctx(), { ...tracked(), projectKey: "CRA", version: "v1", proposalKeys: [p.key] });
      await h.inside;
      deploy = recordDeployment(ctx(), { projectKey: "CRA", version: "v1", environment: "Prod" });
      await expect(deploy).rejects.toThrow(/no release v1/);
    } finally {
      h.release();
      await Promise.allSettled([first, deploy]);
    }
    await first;
    const [row] = await t.owner`select phase, release_id is not null as assigned from delivery.proposal where id = ${p.id}`;
    expect(row).toEqual({ phase: "verified", assigned: true });
  });

  it("two createRelease calls for one version: the second waits, then fails; one release, proposals assigned once (round 17)", async () => {
    const { createProposal } = await import("../server/services");
    await createProject(ctx(), { key: "CRB", name: "CRB", client: "x", billing: "internal" });
    const p = await createProposal(ctx(), { projectKey: "CRB", title: "p" });
    await verify(t.owner, p.key);
    const h = holdAfterReleaseLock(/insert into delivery\.release/);
    let first: Promise<unknown> = Promise.resolve(), second: Promise<unknown> = Promise.resolve();
    let secondDone = false;
    try {
      first = createRelease(ctx(), { ...tracked(), projectKey: "CRB", version: "v1", proposalKeys: [p.key] });
      await h.inside;
      second = createRelease(ctx(), { ...tracked(), projectKey: "CRB", version: "v1", proposalKeys: [p.key] }).finally(() => { secondDone = true; });
      await new Promise((r) => setTimeout(r, 300));
      expect(secondDone).toBe(false); // waiting on the first insert's unique key
    } finally {
      h.release();
      await Promise.allSettled([first, second]);
    }
    await expect(first).resolves.toBeTruthy();
    await expect(second).rejects.toThrow(/CRB already has a release v1/);
    expect(await t.owner`select 1 from delivery.release r join delivery.project pr on pr.id = r.project_id where pr.key = 'CRB'`).toHaveLength(1);
  });

  it.each([
    ["createRelease: moving it holds its row; v1's Prod deployment waits, then leaves it unreleased under v2", "move-first", "create"],
    ["createRelease: v1's Prod deployment holds its row; the move waits, then is refused", "deploy-first", "create"],
    ["setReleaseProposals: moving it holds its row; v1's Prod deployment waits, then leaves it unreleased under v2", "move-first", "set"],
    ["setReleaseProposals: v1's Prod deployment holds its row; the move waits, then is refused", "deploy-first", "set"],
  ])("cross-release race, %s (rounds 18 and 19)", async (_n, order, via) => {
    const { createProposal } = await import("../server/services");
    const key = `X${order === "move-first" ? "A" : "B"}${via === "create" ? "C" : "S"}`;
    await createProject(ctx(), { key, name: key, client: "x", billing: "internal" });
    const p = await createProposal(ctx(), { projectKey: key, title: "p" });
    await verify(t.owner, p.key);
    await createRelease(ctx(), { ...tracked("dev"), projectKey: key, version: "v1", proposalKeys: [p.key] });
    await recordDeployment(ctx(), { projectKey: key, version: "v1", environment: "Dev" });
    if (via === "set") await createRelease(ctx(), { ...tracked(), projectKey: key, version: "v2", proposalKeys: [] });
    const move = () => via === "create"
      ? createRelease(ctx(), { ...tracked(), projectKey: key, version: "v2", proposalKeys: [p.key], reassign: [p.key] })
      : setReleaseProposals(ctx(), { projectKey: key, version: "v2", proposalKeys: [p.key], reassign: [p.key] });
    const deploy = () => recordDeployment(ctx(), { projectKey: key, version: "v1", environment: "Prod" });
    const h = holdAfterReleaseLock(order === "move-first" ? /select id from delivery\.proposal where .*order by id for update/s : /update delivery\.proposal set phase = 'released'/);
    let first: Promise<unknown> = Promise.resolve(), second: Promise<unknown> = Promise.resolve();
    let secondDone = false;
    try {
      first = order === "move-first" ? move() : deploy();
      await h.inside;
      second = (order === "move-first" ? deploy() : move()).finally(() => { secondDone = true; });
      await new Promise((r) => setTimeout(r, 300));
      expect(secondDone).toBe(false); // waiting on the proposal's row
    } finally {
      h.release();
      await Promise.allSettled([first, second]);
    }
    await expect(first).resolves.toBeTruthy();
    if (order === "move-first") await expect(second).resolves.toMatchObject({ released: true });
    else await expect(second).rejects.toThrow(/already shipped in another release/);
    const [row] = await t.owner`select p.phase, r.version from delivery.proposal p join delivery.release r on r.id = p.release_id where p.id = ${p.id}`;
    // Never released under v2: either unreleased in v2, or released in v1.
    expect(row).toEqual(order === "move-first" ? { phase: "verified", version: "v2" } : { phase: "released", version: "v1" });
    // And the outbox agrees: a released event exactly when it was released (round 20).
    const events = await t.owner`select 1 from core.event where name = 'delivery.proposal.phase_changed' and payload->>'proposalId' = ${p.id} and payload->>'to' = 'released'`;
    expect(events).toHaveLength(order === "move-first" ? 0 : 1);
  });

  it("two writers sharing two proposals in opposite key orders don't deadlock: one holds its lock, the other waits (rounds 19 and 20)", async () => {
    const { createProposal } = await import("../server/services");
    await createProject(ctx(), { key: "DLK", name: "DLK", client: "x", billing: "internal" });
    const a = await createProposal(ctx(), { projectKey: "DLK", title: "a" });
    const b = await createProposal(ctx(), { projectKey: "DLK", title: "b" });
    await verify(t.owner, a.key, b.key);
    await createRelease(ctx(), { ...tracked(), projectKey: "DLK", version: "w", proposalKeys: [] });
    // Hold the first writer right after its first proposal lock: with per-key locking it would hold a
    // only, the other writer would take b and then wait on a, and resuming would deadlock.
    const h = holdAfterReleaseLock(/from delivery\.proposal where .*for update/s);
    let first: Promise<unknown> = Promise.resolve(), second: Promise<unknown> = Promise.resolve();
    try {
      first = setReleaseProposals(ctx(), { projectKey: "DLK", version: "w", proposalKeys: [a.key, b.key] });
      await h.inside;
      second = createRelease(ctx(), { ...tracked(), projectKey: "DLK", version: "x", proposalKeys: [b.key, a.key] });
      await new Promise((r) => setTimeout(r, 300));
    } finally {
      h.release();
      await Promise.allSettled([first, second]);
    }
    await expect(first).resolves.toBeTruthy();
    await expect(second).rejects.toThrow(/is already in DLK w \(UAT, In progress\); confirm moving it, or take it out there first/);
    const rows = await t.owner`select p.key, r.version from delivery.proposal p join delivery.release r on r.id = p.release_id where p.key in (${a.key}, ${b.key}) order by p.key`;
    expect(rows).toEqual([{ key: a.key, version: "w" }, { key: b.key, version: "w" }]);
  });

  const MERGE = [
    ["a duplicate that is Prod while the kept row isn't", [["Dev", 1, false, 1], ["DEV", 9, true, 2]], { keep: "Dev", prod: true, deployments: 3 }],
    ["three case variants, each with deployments", [["QA", 2, false, 1], ["qa", 7, false, 1], ["Qa", 8, false, 2]], { keep: "QA", prod: false, deployments: 4 }],
    ["no duplicates", [["Solo", 1, false, 2]], { keep: "Solo", prod: false, deployments: 2 }],
  ] as const;
  it.each(MERGE)("migration 0008 merges names that differ only by case: %s (rounds 13 and 14)", async (_n, rows, want) => {
    const key = `MG${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const [p] = await t.owner`insert into delivery.project (tenant_id, key, name, client, billing, color) values (${T}, ${key}, 'm', 'x', 'internal', 'mint') returning id`;
    const [rel] = await t.owner`insert into delivery.release (tenant_id, project_id, version) values (${T}, ${p.id}, 'v1') returning id`;
    await t.owner`drop index delivery.environment_name_ci`;
    try {
      for (const [name, position, isProd, deployments] of rows) {
        const [e] = await t.owner`insert into delivery.environment (tenant_id, project_id, name, position, is_prod) values (${T}, ${p.id}, ${name}, ${position}, ${isProd}) returning id`;
        for (let i = 0; i < deployments; i++) await t.owner`insert into delivery.deployment (tenant_id, release_id, environment_id, status, recorded_by) values (${T}, ${rel.id}, ${e.id}, 'deployed', 'test')`;
      }
      await t.owner.unsafe(readFileSync(join(__dirname, "../db/migrations/0008_environment_name_ci.sql"), "utf8"));
    } catch (e) {
      // Leave the shared database as it was: drop this project's rows, then restore the index.
      await t.owner`delete from delivery.deployment where release_id = ${rel.id}`;
      await t.owner`delete from delivery.environment where project_id = ${p.id}`;
      throw e;
    } finally {
      await t.owner`create unique index if not exists environment_name_ci on delivery.environment (project_id, lower(name))`;
    }
    const envs = await t.owner`select e.name, e.is_prod, (select count(*)::int from delivery.deployment d where d.environment_id = e.id) as n from delivery.environment e where e.project_id = ${p.id}`;
    expect(envs).toEqual([{ name: want.keep, is_prod: want.prod, n: want.deployments }]);
  });
});

describe("nextStep: only a deployed Prod is Live (final review)", async () => {
  const { nextStep } = await import("../ui/ReleasesPage");
  const st = (environment: string, position: number, isProd: boolean, status: string | null) => ({ environment, position, isProd, status, at: null, note: null, run: null });
  const rel = (...stages: ReturnType<typeof st>[]) => ({ stages }) as never;
  it.each([
    ["a gap in positions after a removal", rel(st("Dev", 1, false, "deployed"), st("UAT", 3, false, null), st("Prod", 4, true, null)), "Promote to UAT"],
    ["Prod still testing", rel(st("Dev", 1, false, "deployed"), st("Prod", 2, true, "testing")), "Finish Prod"],
    ["QA still testing (promotable, as in the mock)", rel(st("Dev", 1, false, "deployed"), st("QA", 2, false, "testing"), st("Prod", 3, true, null)), "Promote to Prod"],
    ["a project with no Prod, every stage reached", rel(st("Dev", 1, false, "deployed"), st("QA", 2, false, "deployed")), "No Prod stage"],
    ["a rollback", rel(st("Dev", 1, false, "deployed"), st("QA", 2, false, "rolled-back")), "Retry QA"],
    ["nothing yet", rel(st("Dev", 1, false, null)), "Deploy to Dev"],
    ["Prod deployed", rel(st("Dev", 1, false, "deployed"), st("Prod", 2, true, "deployed")), null],
    ["a stage after Prod reached, Prod not yet (round 13)", rel(st("Dev", 1, false, "deployed"), st("Prod", 2, true, null), st("Demo", 3, false, "deployed")), "Deploy to Prod"],
    ["a stage after Prod reached, Prod testing (round 14)", rel(st("Dev", 1, false, "deployed"), st("Prod", 2, true, "testing"), st("Demo", 3, false, "deployed")), "Finish Prod"],
    ["a stage after Prod reached, Prod rolled back (round 14)", rel(st("Dev", 1, false, "deployed"), st("Prod", 2, true, "rolled-back"), st("Demo", 3, false, "deployed")), "Retry Prod"],
  ])("%s", (_n, r, label) => expect(nextStep(r)?.label ?? null).toBe(label));
});
