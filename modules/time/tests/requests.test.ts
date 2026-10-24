import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { configureAi } from "@amax/ai";
import { fakeProvider } from "@amax/ai/fake";
import { chatTurn } from "@amax/chat";
import { ctxFor } from "../server/context";
import { decideRequest } from "../server/decide-request";
import { answerRequest, cancelRequest, requestChange } from "../server/request";
import { requestsWorld } from "./requests-world";

describe.skipIf(!hasDb)("070 amendment 3: asking for a change to a locked week (Postgres)", () => {
  let w: Awaited<ReturnType<typeof requestsWorld>>;
  beforeAll(async () => { w = await requestsWorld(); }, 120_000);
  afterAll(() => w?.db.t.drop());
  const as = (key: string) => w.db.as(key);
  const total = async (key: string) => ((await w.registry.call(await as(key), "get_my_week", { week: "2026-W42" }, { source: "mcp" })) as { total: number }).total;

  it("AC30 the owner asks about a submitted week; nothing on it changes; a draft week, someone else's entry and a second open request are refused", async () => {
    const [ayesha, tharushi] = await Promise.all([as("ayesha"), as("tharushi")]);
    const e = await w.entry(ayesha, "Contoso Portal", "2026-10-15");
    const before = [await total("ayesha"), await w.db.q(sql`select hours::float as h from reports.logged_hours where entry_id = ${e.id}`)];
    const r = await requestChange(ctxFor(ayesha), { entryId: e.id, hours: 5, reason: "Left early for the client call" });
    expect(r).toMatchObject({ status: "pending", week: "2026-W42", entry: "Contoso Portal, Thu Oct 15", change: `Hours ${e.hours} h → 5 h` });
    expect([await total("ayesha"), await w.db.q(sql`select hours::float as h from reports.logged_hours where entry_id = ${e.id}`)]).toEqual(before);
    await expect(requestChange(ctxFor(ayesha), { entryId: e.id, remove: true, reason: "Again" })).rejects.toThrow(/already has an open change request/);
    await expect(requestChange(ctxFor(tharushi), { entryId: (await w.entry(tharushi, "Fleet Tracker", "2026-10-12")).id, hours: 6, reason: "Typo" })).rejects.toThrow(/is draft, so you can fix it yourself/);
    await expect(requestChange(ctxFor(tharushi), { entryId: e.id, hours: 6, reason: "Not mine" })).rejects.toThrow();
  });

  it("AC32 and AC33 the request reaches the owner's approver and not the owner; someone outside the chain can't see or decide it", async () => {
    const [ayesha, maya, dinesh] = await Promise.all([as("ayesha"), as("maya"), as("dinesh")]);
    await w.tick();
    expect(await w.bell(maya, "time.change-%")).toEqual([{ title: "Ayesha Rahman asked to change Contoso Portal, Thu Oct 15", body: expect.stringContaining("Left early for the client call") }]);
    expect(await w.bell(ayesha, "time.change-%")).toEqual([]);
    const [mine] = (await w.registry.call(ayesha, "get_change_requests", {}, { source: "mcp" })) as { id: string }[];
    expect((await w.registry.call(maya, "get_change_requests", { mine: false }, { source: "mcp" })) as unknown[]).toHaveLength(1);
    expect(await w.registry.call(dinesh, "get_change_requests", {}, { source: "mcp" })).toEqual([]);
    await expect(decideRequest(ctxFor(dinesh), { requestId: mine.id, decision: "decline", note: "No" })).rejects.toThrow();
  }, 60_000);

  it("AC35 ask, answer and back to pending; a withdrawn request can't be decided", async () => {
    const [ayesha, maya] = await Promise.all([as("ayesha"), as("maya")]);
    const [r] = (await w.registry.call(ayesha, "get_change_requests", {}, { source: "mcp" })) as { id: string }[];
    await decideRequest(ctxFor(maya), { requestId: r.id, decision: "ask", note: "Which client call?" });
    await expect(decideRequest(ctxFor(maya), { requestId: r.id, decision: "apply" })).rejects.toThrow(/needs info/);
    await answerRequest(ctxFor(ayesha), { requestId: r.id, answer: "The Northwind demo, 3 pm" });
    expect(await w.status(r.id)).toBe("pending");
    await w.tick();
    expect((await w.bell(ayesha, "time.change-asked")).map((b) => b.title)).toEqual(["Maya Fernando has a question about your change to Contoso Portal, Thu Oct 15"]);
    expect((await w.bell(maya, "time.change-answered")).map((b) => b.body)).toEqual(["The Northwind demo, 3 pm"]);
    await cancelRequest(ctxFor(ayesha), { requestId: r.id });
    await expect(decideRequest(ctxFor(maya), { requestId: r.id, decision: "decline", note: "Late" })).rejects.toThrow(/cancelled/);
  }, 60_000);

  it("AC31 chat routes by week state: a fix on a submitted week makes no correction card but a request card", async () => {
    const ayesha = await as("ayesha");
    const e = await w.entry(ayesha, "HR Insights", "2026-10-12");
    const turn = async (name: string, input: object) => {
      configureAi({ provider: fakeProvider([() => ({ toolCalls: [{ type: "tool_use", id: "c1", name, input }] }), () => ({ text: "Done." })]), db: w.db.app, model: "claude-haiku-5-5" });
      return (await chatTurn(w.db.app, w.registry, ayesha, { text: "fix Monday" })).pending.map((p) => ({ title: p.title, lines: p.lines }));
    };
    expect(await turn("correct_time_entry", { project: "HR Insights", day: e.day, hoursBefore: e.hours, hours: 6, entryId: e.id })).toEqual([]);
    expect(await turn("request_time_change", { entryId: e.id, hours: 6, reason: "Half day at the dentist" })).toEqual([{ title: "Ask to change HR Insights, Mon Oct 12",
      lines: [{ label: "Hours", value: `${e.hours} h → 6 h` }, { label: "Reason", value: "Half day at the dentist" }, { label: "Review", value: "2026-W42 is submitted; nothing changes until an approver decides" }] }]);
  });
});
