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
import { chainFor } from "../server/chain";
import { listRequests } from "../server/requests-read";

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
    const [mine] = ((await w.registry.call(ayesha, "get_change_requests", {}, { source: "mcp" })) as { requests: { id: string }[] }).requests;
    expect(((await w.registry.call(maya, "get_change_requests", { mine: false }, { source: "mcp" })) as { requests: unknown[] }).requests).toHaveLength(1);
    expect(await w.registry.call(dinesh, "get_change_requests", {}, { source: "mcp" })).toEqual({ requests: [], truncated: false });
    await expect(decideRequest(ctxFor(dinesh), { requestId: mine.id, decision: "decline", note: "No" })).rejects.toThrow();
  }, 60_000);

  it("AC35 ask, answer and back to pending; a withdrawn request can't be decided", async () => {
    const [ayesha, maya] = await Promise.all([as("ayesha"), as("maya")]);
    const [r] = ((await w.registry.call(ayesha, "get_change_requests", {}, { source: "mcp" })) as { requests: { id: string }[] }).requests;
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

  // Review rounds 1 and 2: filters and the approver's scope run in SQL; the tool pages 50 at a time, newest first,
  // says when it cut the list, and its cursor reaches every row exactly once. 120 closed requests are planted as
  // volume (all at one timestamp, the hardest case for a cursor); the open request and every read use the real path.
  it("an older open request still reaches its approver; pages are bounded, flagged and cover every row once", async () => {
    const [ayesha, maya, dinesh] = await Promise.all([as("ayesha"), as("maya"), as("dinesh")]);
    const e = await w.entry(ayesha, "Contoso Portal", "2026-10-15");
    const open = await requestChange(ctxFor(ayesha), { entryId: e.id, hours: 4, reason: "Client call ran short" });
    const [r] = await w.db.q(sql`select tenant_id, week_id, entry_id, user_id, before, revision from time.change_request where status = 'pending' and entry_id = ${e.id}`);
    await w.db.t.owner`insert into time.change_request (tenant_id, week_id, entry_id, user_id, kind, before, revision, reason, status, created_at)
      select ${r.tenant_id as string}, ${r.week_id as string}, ${r.entry_id as string}, ${r.user_id as string}, 'correct', ${JSON.stringify(r.before)}::jsonb, ${Number(r.revision)}, 'Old typo', 'declined', now() + interval '1 day' from generate_series(1, 120)`;
    type Page = { requests: { id: string }[]; truncated: boolean; before?: string };
    const page = (v: typeof maya, f: object) => w.registry.call(v, "get_change_requests", f, { source: "mcp" }) as Promise<Page>;
    expect((await page(maya, { status: "pending" })).requests.map((x) => x.id)).toContain(open.id);
    expect((await page(maya, { week: "2026-W42", mine: false, status: ["pending"][0] })).requests.map((x) => x.id)).toContain(open.id);
    const seen: string[] = [];
    let p = await page(maya, { status: "declined" });
    for (let n = 0; n < 10; n++) {
      expect(p.requests.length).toBeLessThanOrEqual(50);
      seen.push(...p.requests.map((x) => x.id));
      if (!p.truncated) break;
      p = await page(maya, { status: "declined", before: p.before });
    }
    expect(p.truncated).toBe(false);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.length).toBeGreaterThanOrEqual(120);
    expect((await page(maya, { week: "2026-W41" })).requests.map((x) => x.id)).not.toContain(open.id);
    // Outside the chain, nothing: the scope is in SQL, so no row is even fetched for them.
    expect(await page(dinesh, { status: "declined" })).toEqual({ requests: [], truncated: false });
    // Review round 3: a cursor that names no request, or one the viewer can't see, is refused, not an empty last page.
    for (const [who, before] of [[maya, "00000000-0000-4000-8000-000000000000"], [dinesh, seen[0]]] as const)
      await expect(page(who, { status: "declined", before })).rejects.toThrow(/before/);
  }, 30_000);

  // Review round 4: the request list must be exactly what chainFor (with 071's owner entity) allows, for every kind of
  // viewer (owner, line manager, project approver, outsider, Admin), so the SQL scope can never drop a row it should fetch.
  it.each(["ayesha", "maya", "nimal", "kasun", "dinesh", "sahan"])("the SQL scope finds exactly the requests chainFor lets %s see", async (key) => {
    const v = await as(key);
    const all = await w.db.q(sql`select c.id, c.user_id, c.week_id from time.change_request c`);
    const want: string[] = [];
    for (const r of all) {
      const projects = (await w.db.q(sql`select distinct project_id from time.entry where week_id = ${r.week_id as string} and deleted_at is null`)).map((p) => p.project_id as string);
      const [owner] = await w.db.q(sql`select legal_entity_id from auth.user where id = ${r.user_id as string}`);
      if (r.user_id === v.userId || chainFor(v, r.user_id as string, projects, (owner?.legal_entity_id as string | null) ?? null) !== null) want.push(r.id as string);
    }
    expect((await listRequests(v)).map((r) => r.id).sort()).toEqual(want.sort());
  }, 60_000);
});
