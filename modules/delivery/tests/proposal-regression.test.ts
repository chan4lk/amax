import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import { ctxFor } from "../server/context";
import { recordDeployment, syncProposal, voidDeployment } from "../server/services";
import { proposalDb } from "./proposal-db";

describe.skipIf(!hasDb)("081 AC-18 release, rollback and sync rules hold with owners and withdrawals (Postgres)", () => {
  let db: Awaited<ReturnType<typeof proposalDb>>;
  let maya: Viewer;
  beforeAll(async () => { db = await proposalDb(); maya = await db.as("maya"); }, 120_000);
  afterAll(() => db?.t.drop());

  const phase = async (key: string) => (await db.row(key)).phase as string;

  it("AC18 Prod releases only live proposals and tells their owners; a void restores the phase; a sync never takes Released back", async () => {
    const nimal = await db.as("nimal");
    await db.t.owner`update delivery.proposal set meta = meta || '{"withdrawn": true}'::jsonb where key = 'CON-011'`;
    const before = await phase("CON-011");
    await recordDeployment(ctxFor(maya), { projectKey: "CON", version: "v2.5.0", environment: "Prod" });
    expect([await phase("CON-014"), await phase("CON-011")]).toEqual(["released", before]);
    expect(await db.q(sql`select payload->>'ownerUserId' as owner from core.event where name = 'delivery.proposal.phase_changed' and payload->>'key' = 'CON-014'`)).toEqual([{ owner: nimal.userId }]);

    await voidDeployment(ctxFor(maya), { projectKey: "CON", version: "v2.5.0", environment: "Prod", reason: "Wrong build" });
    expect(await phase("CON-014")).toBe("building");

    const spec = { projectKey: "FLT", project: { name: "Fleet Tracker", client: "Northwind" }, key: "FLT-401", title: "Spec", phase: "verified" as const,
      tasksDone: 0, tasksTotal: 0, source: "specclaw", sourceRef: "401-spec", releasedAt: null, meta: {}, committedAt: "2026-10-10T09:00:00Z" };
    await syncProposal(ctxFor(maya), spec);
    await db.t.owner`update delivery.proposal set phase = 'released', released_at = now() where key = 'FLT-401'`;
    await syncProposal(ctxFor(maya), { ...spec, phase: "building", title: "Spec v2", committedAt: "2026-10-11T09:00:00Z" });
    // 091 AC-7: the owner comes from the repo (none named here), never from who ran the sync.
    expect(await db.row("FLT-401")).toMatchObject({ phase: "released", title: "Spec v2", owner_user_id: null });
  });
});
