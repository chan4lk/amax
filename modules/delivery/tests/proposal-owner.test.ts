import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { ctxFor } from "../server/context";
import { createProposal, syncProposal } from "../server/services";
import { proposalDb } from "./proposal-db";

const spec = (key: string) => ({ projectKey: "FLT", project: { name: "Fleet Tracker", client: "Northwind" }, key, title: "Spec change", phase: "planned" as const,
  tasksDone: 0, tasksTotal: 0, source: "specclaw", sourceRef: key, releasedAt: null, meta: {}, committedAt: "2026-10-10T09:00:00Z" });

describe.skipIf(!hasDb)("081 AC-5 proposal owners (Postgres)", () => {
  let db: Awaited<ReturnType<typeof proposalDb>>;
  beforeAll(async () => { db = await proposalDb(); }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC5 a hand-made proposal is owned by its maker or the person named; a synced one by who it was synced for, and a later sync keeps it", async () => {
    const maya = await db.as("maya", "PM");
    const nimal = await db.as("nimal");
    const mine = await createProposal(ctxFor(maya), { projectKey: "CON", title: "Dunning emails" });
    expect(await db.row(mine.key)).toMatchObject({ owner_user_id: maya.userId, owner_name: expect.stringMatching(/^Maya/) });
    const theirs = await createProposal(ctxFor(maya), { projectKey: "CON", title: "Credit notes", ownerUserId: nimal.userId, description: "Partial refunds" });
    expect(await db.row(theirs.key)).toMatchObject({ owner_user_id: nimal.userId, owner_name: "Nimal Silva", description: "Partial refunds" });
    await expect(createProposal(ctxFor(maya), { projectKey: "CON", title: "Ghost", ownerUserId: "00000000-0000-4000-8000-000000000000" })).rejects.toThrow(/active person/);

    // 091 AC-7: a synced one is owned by who its repo names, never by who ran the sync (owner-091.test covers the rest).
    const sahan = await db.as("sahan");
    await syncProposal(ctxFor(sahan), spec("FLT-201"));
    expect(await db.row("FLT-201")).toMatchObject({ owner_user_id: null });
    await syncProposal(ctxFor(await db.as("maya")), { ...spec("FLT-201"), title: "Spec change v2", committedAt: "2026-10-11T09:00:00Z" });
    expect(await db.row("FLT-201")).toMatchObject({ owner_user_id: null, title: "Spec change v2" });
  });
});
