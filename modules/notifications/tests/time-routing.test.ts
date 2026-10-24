import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { contextFor } from "@amax/core/server";
import { putSecret } from "@amax/core/secrets";
import { setEgress } from "@amax/api/egress";
import { notificationsDb, T } from "./db";

describe.skipIf(!hasDb)("072 Time's notices reach project approvers in the owner's entity, and decisions go by email (Postgres)", () => {
  let db: Awaited<ReturnType<typeof notificationsDb>>;
  const mail: { to: string; subject: string; body: string }[] = [];
  beforeAll(async () => {
    db = await notificationsDb();
    await putSecret(contextFor.job(T, "notifications-test"), { connector: "msgraph-mail", value: JSON.stringify({ tenant: "contoso-demo", clientId: "c1", clientSecret: "s", sender: "amax@contoso.example" }) });
    setEgress({
      resolve: async () => [{ address: "1.1.1.1", family: 4 }],
      exchange: async (url, init) => {
        if (url.href.includes("/sendMail")) { const m = JSON.parse(init.body).message; mail.push({ to: m.toRecipients[0].emailAddress.address, subject: m.subject, body: JSON.stringify(m.body) }); }
        return url.hostname === "login.microsoftonline.com" ? { status: 200, body: JSON.stringify({ access_token: "tok" }) } : { status: 202, body: "" };
      },
      send: async () => 200,
    });
  }, 120_000);
  afterAll(async () => { setEgress({}); await db?.t.drop(); });

  const bell = async (key: string, like: string) => (await db.q(sql`select title, body from notifications.notification where user_id = ${await db.idOf(key)} and title like ${like}`));
  const id = async (q: ReturnType<typeof sql>) => (await db.q(q))[0].id as string;

  it("AC3 AC4 TIM-T06 the project's PM hears of a submission and a change request; an unrelated PM and an approver outside the entity don't", async () => {
    const [kasun, flt, lk] = [await db.idOf("kasun"), await id(sql`select id from delivery.project where key = 'FLT'`), await id(sql`select legal_entity_id as id from auth.user where email = 'kasun@lumenlabs.test'`)];
    const route = { userId: kasun, week: "2026-W50", projectIds: [flt], legalEntityId: lk };
    await db.emit("time.week.submitted", { ...route, weekId: randomUUID(), hours: 12 });
    await db.drain();
    expect(await bell("nimal", "Kasun Dias submitted 2026-W50%")).toHaveLength(1);
    expect(await bell("maya", "Kasun Dias submitted 2026-W50%")).toHaveLength(1);
    expect(await bell("ayesha", "Kasun Dias submitted 2026-W50%")).toHaveLength(0);
    await db.emit("time.change.requested", { ...route, requestId: randomUUID(), weekId: randomUUID(), entryId: randomUUID(), projectName: "Fleet Tracker", dayLabel: "Thu Oct 15",
      change: "Hours 7 h → 5 h", reason: "Left early", answered: false, answer: null });
    await db.drain();
    expect(await bell("nimal", "Kasun Dias asked to change Fleet Tracker, Thu Oct 15")).toHaveLength(1);

    const [{ other }] = await db.q(sql`select id as other from core.legal_entity where id <> ${lk} limit 1`);
    await db.t.owner`update auth.role_assignment set legal_entity_ids = ${[other as string]} where user_id = (select id from auth.user where email = 'nimal@lumenlabs.test')`;
    await db.emit("time.week.submitted", { ...route, weekId: randomUUID(), week: "2026-W51", hours: 8 });
    await db.drain();
    expect(await bell("nimal", "Kasun Dias submitted 2026-W51%")).toHaveLength(0);
    expect(await bell("maya", "Kasun Dias submitted 2026-W51%")).toHaveLength(1);
  }, 120_000);

  it("AC5 an approved, rejected or reopened week reaches its owner in the bell and by email; the rejection carries the comment", async () => {
    const [tharushi, maya] = [await db.idOf("tharushi"), await db.idOf("maya")];
    const base = { userId: tharushi, by: maya, chain: "manager" };
    await db.emit("time.week.approved", { ...base, weekId: randomUUID(), week: "2026-W40", comment: null });
    await db.emit("time.week.rejected", { ...base, weekId: randomUUID(), week: "2026-W41", comment: "Split Tuesday by project" });
    await db.emit("time.week.reopened", { userId: tharushi, by: maya, weekId: randomUUID(), week: "2026-W39", reason: "Fix Monday" });
    await db.drain();
    expect((await bell("tharushi", "Your timesheet for 2026-W4%")).map((b) => b.title).sort()).toEqual(["Your timesheet for 2026-W40 was approved", "Your timesheet for 2026-W41 was sent back"]);
    expect(await bell("tharushi", "%2026-W39%")).toHaveLength(1);
    const hers = mail.filter((m) => m.to === "tharushi@lumenlabs.test");
    expect(hers.map((m) => m.subject).sort()).toEqual(expect.arrayContaining(["Your timesheet for 2026-W40 was approved", "Your timesheet for 2026-W41 was sent back"]));
    expect(hers.find((m) => m.subject.includes("W41"))!.body).toContain("Split Tuesday by project");
    expect(hers.some((m) => m.subject.includes("2026-W39"))).toBe(true);
  }, 120_000);
});
