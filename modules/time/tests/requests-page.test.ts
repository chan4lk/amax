import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { ctxFor } from "../server/context";
import { decideRequest } from "../server/decide-request";
import { requestChange } from "../server/request";
import { requestsPage, weekHistory } from "../server/requests-read";
import { requestsWorld } from "./requests-world";
import { reviewStateOf, stateOf } from "../ui/request-view";

// 077: the Requests page and a week's history, for the person who asked and the person who decides, in their scope.
describe("077 decided requests keep their outcome on both sides", () => {
  it.each([
    ["applied", ["good", "Applied"], ["good", "Change applied"]], ["completed", ["good", "Applied"], ["good", "Change applied"]],
    ["reopened", ["warn", "Week reopened"], ["warn", "Week reopened for you"]], ["declined", ["bad", "Declined"], ["bad", "Declined"]],
    ["cancelled", ["", "Withdrawn"], ["", "Withdrawn"]],
  ] as const)("AC9 %s", (status, reviewer, owner) => {
    const r = { status, answer: "It was billable", personName: "Kasun Dias" } as const;
    expect([reviewStateOf(r), stateOf(r)]).toEqual([reviewer, owner]);
  });
});

describe.skipIf(!hasDb)("077 requests page and week history (Postgres)", () => {
  let w: Awaited<ReturnType<typeof requestsWorld>>;
  let open: string;
  let declined: string;
  beforeAll(async () => {
    w = await requestsWorld();
    const [ayesha, kasun, maya] = await Promise.all([w.db.as("ayesha"), w.db.as("kasun"), w.db.as("maya")]);
    open = (await requestChange(ctxFor(ayesha), { entryId: (await w.entry(ayesha, "Contoso Portal", "2026-10-15")).id, hours: 5, reason: "Left early for the client call" })).id;
    declined = (await requestChange(ctxFor(kasun), { entryId: (await w.entry(kasun, "Fleet Tracker", "2026-10-15")).id, hours: 7, reason: "Half an hour was a break" })).id;
    await decideRequest(ctxFor(maya), { requestId: declined, decision: "decline", note: "The break was paid time" });
  }, 120_000);
  afterAll(() => w?.db.t.drop());
  const ids = (p: Awaited<ReturnType<typeof requestsPage>>) => ({ lens: p.lens, open: p.open.map((r) => r.id), decided: p.decided.map((r) => r.id) });

  it("AC9 lenses: a reviewer lands on To review with open ones first; the person who asked sees theirs under Mine", async () => {
    const [maya, kasun] = await Promise.all([w.db.as("maya"), w.db.as("kasun")]);
    const p = await requestsPage(maya, {});
    expect([ids(p), p.counts.review, p.weeks]).toEqual([{ lens: "review", open: [open], decided: [declined] }, 1, ["2026-W42"]]);
    const k = await requestsPage(kasun, {});
    expect([ids(k), k.reviews]).toEqual([{ lens: "mine", open: [], decided: [declined] }, false]);
    expect(k.decided[0]).toMatchObject({ status: "declined", decisionNote: "The break was paid time", deciderName: "Maya Fernando" });
  });

  it("AC9 status and week filters", async () => {
    const maya = await w.db.as("maya");
    expect(ids(await requestsPage(maya, { status: "declined" }))).toMatchObject({ open: [], decided: [declined] });
    expect(ids(await requestsPage(maya, { status: "open" }))).toMatchObject({ open: [open], decided: [] });
    const kasunId = (await w.db.q(sql`select id from auth.user where email = 'kasun@lumenlabs.test'`))[0].id as string;
    const byPerson = await requestsPage(maya, { person: kasunId });
    expect([ids(byPerson), byPerson.people.map((x) => x.name)]).toEqual([{ lens: "review", open: [], decided: [declined] }, ["Ayesha Rahman", "Kasun Dias"]]);
    const none = await requestsPage(maya, { week: "2026-W41" });
    expect([ids(none), none.total]).toEqual([{ lens: "review", open: [], decided: [] }, 2]);
  });

  it("AC9 scope: an Admin scoped to another entity sees none of these; unscoped, both", async () => {
    const sahan = await w.db.as("sahan");
    expect(ids(await requestsPage(sahan, { lens: "review" }))).toMatchObject({ open: [open], decided: [declined] });
    await w.db.t.owner`update auth.role_assignment set legal_entity_ids = array[(select id from core.legal_entity where id <> (select legal_entity_id from auth.user where email = 'kasun@lumenlabs.test') limit 1)]
      where role = 'Admin' and user_id = (select id from auth.user where email = 'sahan@lumenlabs.test')`;
    expect(ids(await requestsPage(await w.db.as("sahan"), { lens: "review" }))).toMatchObject({ open: [], decided: [] });
  });

  it("AC9 week history: decided only, the owner's own or the reviewed person's", async () => {
    const [maya, kasun, ayesha] = await Promise.all([w.db.as("maya"), w.db.as("kasun"), w.db.as("ayesha")]);
    const person = async (key: string) => (await w.db.q(sql`select id from auth.user where email = ${`${key}@lumenlabs.test`}`))[0].id as string;
    expect((await weekHistory(kasun, "2026-W42")).map((r) => r.id)).toEqual([declined]);
    expect((await weekHistory(ayesha, "2026-W42")).map((r) => r.id)).toEqual([]);
    expect((await weekHistory(maya, "2026-W42", await person("kasun"))).map((r) => r.id)).toEqual([declined]);
    expect((await weekHistory(maya, "2026-W42", await person("ayesha"))).map((r) => r.id)).toEqual([]);
  });
});
