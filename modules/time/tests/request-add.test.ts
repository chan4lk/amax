import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { ctxFor } from "../server/context";
import { approveWeek } from "../server/decide";
import { decideRequest } from "../server/decide-request";
import { additionCard, requestAddition } from "../server/request-add";
import { listRequests } from "../server/requests-read";
import { requestsWorld } from "./requests-world";

// 073: a request to ADD hours to a submitted or approved week (weekend work after submitting), applied by an approver
// (logged for the person) or answered by reopening the week; everything else about requests stays as it was.
describe.skipIf(!hasDb)("073: requests to add hours to a locked week (Postgres)", () => {
  let w: Awaited<ReturnType<typeof requestsWorld>>;
  beforeAll(async () => { w = await requestsWorld(); }, 120_000);
  afterAll(() => w?.db.t.drop());
  const as = (key: string) => w.db.as(key);
  const sat = (key: string) => w.db.q(sql`select e.hours::float as hours, e.logged_by from time.entry e join auth.user u on u.id = e.user_id
    where u.email = ${`${key}@lumenlabs.test`} and e.day = '2026-10-17' and e.deleted_at is null`);
  const weekOf = async (key: string) => (await w.db.q(sql`select w.id, w.status from time.week w join auth.user u on u.id = w.user_id where u.email = ${`${key}@lumenlabs.test`} and w.iso_week = 42`))[0];
  const ask = { projectKey: "FLT", day: "2026-10-17", hours: 3, weekend: true, reason: "Worked Saturday on the release" };

  it("asks on a submitted week, changes nothing until applied, then logs the hours for the person and tells them", async () => {
    const [kasun, maya] = await Promise.all([as("kasun"), as("maya")]);
    await expect(requestAddition(ctxFor(kasun), { ...ask, weekend: false })).rejects.toThrow(/weekend/);
    await expect(requestAddition(ctxFor(await as("tharushi")), ask)).rejects.toThrow(/log the hours yourself with log_time/);
    expect((await additionCard(kasun, ask)).title).toBe("Ask to add 3 h to Fleet Tracker, Sat Oct 17 (weekend)");
    const r = await requestAddition(ctxFor(kasun), ask);
    expect(await sat("kasun")).toEqual([]);
    const [seen] = await listRequests(maya, { id: r.id, mine: false });
    expect(seen).toMatchObject({ kind: "add", entryId: null, day: "2026-10-17", status: "pending", before: { projectName: "Fleet Tracker" } });
    expect(await decideRequest(ctxFor(maya), { requestId: r.id, decision: "apply" })).toMatchObject({ status: "applied" });
    expect(await sat("kasun")).toEqual([{ hours: 3, logged_by: expect.stringContaining("user:") }]);
    expect((await weekOf("kasun")).status).toBe("submitted");
    await w.tick();
    expect((await w.bell(kasun, "time.change-added")).map((b) => b.title)).toEqual(["Maya Fernando added your Fleet Tracker hours for Sat Oct 17"]);
  }, 60_000);

  it("on an approved week the addition is an audited locked change; reopening instead hands the week back as draft", async () => {
    const [nimal, maya] = await Promise.all([as("nimal"), as("maya")]);
    await approveWeek(ctxFor(maya), { weekId: (await weekOf("nimal")).id });
    const r = await requestAddition(ctxFor(nimal), ask);
    await decideRequest(ctxFor(maya), { requestId: r.id, decision: "apply" });
    expect(await sat("nimal")).toEqual([{ hours: 3, logged_by: expect.any(String) }]);
    expect(await w.db.q(sql`select after->>'requestId' as request from core.audit_event where action = 'time.week.locked_change' and resource_id = ${(await weekOf("nimal")).id}`)).toEqual([{ request: r.id }]);
    const ayesha = await as("ayesha");
    const again = await requestAddition(ctxFor(ayesha), { ...ask, projectKey: "HRI" });
    expect(await decideRequest(ctxFor(maya), { requestId: again.id, decision: "reopen" })).toMatchObject({ status: "reopened" });
    expect([(await weekOf("ayesha")).status, await sat("ayesha")]).toEqual(["draft", []]);
  }, 60_000);

  // 073 review round 1: applying an addition needs the project in the approver's reach, as a move does. Nimal is in
  // Kasun's week chain through Fleet Tracker; he may add Fleet Tracker hours, not HR Insights (Ayesha's). Maya, Kasun's
  // manager, may add either.
  it.each([
    ["nimal", "HRI", false],
    ["nimal", "FLT", true],
    ["maya", "HRI", true],
  ] as const)("%s applying an addition on %s: allowed %s", async (who, projectKey, allowed) => {
    const [kasun, approver] = await Promise.all([as("kasun"), as(who)]);
    const r = await requestAddition(ctxFor(kasun), { projectKey, day: "2026-10-18", hours: 1, weekend: true, reason: "Sunday deploy support" });
    const { proposeDecide } = await import("../server/decide-card");
    if (allowed) {
      await expect(decideRequest(ctxFor(approver), { requestId: r.id, decision: "apply" })).resolves.toMatchObject({ status: "applied" });
    } else {
      await expect(proposeDecide(approver, { requestId: r.id, decision: "apply" })).rejects.toThrow(/don't approve HR Insights/);
      await expect(decideRequest(ctxFor(approver), { requestId: r.id, decision: "apply" })).rejects.toThrow(/data scope/);
      await decideRequest(ctxFor(await as("maya")), { requestId: r.id, decision: "decline", note: "Raise it with Ayesha" });
    }
  }, 60_000);
});

