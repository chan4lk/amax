import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { notificationsDb, T } from "./db";

describe.skipIf(!hasDb)("081 a proposal's owner hears what others do to it (Postgres)", () => {
  let db: Awaited<ReturnType<typeof notificationsDb>>;
  beforeAll(async () => { db = await notificationsDb(); }, 120_000);
  afterAll(() => db?.t.drop());

  const bell = async (key: string, like: string) => db.q(sql`select title, href from notifications.notification where user_id = ${await db.idOf(key)} and title like ${like}`);

  it("AC19 a phase change or a finished task by someone else reaches the owner with a link; their own, or an agent's for them, doesn't", async () => {
    const [kasun, maya] = [await db.idOf("kasun"), await db.idOf("maya")];
    const [flt] = await db.q(sql`select id from delivery.project where key = 'FLT'`);
    const base = { proposalId: randomUUID(), key: "FLT-015", projectId: flt.id as string, ownerUserId: kasun };
    await db.emit("delivery.proposal.phase_changed", { ...base, from: "proposed", to: "planned", by: `user:${maya}` });
    await db.emit("delivery.proposal.phase_changed", { ...base, from: "planned", to: "building", by: `agent:claude for user:${kasun}` });
    await db.emit("delivery.task.done", { ...base, task: "T2", by: `sp:${randomUUID()} for user:${maya}` });
    await db.emit("delivery.task.done", { ...base, task: "T3", by: `user:${kasun}` });
    await db.emit("delivery.proposal.phase_changed", { ...base, ownerUserId: null, from: "building", to: "verified", by: `user:${maya}` });
    await db.drain();
    expect(await bell("kasun", "FLT-015%")).toEqual([{ title: "FLT-015 moved from proposed to planned", href: "/delivery/proposals/FLT-015" }]);
    expect(await bell("kasun", "Task % of FLT-015 is done")).toEqual([{ title: "Task T2 of FLT-015 is done", href: "/delivery/proposals/FLT-015" }]);
    expect(await bell("maya", "%FLT-015%")).toEqual([]);
  }, 120_000);

  it("AC27 the project's PMs hear a proposal is verified, not other projects' PMs nor the PM who moved it; an owner-PM gets one", async () => {
    const [kasun, maya, nimal] = [await db.idOf("kasun"), await db.idOf("maya"), await db.idOf("nimal")];
    await db.t.owner`insert into auth.role_assignment (tenant_id, user_id, role, source) values (${T}, ${nimal}, 'PM', 'manual') on conflict do nothing`;
    const [con] = await db.q(sql`select id from delivery.project where key = 'CON'`);
    const verified = (key: string, by: string, owner: string | null, from = "building") =>
      db.emit("delivery.proposal.phase_changed", { proposalId: randomUUID(), key, projectId: con.id as string, from, to: "verified", by, ownerUserId: owner });
    await verified("CON-501", `user:${kasun}`, kasun);
    await verified("CON-502", `user:${maya}`, kasun);
    await verified("CON-503", `agent:claude for user:${kasun}`, maya);
    const [flt] = await db.q(sql`select id from delivery.project where key = 'FLT'`);
    await db.emit("delivery.proposal.phase_changed", { proposalId: randomUUID(), key: "FLT-505", projectId: flt.id as string, from: "building", to: "verified", by: `user:${kasun}`, ownerUserId: kasun });
    await db.emit("delivery.proposal.phase_changed", { proposalId: randomUUID(), key: "CON-504", projectId: con.id as string, from: "proposed", to: "planned", by: `user:${kasun}`, ownerUserId: kasun });
    await db.drain();
    expect(await bell("maya", "CON-501%")).toEqual([{ title: "CON-501 is verified and ready for a release", href: "/delivery/proposals/CON-501" }]);
    expect((await bell("maya", "CON-503%")).length).toBe(1);
    expect(await bell("maya", "CON-502%")).toEqual([]);
    expect(await bell("maya", "CON-504%")).toEqual([]);
    expect(await bell("nimal", "CON-50%")).toEqual([]);
    expect(await bell("nimal", "FLT-505%")).toEqual([{ title: "FLT-505 is verified and ready for a release", href: "/delivery/proposals/FLT-505" }]);
  }, 120_000);

  it("081 AC64 to AC66 a new owner hears it's theirs and the previous owner who has it now; nobody hears of their own action", async () => {
    const [kasun, maya, nimal] = [await db.idOf("kasun"), await db.idOf("maya"), await db.idOf("nimal")];
    const [con] = await db.q(sql`select id from delivery.project where key = 'CON'`);
    const owned = (key: string, from: string | null, to: string | null, toName: string | null, by: string) => db.emit("delivery.proposal.owner_changed",
      { proposalId: randomUUID(), key, title: "Owner test", projectId: con.id as string, from, to, toName, cleared: !to, by });
    await owned("CON-601", null, nimal, "Nimal Silva", `user:${maya}`);
    await owned("CON-602", nimal, kasun, "Kasun Dias", `user:${maya}`);
    await owned("CON-603", kasun, null, null, `user:${maya}`);
    await owned("CON-604", null, maya, "Maya Fernando", `user:${maya}`);
    await owned("CON-605", nimal, kasun, "Kasun Dias", `agent:claude for user:${kasun}`);
    await db.drain();
    expect(await bell("nimal", "%CON-601%")).toEqual([{ title: "You now own CON-601: Owner test", href: "/delivery/proposals/CON-601" }]);
    expect(await bell("kasun", "%CON-602%")).toEqual([{ title: "You now own CON-602: Owner test", href: "/delivery/proposals/CON-602" }]);
    expect(await bell("nimal", "%CON-602%")).toEqual([{ title: "CON-602 has a new owner: Kasun Dias", href: "/delivery/proposals/CON-602" }]);
    expect(await bell("kasun", "%CON-603%")).toEqual([{ title: "CON-603 no longer has an owner", href: "/delivery/proposals/CON-603" }]);
    expect(await bell("maya", "%CON-60%")).toEqual([]);
    expect(await bell("kasun", "%CON-605%")).toEqual([]);
    expect(await bell("nimal", "%CON-605%")).toEqual([{ title: "CON-605 has a new owner: Kasun Dias", href: "/delivery/proposals/CON-605" }]);
  }, 120_000);

  it("081 AC74 a withdrawal by someone else tells the owner with the reason; their own, or an agent's for them, doesn't", async () => {
    const [kasun, maya] = [await db.idOf("kasun"), await db.idOf("maya")];
    const [con] = await db.q(sql`select id from delivery.project where key = 'CON'`);
    const withdrawn = (key: string, by: string, owner: string | null) =>
      db.emit("delivery.proposal.withdrawn", { proposalId: randomUUID(), key, title: "Withdraw test", projectId: con.id as string, by, reason: "Client dropped it", ownerUserId: owner });
    await withdrawn("CON-701", `user:${maya}`, kasun);
    await withdrawn("CON-702", `user:${kasun}`, kasun);
    await withdrawn("CON-703", `agent:claude for user:${kasun}`, kasun);
    await withdrawn("CON-704", `user:${maya}`, null);
    await db.drain();
    expect(await bell("kasun", "CON-70%")).toEqual([{ title: "CON-701 was withdrawn: Client dropped it", href: "/delivery/proposals/CON-701" }]);
    expect(await bell("maya", "CON-70%")).toEqual([]);
  }, 120_000);

  it("081 AC75 a rollback reaches the PMs who manage that project (and Admins), not other projects' PMs; a deploy or a test notifies no one", async () => {
    const nimal = await db.idOf("nimal");
    await db.t.owner`insert into auth.role_assignment (tenant_id, user_id, role, source) values (${T}, ${nimal}, 'PM', 'manual') on conflict do nothing`;
    const [con, flt] = await db.q(sql`select id from delivery.project where key in ('CON', 'FLT') order by key`);
    const deployed = (projectId: string, version: string, status: string) =>
      db.emit("delivery.release.deployed", { releaseId: randomUUID(), projectId, version, environment: "QA", status, released: false });
    await deployed(con.id as string, "v8.1.0", "rolled-back");
    await deployed(flt.id as string, "v8.2.0", "rolled-back");
    await deployed(flt.id as string, "v8.3.0", "deployed");
    await deployed(flt.id as string, "v8.4.0", "testing");
    await db.drain();
    const heard = async (key: string) => (await bell(key, "Release v8.%")).map((n) => n.title).sort();
    expect(await heard("nimal")).toEqual(["Release v8.2.0 rolled back in QA"]);
    expect(await heard("maya")).toEqual(["Release v8.1.0 rolled back in QA", "Release v8.2.0 rolled back in QA"]);
    expect(await heard("kasun")).toEqual([]);
  }, 120_000);
});
