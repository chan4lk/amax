import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@amax/db";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import { EVENTS } from "../contracts";
import { ctxFor } from "../server/context";
import { setOwnerIn, updateProposal } from "../server/lifecycle";
import { proposeCreate, proposeUpdate } from "../server/proposal-card";
import { suggestedOwner } from "../server/proposal-kinds";
import { createProposal } from "../server/services";
import { proposalDb, T } from "./proposal-db";

describe.skipIf(!hasDb)("081 amendment 6 proposal owners (Postgres)", () => {
  let db: Awaited<ReturnType<typeof proposalDb>>;
  let maya: Viewer, nimal: Viewer;
  beforeAll(async () => {
    db = await proposalDb();
    [maya, nimal] = await Promise.all([db.as("maya"), db.as("nimal")]);
  }, 120_000);
  afterAll(() => db?.t.drop());

  const changes = (key: string) => db.q(sql`select payload->>'from' as "from", payload->>'to' as "to", payload->>'toName' as "toName", (payload->>'cleared')::boolean as cleared,
    payload->>'by' as by from core.event where name = ${EVENTS.ownerChanged} and payload->>'key' = ${key} order by created_at, id`);

  it("AC62 create, an owner change and a Suggested owner accept or undo raise owner_changed; the same owner again raises nothing", async () => {
    const { key } = await createProposal(ctxFor(maya), { projectKey: "CON", title: "Statement emails", ownerUserId: nimal.userId });
    expect(await changes(key)).toEqual([{ from: null, to: nimal.userId, toName: "Nimal Silva", cleared: false, by: `user:${maya.userId}` }]);

    await updateProposal(ctxFor(maya), { key, ownerUserId: nimal.userId });
    await updateProposal(ctxFor(maya), { key, title: "Statement emails, monthly" });
    expect(await changes(key)).toHaveLength(1);
    await updateProposal(ctxFor(maya), { key, ownerUserId: maya.userId });
    expect((await changes(key)).at(-1)).toMatchObject({ from: nimal.userId, to: maya.userId, toName: "Maya Fernando" });

    const cleared = await withTenant(db.app, T, (tx) => setOwnerIn(tx, ctxFor(maya), key, null, () => {}));
    expect(cleared.events).toEqual([{ name: EVENTS.ownerChanged, payload: expect.objectContaining({ from: maya.userId, to: null, toName: null, cleared: true }) }]);
  });

  it("AC67 only someone on the project can be named owner: refused before the card and in the service", async () => {
    const [kasun, sarah] = await Promise.all([db.as("kasun"), db.as("sarah")]);
    const { key } = await createProposal(ctxFor(maya), { projectKey: "CON", title: "Payment links", ownerUserId: nimal.userId });
    await expect(updateProposal(ctxFor(maya), { key, ownerUserId: maya.userId })).resolves.toBeTruthy();
    for (const who of [kasun, sarah]) {
      const off = `${who.name} isn't on Contoso Portal, so they can't own ${key}. Pick someone on the project.`;
      await expect(proposeUpdate(maya, { key, ownerUserId: who.userId })).rejects.toThrow(off);
      await expect(updateProposal(ctxFor(maya), { key, ownerUserId: who.userId })).rejects.toThrow(off);
      await expect(proposeCreate(maya, { projectKey: "CON", title: "X", ownerUserId: who.userId })).rejects.toThrow(/can't own its proposals/);
      await expect(createProposal(ctxFor(maya), { projectKey: "CON", title: "X", ownerUserId: who.userId })).rejects.toThrow(/can't own its proposals/);
    }
    await expect(updateProposal(ctxFor(maya), { key, ownerUserId: "00000000-0000-4000-8000-000000000000" })).rejects.toThrow(/active person/);
    expect((await db.row(key)).owner_name).toBe("Maya Fernando");
  });

  it("AC68 a Suggested owner who isn't on the project is refused at accept, with nothing written", async () => {
    const kasun = await db.as("kasun");
    const { key } = await createProposal(ctxFor(maya), { projectKey: "CON", title: "Refund emails" });
    const [p] = await db.q(sql`select id from delivery.proposal where key = ${key}`);
    await expect(withTenant(db.app, T, (tx) => suggestedOwner.apply(tx, ctxFor(maya), { proposalId: p.id as string, key, userId: kasun.userId, name: "Kasun Dias" })))
      .rejects.toThrow(`Kasun Dias isn't on Contoso Portal, so they can't own ${key}. Pick someone on the project. Nothing was changed.`);
    expect((await db.row(key)).owner_name).toBe("Maya Fernando");
  });
});
