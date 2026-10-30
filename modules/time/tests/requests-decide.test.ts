import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { configureAi } from "@amax/ai";
import { fakeProvider } from "@amax/ai/fake";
import { chatTurn } from "@amax/chat";
import { ctxFor } from "../server/context";
import { correctEntry } from "../server/correct";
import { approveWeek } from "../server/decide";
import { decideRequest } from "../server/decide-request";
import { requestChange } from "../server/request";
import { submitWeek } from "../server/submit";
import { requestsWorld } from "./requests-world";

describe.skipIf(!hasDb)("070 amendment 3: deciding change requests (Postgres)", () => {
  let w: Awaited<ReturnType<typeof requestsWorld>>;
  beforeAll(async () => { w = await requestsWorld(); }, 120_000);
  afterAll(() => w?.db.t.drop());
  const as = (key: string) => w.db.as(key);
  const row = async (id: string) => (await w.db.q(sql`select hours::float as hours, revision, deleted_at is not null as deleted from time.entry where id = ${id}`))[0];
  const weekStatus = async (key: string) => (await w.db.q(sql`select w.status from time.week w join auth.user u on u.id = w.user_id where u.email = ${`${key}@lumenlabs.test`} and w.iso_week = 42`))[0].status;

  it("AC34 apply changes the entry and keeps the week submitted; a replay, a stale entry and a decline change nothing more", async () => {
    const [kasun, maya] = await Promise.all([as("kasun"), as("maya")]);
    const thu = await w.entry(kasun, "Fleet Tracker", "2026-10-15");
    const r = await requestChange(ctxFor(kasun), { entryId: thu.id, hours: 1, reason: "Left early for the client call" });
    expect(await decideRequest(ctxFor(maya), { requestId: r.id, decision: "apply" })).toMatchObject({ status: "applied" });
    expect([await row(thu.id), await weekStatus("kasun")]).toEqual([{ hours: 1, revision: 2, deleted: false }, "submitted"]);
    await expect(decideRequest(ctxFor(maya), { requestId: r.id, decision: "apply" })).rejects.toThrow(/applied/);
    await w.tick();
    expect(await w.bell(kasun, "time.entry-%")).toEqual([{ title: "Maya Fernando changed your Fleet Tracker hours for Thu Oct 15", body: "Left early for the client call" }]);
    const fri = await w.entry(kasun, "Fleet Tracker", "2026-10-16");
    const stale = await requestChange(ctxFor(kasun), { entryId: fri.id, remove: true, reason: "Logged twice" });
    await w.db.t.owner`update time.entry set revision = revision + 1 where id = ${fri.id}`;
    await expect(decideRequest(ctxFor(maya), { requestId: stale.id, decision: "apply" })).rejects.toThrow(/entry changed since the request/);
    await decideRequest(ctxFor(maya), { requestId: stale.id, decision: "decline", note: "Ask again once it's settled" });
    expect([await w.status(stale.id), (await row(fri.id)).deleted]).toEqual(["declined", false]);
  }, 60_000);

  it("AC34 (D7) apply on an approved week keeps it approved, audited as a locked change with the request id", async () => {
    const [kasun, maya, sahan] = await Promise.all([as("kasun"), as("maya"), as("sahan")]);
    await approveWeek(ctxFor(maya), { person: "kasun@lumenlabs.test", week: "2026-W42" });
    const mon = await w.entry(kasun, "Contoso Portal", "2026-10-12");
    const r = await requestChange(ctxFor(kasun), { entryId: mon.id, hours: 2, reason: "Standup counted twice" });
    await decideRequest(ctxFor(sahan), { requestId: r.id, decision: "apply" });
    expect([(await row(mon.id)).hours, await weekStatus("kasun")]).toEqual([2, "approved"]);
    expect(await w.db.q(sql`select after->>'requestId' as id from core.audit_event where action = 'time.week.locked_change'`)).toEqual([{ id: r.id }]);
  });

  it("AC34 (D8, D9) a PM reopens an approved week, the owner is told, fixes and resubmits, and the request completes; a submitted week goes back to draft too (073)", async () => {
    const [kasun, nimal, ayesha, maya] = await Promise.all([as("kasun"), as("nimal"), as("ayesha"), as("maya")]);
    const tue = await w.entry(kasun, "Contoso Portal", "2026-10-13");
    const r = await requestChange(ctxFor(kasun), { entryId: tue.id, hours: 6, reason: "Client workshop ended at 3" });
    await decideRequest(ctxFor(nimal), { requestId: r.id, decision: "reopen" });
    expect([await weekStatus("kasun"), await w.status(r.id)]).toEqual(["draft", "reopened"]);
    expect(await w.db.q(sql`select chain from time.approval where decision = 'reopened'`)).toEqual([{ chain: "project" }]);
    await w.tick();
    expect((await w.bell(kasun, "time.week-reopened")).map((b) => b.title)).toEqual(["Your timesheet for 2026-W42 was reopened"]);
    await correctEntry(ctxFor(kasun), { entryId: tue.id, hours: 6 });
    await submitWeek(ctxFor(kasun), { week: "2026-W42" });
    expect(await w.status(r.id)).toBe("completed");
    const hri = await w.entry(ayesha, "HR Insights", "2026-10-13");
    const sent = await requestChange(ctxFor(ayesha), { entryId: hri.id, hours: 7, reason: "Dentist at 4" });
    await decideRequest(ctxFor(maya), { requestId: sent.id, decision: "reopen" });
    // 073: a submitted week goes back to draft too, not "rejected".
    expect([await weekStatus("ayesha"), await w.status(sent.id)]).toEqual(["draft", "reopened"]);
    await w.tick();
    expect((await w.bell(ayesha, "time.week-reopened")).map((b) => b.title)).toEqual(["Your timesheet for 2026-W42 was reopened"]);
    expect(await w.bell(ayesha, "time.week-rejected")).toEqual([]);
  }, 60_000);

  it("AC34 the approver's card names the person, the entry, the change and what happens to the week", async () => {
    const [nimal, maya] = await Promise.all([as("nimal"), as("maya")]);
    const r = await requestChange(ctxFor(nimal), { entryId: (await w.entry(nimal, "Fleet Tracker", "2026-10-14")).id, hours: 6, reason: "Half day" });
    configureAi({ provider: fakeProvider([() => ({ toolCalls: [{ type: "tool_use", id: "c1", name: "decide_change_request", input: { requestId: r.id, decision: "apply" } }] }), () => ({ text: "Confirm?" })]), db: w.db.app, model: "claude-haiku-5-5" });
    const [card] = (await chatTurn(w.db.app, w.registry, maya, { text: "apply it" })).pending;
    expect([card.title, card.lines?.map((l) => l.label)]).toEqual(["Apply Nimal Silva's change: Fleet Tracker, Wed Oct 14", ["Hours", "Reason", "Week", "Notice"]]);
  });

  // Review round 1: Nimal is in Kasun's week chain through Fleet Tracker, which he approves. He can move Kasun's
  // Contoso hours to Fleet Tracker, but not to HR Insights (Ayesha's), and a request with no move still applies.
  it.each([
    ["to a project he doesn't approve", "2026-10-12", { projectKey: "HRI" }, /don't approve HR Insights/],
    ["to the project he approves", "2026-10-13", { projectKey: "FLT" }, null],
    ["no move, only the hours", "2026-10-14", { hours: 2 }, null],
  ] as const)("a move is checked against the approver's projects: %s", async (_, day, change, problem) => {
    const [kasun, who] = await Promise.all([as("kasun"), as("nimal")]);
    const e = await w.entry(kasun, "Contoso Portal", day);
    const r = await requestChange(ctxFor(kasun), { entryId: e.id, ...change, reason: "Booked to the wrong project" });
    const before = await row(e.id);
    if (problem) {
      await expect(decideRequest(ctxFor(who), { requestId: r.id, decision: "apply" })).rejects.toThrow(/data scope/);
      const { proposeDecide } = await import("../server/decide-card");
      await expect(proposeDecide(who, { requestId: r.id, decision: "apply" })).rejects.toThrow(problem);
      expect(await row(e.id)).toEqual(before);
    } else await expect(decideRequest(ctxFor(who), { requestId: r.id, decision: "apply" })).resolves.toMatchObject({ status: "applied" });
  });

  // 073 review round 3: one rule for putting someone's hours on a project, whichever path. The direct move
  // (correct_time_entry on Tharushi's draft Fleet Tracker entry) gives the same answers as the requested move above:
  // Nimal (PM of Fleet Tracker) may not move hours to HR Insights; Maya (Admin) may.
  it.each([
    ["nimal", "HRI", false],
    ["maya", "HRI", true],
  ] as const)("a direct move by %s to %s: allowed %s, as for a requested move", async (who, projectKey, allowed) => {
    const [tharushi, mover] = await Promise.all([as("tharushi"), as(who)]);
    const e = await w.entry(tharushi, "Fleet Tracker", allowed ? "2026-10-13" : "2026-10-12");
    const run = correctEntry(ctxFor(mover), { entryId: e.id, projectKey, reason: "Booked to the wrong project" });
    if (allowed) await expect(run).resolves.toMatchObject({ id: e.id });
    else await expect(run).rejects.toThrow(/data scope/);
  });
});

