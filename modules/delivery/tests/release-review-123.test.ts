import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { createProject, createRelease, recordDeployment, removeEnvironment, updateRelease, upsertEnvironment } from "../server/services";
import { proposalOffers, releaseOffers } from "../server/pin-offers";
import { getRelease } from "../server/queries";
import { OPEN, releaseDb, T } from "./release-db";

// 123's review (round 1, over the release stack): a completed release is offered no write it would refuse; an environment
// open releases complete on can't be renamed away, unmarked or removed; tracking a release that already reached its
// category's environment completes it.
describe.skipIf(!hasDb)("123 review: completed offers, stranded categories, completion from history (Postgres)", () => {
  let db: Awaited<ReturnType<typeof releaseDb>>;
  let key = 0;
  const project = async () => {
    const k = `RV${++key}`;
    await createProject(db.admin(), { key: k, name: `Review ${k}`, client: "x", billing: "internal" });
    return k;
  };
  const untracked = (k: string, version: string) =>
    db.t.owner`insert into delivery.release (tenant_id, project_id, version) select ${T}, id, ${version} from delivery.project where key = ${k}`;
  beforeAll(async () => {
    db = await releaseDb();
  }, 120_000);
  afterAll(() => db?.t.drop());

  it.each([
    { category: "dev", deployTo: "Dev", completed: true },
    { category: "uat", deployTo: "UAT", completed: true },
    { category: "uat", deployTo: "Dev", completed: false },
  ])("a $category release deployed to $deployTo offers re-tag and change proposals only while open", async ({ category, deployTo, completed }) => {
    const k = await project();
    await createRelease(db.admin(), { ...OPEN, projectKey: k, version: "o1", category });
    await recordDeployment(db.admin(), { projectKey: k, version: "o1", environment: deployTo });
    const release = (await getRelease(db.sahan, k, "o1"))!;
    expect(release.status === "completed").toBe(completed);
    const labels = (await releaseOffers(db.sahan, { releaseId: release.id })).map((o) => o.label);
    for (const write of [`Re-tag ${k} o1`, `Change the proposals in ${k} o1`]) expect(labels.includes(write)).toBe(!completed);
  });

  it.each([
    { change: "rename UAT", category: "uat", run: (k: string) => upsertEnvironment(db.admin(), { projectKey: k, name: "UAT", rename: "Staging" }), refused: true },
    { change: "unmark Prod", category: "prod", run: (k: string) => upsertEnvironment(db.admin(), { projectKey: k, name: "Prod", isProd: false }), refused: true },
    { change: "remove Dev", category: "dev", run: (k: string) => removeEnvironment(db.admin(), { projectKey: k, name: "Dev" }), refused: true },
    { change: "rename UAT's case", category: "uat", run: (k: string) => upsertEnvironment(db.admin(), { projectKey: k, name: "UAT", rename: "uat" }), refused: false },
    { change: "rename QA", category: "uat", run: (k: string) => upsertEnvironment(db.admin(), { projectKey: k, name: "QA", rename: "Test" }), refused: false },
  ])("$change with an open $category release: refused $refused", async ({ category, run, refused }) => {
    const k = await project();
    await createRelease(db.admin(), { ...OPEN, projectKey: k, version: "s1", category });
    if (refused) await expect(run(k)).rejects.toThrow(new RegExp(`s1 is an open .* release that completes on`));
    else await expect(run(k)).resolves.toBeDefined();
  });

  it("a completed release doesn't hold its environment", async () => {
    const k = await project();
    await createRelease(db.admin(), { ...OPEN, projectKey: k, version: "d1" });
    await recordDeployment(db.admin(), { projectKey: k, version: "d1", environment: "UAT" });
    await expect(upsertEnvironment(db.admin(), { projectKey: k, name: "UAT", rename: "Staging" })).resolves.toBeDefined();
  });

  it.each([
    { case: "tracking an untracked live release", from: null, to: "uat", completes: true },
    { case: "moving a Dev release to UAT, already reached", from: "dev", to: "uat", completes: true },
    { case: "moving a Dev release to Prod, not reached", from: "dev", to: "prod", completes: false },
  ])("update_release: $case completes it: $completes, with no Off track on the way", async ({ from, to, completes }) => {
    const k = await project();
    if (from) await createRelease(db.admin(), { ...OPEN, projectKey: k, version: "h1", category: from });
    else await untracked(k, "h1");
    for (const environment of ["QA", "UAT"]) await recordDeployment(db.admin(), { projectKey: k, version: "h1", environment });
    const target = "2026-10-02";
    const out = await updateRelease(db.admin(), { projectKey: k, version: "h1", category: to, startDate: "2026-10-01", targetDate: target });
    const release = (await getRelease(db.sahan, k, "h1"))!;
    const uat = release.history.find((d) => d.environment === "UAT")!;
    expect([out.status, release.status]).toEqual(completes ? ["completed", "completed"] : ["overdue", "overdue"]);
    if (!completes) return;
    expect([release.completingDeploymentId, release.completedAt, release.completion]).toEqual([uat.id, uat.at, "late"]);
    expect(release.statusHistory.map((h) => `${h.to}:${h.source}`).at(-1)).toBe("completed:deployment");
    expect(release.statusHistory.some((h) => h.to === "overdue")).toBe(false);
  });

  // Round 2: the proposal pin's "Put <key> in <release>" skips a completed release, as the release pin does.
  it.each([
    { newest: "a completed Dev release", category: "dev", deployTo: "Dev", offered: "o1" },
    { newest: "a completed UAT release", category: "uat", deployTo: "UAT", offered: "o1" },
    { newest: "an open release", category: "uat", deployTo: "Dev", offered: "n1" },
  ])("a Verified proposal with no release is offered the newest open one when the newest is $newest", async ({ category, deployTo, offered }) => {
    const k = await project();
    await createRelease(db.admin(), { ...OPEN, projectKey: k, version: "o1" });
    await createRelease(db.admin(), { ...OPEN, projectKey: k, version: "n1", category });
    await recordDeployment(db.admin(), { projectKey: k, version: "n1", environment: deployTo });
    const key = await db.proposal(k);
    const puts = (await proposalOffers(db.sahan, { key })).filter((o) => o.tool === "set_release_proposals").map((o) => o.label);
    expect(puts).toEqual([`Put ${key} in ${k} ${offered}`]);
  });

  // Round 2: an environment change that gives a category an environment an open release already reached completes it.
  it.each([
    { case: "QA made Prod, reached", deployTo: "QA", completes: true },
    { case: "QA made Prod, not reached", deployTo: "Dev", completes: false },
  ])("upsert_environment: $case completes the open Prod release: $completes", async ({ deployTo, completes }) => {
    const k = await project();
    await createRelease(db.admin(), { ...OPEN, projectKey: k, version: "p1", category: "prod" });
    await recordDeployment(db.admin(), { projectKey: k, version: "p1", environment: deployTo });
    const out = await upsertEnvironment(db.admin(), { projectKey: k, name: "QA", isProd: true });
    const release = (await getRelease(db.sahan, k, "p1"))!;
    expect(release.status).toBe(completes ? "completed" : "in_progress");
    const qa = release.history.find((d) => d.environment === "QA");
    expect(out.completed ?? []).toEqual(completes ? [{ version: "p1", deploymentId: qa!.id }] : []);
    const [audit] = await db.t.owner`select after from core.audit_event where action = 'delivery.environment.upsert' and tenant_id = ${T} order by seq desc limit 1`;
    expect((audit.after as { completed: unknown }).completed).toEqual(out.completed ?? []);
    if (completes) expect(release.completingDeploymentId).toBe(qa!.id);
  });

  // Round 3/4: the one order the re-check guards, forced. A held session locks the release while the environment change
  // waits on it, completes the release on Prod, and commits; the change then finds it completed and leaves it.
  it("a release completed while an environment change waits on its lock keeps that completion", async () => {
    const k = await project();
    await createRelease(db.admin(), { ...OPEN, projectKey: k, version: "q1", category: "prod" });
    await recordDeployment(db.admin(), { projectKey: k, version: "q1", environment: "QA" });
    const [{ id, prod }] = await db.t.owner`select r.id, e.id as prod from delivery.release r join delivery.project p on p.id = r.project_id
      join delivery.environment e on e.project_id = p.id and e.is_prod where p.key = ${k} and r.version = 'q1'`;
    let change: Promise<{ completed?: unknown[] }> | undefined;
    await db.t.owner.begin(async (held) => {
      await held`select 1 from delivery.release where id = ${id} for update`;
      change = upsertEnvironment(db.admin(), { projectKey: k, name: "QA", isProd: true });
      for (let i = 0; i < 100; i++) {
        const [{ n }] = await db.t.owner`select count(*)::int as n from pg_stat_activity where wait_event_type = 'Lock' and datname = current_database()`;
        if (n > 0) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      const [d] = await held`insert into delivery.deployment (tenant_id, release_id, environment_id, status, recorded_by, released)
        values (${T}, ${id}, ${prod}, 'deployed', 'user:held', true) returning id, at`;
      await held`update delivery.release set status = 'completed', completed_at = ${d.at}, completed_zone = 'UTC', completed_day = ${d.at}::date,
        completion = 'on_time', completing_deployment_id = ${d.id} where id = ${id}`;
    });
    const out = await change!;
    expect(out.completed ?? []).toEqual([]);
    const release = (await getRelease(db.sahan, k, "q1"))!;
    expect(release.history.find((d) => d.id === release.completingDeploymentId)?.environment).toBe("Prod");
  });

  it("an environment change's completion is recorded as one, in the history and the event", async () => {
    const k = await project();
    await createRelease(db.admin(), { ...OPEN, projectKey: k, version: "e1", category: "prod" });
    await recordDeployment(db.admin(), { projectKey: k, version: "e1", environment: "QA" });
    const out = await upsertEnvironment(db.admin(), { projectKey: k, name: "QA", isProd: true });
    const release = (await getRelease(db.sahan, k, "e1"))!;
    expect(release.statusHistory.at(-1)).toMatchObject({ to: "completed", source: "environment", deploymentId: release.completingDeploymentId });
    expect((out as { completed?: unknown[] }).completed).toHaveLength(1);
    const [event] = await db.t.owner`select payload from core.event where name = 'delivery.release.status_changed' and payload->>'releaseId' = ${release.id} and payload->>'to' = 'completed'`;
    expect(event.payload).toMatchObject({ source: "environment" });
  });

  // Round 2: the guard and the release write share the project lock, so a rename and a create of that category never both land.
  it("renaming UAT away and creating a UAT release at once: exactly one succeeds, every time", async () => {
    for (let i = 0; i < 5; i++) {
      const k = await project();
      const [rename, create] = await Promise.allSettled([
        upsertEnvironment(db.admin(), { projectKey: k, name: "UAT", rename: "Staging" }),
        createRelease(db.admin(), { ...OPEN, projectKey: k, version: "r1", category: "uat" }),
      ]);
      expect([rename.status, create.status].filter((x) => x === "fulfilled")).toHaveLength(1);
    }
  });
});
