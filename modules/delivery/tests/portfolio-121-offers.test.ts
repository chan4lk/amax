import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import { proposalOffers } from "../server/pin-offers";
import { afxDb } from "./afx";
import { T } from "./proposal-db";

describe.skipIf(!hasDb)("121 final review: the pin offers the same next release as the portfolio", () => {
  let afx: Awaited<ReturnType<typeof afxDb>>;
  let pm: Viewer;
  const release = (v: string, age: number) => afx.db.t.owner`insert into delivery.release (tenant_id, project_id, version, created_at)
    select ${T}, id, ${v}, now() - make_interval(secs => ${age}) from delivery.project where key = 'AFX'`;
  const liveInProd = (v: string) => afx.db.t.owner`insert into delivery.deployment (tenant_id, release_id, environment_id, status, released, recorded_by)
    select ${T}, r.id, e.id, 'deployed', true, 'test' from delivery.release r join delivery.environment e on e.project_id = r.project_id and e.is_prod
    where r.version = ${v} and r.project_id = (select id from delivery.project where key = 'AFX')`;
  const offered = async () => (await proposalOffers(pm, { key: "AFX-001" })).map((o) => o.label).filter((l) => l.startsWith("Put AFX-001 in"));

  beforeAll(async () => {
    afx = await afxDb();
    await afx.db.t.owner`update delivery.project set manager_user_id = (select id from auth.user where email = 'maya@lumenlabs.test') where key = 'AFX'`;
    pm = await afx.db.as("maya");
  }, 120_000);
  afterAll(() => afx?.db.t.drop());

  it.each([
    ["no release at all offers none", async () => {}, []],
    ["an older release left behind by a newer live one is not offered", async () => { await release("v1.0.0", 30); await release("v1.0.5", 20); await liveInProd("v1.0.5"); }, []],
    ["a newer release not yet in Prod is offered", async () => { await release("v1.1.0", 10); }, ["Put AFX-001 in AFX v1.1.0"]],
  ])("AC-4 %s", async (_, seed, want) => {
    await seed();
    expect(await offered()).toEqual(want);
  });
});
