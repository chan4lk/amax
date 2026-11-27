import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { afxDb } from "./afx";
import { T } from "./proposal-db";

describe.skipIf(!hasDb)("121 review: where the agent-first row's next release is", () => {
  let afx: Awaited<ReturnType<typeof afxDb>>;
  const release = (v: string, age: number) => afx.db.t.owner`insert into delivery.release (tenant_id, project_id, version, created_at)
    select ${T}, id, ${v}, now() - make_interval(secs => ${age}) from delivery.project where key = 'AFX'`;
  const deploy = (v: string, env: string, status: string, released = false) => afx.db.t.owner`insert into delivery.deployment
    (tenant_id, release_id, environment_id, status, released, recorded_by, at)
    select ${T}, r.id, e.id, ${status}, ${released}, 'test', clock_timestamp() from delivery.release r join delivery.environment e on e.project_id = r.project_id and e.name = ${env}
    where r.version = ${v} and r.project_id = (select id from delivery.project where key = 'AFX')`;

  beforeAll(async () => { afx = await afxDb(); }, 120_000);
  afterAll(() => afx?.db.t.drop());

  it.each([
    ["a release older than the one in Prod is never next", async () => { await release("v1.0.0", 30); await release("v1.0.5", 20); await deploy("v1.0.5", "Prod", "deployed", true); },
      { nextRelease: "1 verified", nextReleaseNote: "not released" }],
    ["a rolled-back deployment is not where the release is now", async () => { await release("v1.1.0", 10); await deploy("v1.1.0", "QA", "deployed"); await deploy("v1.1.0", "UAT", "rolled-back"); },
      { nextRelease: "v1.1.0", nextReleaseNote: "in QA" }],
    ["an environment whose latest deployment was rolled back no longer holds it", async () => { await release("v1.2.0", 5); await deploy("v1.2.0", "QA", "deployed"); await deploy("v1.2.0", "UAT", "deployed"); await deploy("v1.2.0", "UAT", "rolled-back"); },
      { nextRelease: "v1.2.0", nextReleaseNote: "in QA" }],
    ["a release whose only deployment was rolled back is not deployed", async () => { await release("v1.3.0", 1); await deploy("v1.3.0", "UAT", "rolled-back"); },
      { nextRelease: "v1.3.0", nextReleaseNote: "not deployed" }],
    ["a release rolled back in Prod is not live, so it is still next", async () => { await release("v1.4.0", 0); await deploy("v1.4.0", "Prod", "deployed", true); await deploy("v1.4.0", "Prod", "rolled-back"); },
      { nextRelease: "v1.4.0", nextReleaseNote: "not deployed" }],
  ])("AC-4 %s", async (_, seed, want) => {
    await seed();
    expect(await afx.row()).toMatchObject(want);
  });
});
