import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { upsertPasswordUser, type Viewer } from "@amax/auth";
import { createRegistry } from "@amax/mcp";
import delivery from "../module";
import { managerCard } from "../server/manager";
import { setUpProjectCard } from "../server/set-up-project-card";
import { proposalDb, T } from "./proposal-db";

describe.skipIf(!hasDb)("107 hand over the PM (Postgres)", () => {
  let db: Awaited<ReturnType<typeof proposalDb>>;
  let maya: Viewer, nimal: Viewer;
  const registry = createRegistry([delivery]);
  const hand = (v: Viewer, projectKey: string, userId: string) => registry.call(v, "set_project_manager", { projectKey, userId }, { source: "mcp" });
  beforeAll(async () => { db = await proposalDb(); maya = await db.as("maya"); nimal = await db.as("nimal"); }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC1 the current PM hands CON to Sahan: he manages it at once, audited, and the event names both", async () => {
    const sahan = await db.as("sahan");
    await expect(hand(maya, "CON", sahan.userId)).resolves.toMatchObject({ projectKey: "CON", manager: "Sahan Kumara" });
    const [p] = await db.q(sql`select id, manager_user_id from delivery.project where key = 'CON'`);
    expect(p.manager_user_id).toBe(sahan.userId);
    expect((await db.as("sahan")).managedProjects).toContain(p.id);
    const [audit] = await db.q(sql`select before, after from core.audit_event where action = 'delivery.project.manager' order by seq desc limit 1`);
    expect(audit).toMatchObject({ before: { managerUserId: maya.userId }, after: { managerUserId: sahan.userId } });
  });

  it("AC2 the card names who it was; someone not active is refused before the card", async () => {
    const card = await managerCard(maya, { projectKey: "FLT", userId: maya.userId });
    expect(card.title).toBe("Make Maya Fernando the PM of FLT (was Nimal Silva)");
    expect(card.look?.confirm).toBe("Make PM");
    const tool = registry.toolsFor(maya).find((t) => t.name === "set_project_manager")!;
    await expect(tool.propose!(maya as never, { projectKey: "FLT", userId: randomUUID() } as never)).rejects.toMatchObject({ field: "userId" });
  });

  it.each([["kasun", /doesn't hold the PM role/], ["tharushi", /doesn't hold the PM role/], ["sahan", null]])("B1 the new PM must hold PM or Admin: %s", async (who, refused) => {
    const target = await db.as(who);
    const tool = registry.toolsFor(maya).find((t) => t.name === "set_project_manager")!;
    const check = tool.propose!(maya as never, { projectKey: "FLT", userId: target.userId } as never);
    if (refused) await expect(check).rejects.toMatchObject({ field: "userId", message: expect.stringMatching(refused) });
    else await expect(check).resolves.toBeUndefined();
  });

  it("B12 two handovers at once run one after the other: the second's audit names the first's PM as before", async () => {
    const pm2 = await upsertPasswordUser(db.app, T, { email: "pm.two@lumenlabs.test", name: "Pat Two (fictional)", roles: ["PM"], password: "a-long-password-1234" });
    const sahan = await db.as("sahan");
    const [{ manager_user_id: start }] = await db.q(sql`select manager_user_id from delivery.project where key = 'FLT'`);
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const held = db.t.owner.begin(async (tx) => { await tx`select id from delivery.project where key = 'FLT' for update`; await gate; });
    await new Promise((r) => setTimeout(r, 50));
    const both = Promise.all([hand(maya, "FLT", sahan.userId), hand(maya, "FLT", pm2)]);
    for (let i = 0; i < 200 && Number((await db.t.owner`select count(*)::int as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`)[0].n) < 2; i++) await new Promise((r) => setTimeout(r, 25));
    release();
    await held;
    await both;
    const audits = await db.q(sql`select before, after from core.audit_event where action = 'delivery.project.manager' order by seq desc limit 2`);
    const [second, first] = audits.map((a) => a as { before: { managerUserId: string }; after: { managerUserId: string } });
    expect(first.before.managerUserId).toBe(start);
    expect(second.before.managerUserId).toBe(first.after.managerUserId);
  });

  it("AC9 once 106's card sets a project up, its receipt offers to add the team", async () => {
    const card = await setUpProjectCard(maya, { key: "NWP", name: "Northwind Portal" });
    expect(card.look?.next).toEqual({ label: "Add your team?", prompt: "Add someone to NWP" });
  });

  it("AC10 a PM hands over only a project they manage; an Engineer gets no tool", async () => {
    await expect(hand(nimal, "HRI", nimal.userId)).rejects.toThrow(/forbidden|scope/i);
    expect(registry.toolsFor(await db.as("kasun")).map((t) => t.name)).not.toContain("set_project_manager");
  });
});
