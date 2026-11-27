import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { freshDatabase, hasDb, repoRoot } from "@amax/db/testdb";
import { restoreLatest, takeSnapshot } from "../src/backup";
import { inOrder } from "../src/backup/restore";
import { backupDb, job, T } from "./backup-fixture";

// 154: release.completing_deployment_id and deployment.release_id point at each other (0025). The drill used to insert
// every table after that cycle in no order (PR #134's k3d drill: tasks before their proposals).
describe.skipIf(!hasDb)("154 the restore drill orders around the release cycle", () => {
  let db: Awaited<ReturnType<typeof backupDb>>;
  let scratch: Awaited<ReturnType<typeof freshDatabase>>;
  beforeAll(async () => {
    db = await backupDb();
    scratch = await freshDatabase();
  }, 60_000);
  afterAll(async () => {
    await scratch?.drop();
    await db?.t.drop();
  });

  it("AC-4 a snapshot holding a completed release, its deployment and a proposal with tasks restores every row", async () => {
    const o = db.t.owner;
    const [p] = await o`insert into delivery.project (tenant_id, key, name, client, billing) values (${T}, 'BKP', 'Backup 154 (fictional)', 'x', 'internal') returning id`;
    const [env] = await o`insert into delivery.environment (tenant_id, project_id, name, position) values (${T}, ${p.id}, 'Stage-154', 99) returning id`;
    const [r] = await o`insert into delivery.release (tenant_id, project_id, version) values (${T}, ${p.id}, 'v1') returning id`;
    const [d] = await o`insert into delivery.deployment (tenant_id, release_id, environment_id, status, recorded_by) values (${T}, ${r.id}, ${env.id}, 'deployed', 'user:test') returning id, at`;
    await o`update delivery.release set name = 'Done', category = 'uat', start_date = '2026-10-01', target_date = '2026-12-01', status = 'completed',
      completed_at = ${d.at}, completed_zone = 'UTC', completed_day = ${d.at}::date, completion = 'on_time', completing_deployment_id = ${d.id} where id = ${r.id}`;
    const [q] = await o`insert into delivery.proposal (tenant_id, project_id, key, title, release_id) values (${T}, ${p.id}, 'BKP-1', 'p', ${r.id}) returning id`;
    for (const ref of ["T1", "T2"]) await o`insert into delivery.task (tenant_id, proposal_id, ref, title) values (${T}, ${q.id}, ${ref}, ${ref})`;

    await takeSnapshot(job(), { kind: "daily" });
    const out = await restoreLatest({ live: db.app, scratchUrl: scratch.url, root: repoRoot, tenantId: T, drillId: null });
    expect(out).toMatchObject({ error: null, mismatches: [], chainOk: true });
    expect(out.rowsChecked).toBeGreaterThan(5);
  }, 120_000);

  // Only a key deferred by default (`initially deferred`) waits for the commit; one that is deferrable but `initially
  // immediate` is checked per statement, so it still orders the restore, like a plain key.
  it.each([
    { keys: "deferrable, initially deferred", tag: "d", when: "deferrable initially deferred", ordered: true },
    { keys: "deferrable, initially immediate", tag: "i", when: "deferrable initially immediate", ordered: false },
    { keys: "checked at once", tag: "n", when: "", ordered: false },
  ])("AC-3 AC-4 a two-table cycle of keys $keys", async ({ tag, when, ordered }) => {
    const s = `cyc154${tag}`;
    await db.t.owner.unsafe(`create schema ${s}; create table ${s}.a (id int primary key, b_id int); create table ${s}.b (id int primary key, a_id int references ${s}.a ${when});
      alter table ${s}.a add foreign key (b_id) references ${s}.b ${when}; create table ${s}.c (id int primary key, a_id int references ${s}.a)`);
    const order = db.tx((tx) => inOrder(tx, [`${s}.c`, `${s}.b`, `${s}.a`]));
    if (ordered) {
      const got = await order;
      expect(got.indexOf(`${s}.a`)).toBeLessThan(got.indexOf(`${s}.c`));
    } else {
      await expect(order).rejects.toThrow(`form a cycle checked at once, so no restore order exists: ${s}.a, ${s}.b, ${s}.c`);
    }
  });

  it("AC-3 a parent and child joined by a deferrable, initially immediate key: the parent is restored first", async () => {
    await db.t.owner.unsafe(`create schema pc154; create table pc154.parent (id int primary key);
      create table pc154.child (id int primary key, parent_id int references pc154.parent deferrable initially immediate)`);
    expect(await db.tx((tx) => inOrder(tx, ["pc154.child", "pc154.parent"]))).toEqual(["pc154.parent", "pc154.child"]);
  });
});
