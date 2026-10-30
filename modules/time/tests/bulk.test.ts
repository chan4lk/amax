import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { configureAi } from "@amax/ai";
import { fakeProvider } from "@amax/ai/fake";
import { chatTurn, confirmAction } from "@amax/chat";
import { createRegistry, ToolError } from "@amax/mcp";
import { ValidationError } from "@amax/core/server";
import { ScopeError } from "@amax/auth";
import { failureNote, remindMany } from "../server/bulk";
import { remindMissing } from "../server/remind-missing";
import { ctxFor } from "../server/context";
import manifest from "../module";
import { T, timeDb } from "./db";

describe.skipIf(!hasDb)("070 amendment 4: team reminders and approvals in one card (Postgres)", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  const registry = createRegistry([manifest]);
  beforeAll(async () => {
    db = await timeDb();
    await db.t.owner`insert into ai.settings (tenant_id, zdr_confirmed) values (${T}, true) on conflict do nothing`;
  }, 60_000);
  afterAll(() => db?.t.drop());

  const ids = async (...keys: string[]) => Promise.all(keys.map(async (k) => (await db.q(sql`select w.id from time.week w join auth.user u on u.id = w.user_id where u.email = ${`${k}@lumenlabs.test`} and w.iso_week = 42`))[0].id as string));
  const propose = async (name: string, weekIds: string[]) => {
    configureAi({ provider: fakeProvider([() => ({ toolCalls: [{ type: "tool_use", id: "c1", name, input: { weekIds } }] }), () => ({ text: "Confirm?" })]), db: db.app, model: "claude-haiku-5-5" });
    return chatTurn(db.app, registry, await db.as("maya"), { text: name });
  };

  it("AC46 one card for everyone listed; each is reminded on their own; a submitted week and one out of scope are skipped; a replay runs nothing", async () => {
    const maya = await db.as("maya");
    const turn = await propose("remind_weeks", [...(await ids("tharushi", "dinesh", "kasun")), randomUUID()]);
    const [card] = turn.pending;
    expect([card.title, card.lines?.map((l) => l.label)]).toEqual(["Remind 2 people to submit 2026-W42", ["Tharushi Wijesinghe", "Dinesh Wickrama", "Kasun Dias", "Skipped"]]);
    const { result } = await confirmAction(db.app, registry, maya, turn.conversationId, card.id);
    expect(result).toMatchObject({ summary: "Reminded 2 · skipped 2 · failed 0" });
    await expect(confirmAction(db.app, registry, maya, turn.conversationId, card.id)).rejects.toThrow();
    expect(await db.q(sql`select count(*)::int as n from core.event where name = 'time.week.reminded'`)).toEqual([{ n: 2 }]);
  });

  it("AC47 approvals report each person; one that fails is reported as failed and the others still go through", async () => {
    const maya = await db.as("maya");
    const [nimal, kasun, ayesha] = await ids("nimal", "kasun", "ayesha");
    await db.t.owner.unsafe(`create function time.fail_ayesha() returns trigger language plpgsql as $$ begin if new.week_id = '${ayesha}' then raise exception 'approval store down'; end if; return new; end $$`);
    await db.t.owner.unsafe("create trigger fail_ayesha before insert on time.approval for each row execute function time.fail_ayesha()");
    // 073 AC-10: weeks with missing days are skipped by approve-all, so their gaps are filled to keep this about one failure.
    await db.t.owner`insert into time.entry (tenant_id, week_id, user_id, project_id, day, hours, billable, source, logged_by)
      select w.tenant_id, w.id, w.user_id, (select id from delivery.project where key = 'CON'), d::date, 8, true, 'person', 'test'
      from time.week w, (values (${nimal}::uuid, '2026-10-16'), (${ayesha}::uuid, '2026-10-14')) gap(week_id, d) where w.id = gap.week_id`;
    const turn = await propose("approve_weeks", [nimal, kasun, ayesha]);
    expect(turn.pending[0].title).toBe("Approve 3 timesheets for 2026-W42 (103.5 h)");
    const { result } = await confirmAction(db.app, registry, maya, turn.conversationId, turn.pending[0].id);
    expect(result).toMatchObject({ summary: "Approved 2 · skipped 0 · failed 1", results: [{ person: "Nimal Silva", status: "approved" }, { person: "Kasun Dias", status: "approved" }, { person: "Ayesha Rahman", status: "failed", note: expect.stringMatching(/^couldn't be done \(reference .+\)$/) }] });
    // Review round 1: the database's own words never reach the card, the model or the audit.
    expect(JSON.stringify(result)).not.toContain("approval store down");
    expect(JSON.stringify(await db.q(sql`select after from core.audit_event where action = 'time.week.approve_many'`))).not.toContain("approval store down");
    expect(await db.q(sql`select status from time.week where id = ${ayesha}`)).toEqual([{ status: "submitted" }]);
  });

  it.each([
    ["a refusal the module wrote", new ToolError("2026-W42 is already approved", "invalid_input"), "2026-W42 is already approved"],
    ["a validation error", new ValidationError([{ code: "custom", path: ["weekIds"], message: "pick a week", input: undefined }]), new ValidationError([{ code: "custom", path: ["weekIds"], message: "pick a week", input: undefined }]).message],
    ["a domain refusal that isn't retryable", Object.assign(new Error("held under a legal hold"), { retryable: false }), "held under a legal hold"],
    ["a plain Error, not a refusal", new Error("2026-W42 is already approved"), null],
    ["a postgres-js connection error (plain Error, code, no cause)", Object.assign(new Error("write CONNECTION_CLOSED db.internal:5432"), { code: "CONNECTION_CLOSED" }), null],
    ["a scope refusal", new ScopeError("time:approve"), new ScopeError("time:approve").message],
    ["a database error wrapped by the driver", Object.assign(new Error("Failed query: insert into time.approval ..."), { cause: new Error("approval store down") }), null],
    ["a driver error class", Object.assign(new TypeError("connection reset"), {}), null],
    ["a thrown string", "boom", null],
  ] as [string, unknown, string | null][])("review rounds 1 to 3: a failed row's note for %s, by the REST API's rule (userFacing)", (_, e, kept) => {
    const note = failureNote(e);
    if (kept) expect(note).toBe(kept);
    else expect(note).toMatch(/^couldn't be done \(reference [0-9a-f-]{36}\)$/);
  });

  // 073 review rounds 1 and 3: every per-person reminder loop reports a failure as that person's own failed row and
  // still reminds the others: remind_weeks for people with no timesheet (Not started), and remind_missing for a day.
  // The failure falls on the first person, the last, or everyone; the reminders recorded match the rows that say sent.
  const failing = async (ids: string[], run: () => Promise<unknown>) => {
    await db.t.owner.unsafe(`create function time.fail_reminder() returns trigger language plpgsql as $$ begin if new.user_id::text in (${ids.map((i) => `'${i}'`).join(",") || "''"}) then raise exception 'reminder store down'; end if; return new; end $$`);
    await db.t.owner.unsafe("create trigger fail_reminder before insert on time.reminder for each row execute function time.fail_reminder()");
    try { return await run(); } finally { await db.t.owner.unsafe("drop trigger fail_reminder on time.reminder; drop function time.fail_reminder()"); }
  };
  type Rows = { results: { person: string; status: string; note: string | null }[]; summary: string };
  const PEOPLE = { tharushi: "Tharushi Wijesinghe", dinesh: "Dinesh Wickrama", kasun: "Kasun Dias" } as const;
  it.each([
    ["remind_weeks", "the first", ["tharushi"]], ["remind_weeks", "the last", ["kasun"]], ["remind_weeks", "every", ["tharushi", "dinesh", "kasun"]],
    ["remind_missing", "the first", ["tharushi"]], ["remind_missing", "the last", ["kasun"]], ["remind_missing", "every", ["tharushi", "dinesh", "kasun"]],
  ] as const)("%s with %s person failing: failed rows for them, the others reminded and recorded", async (tool, _, failKeys) => {
    const maya = await db.as("maya");
    const ids = Object.fromEntries(await Promise.all(Object.keys(PEOPLE).map(async (k) => [k, await db.idOf(k)] as const)));
    const before = Number((await db.q(sql`select count(*)::int as n from time.reminder`))[0].n);
    const all = Object.values(ids);
    const out = (await failing(failKeys.map((k) => ids[k]), () => (tool === "remind_weeks"
      ? remindMany(ctxFor(maya), { weekIds: [], week: "2026-W46", userIds: all })
      : remindMissing(ctxFor(maya), { day: "2026-10-26", userIds: all })))) as Rows;
    const tried = out.results.filter((r) => r.status !== "skipped");
    expect(tried.length).toBeGreaterThan(1);
    const failNames: string[] = failKeys.map((k) => PEOPLE[k]).filter((n) => tried.some((r) => r.person === n));
    for (const r of tried) {
      expect([r.person, r.status]).toEqual([r.person, failNames.includes(r.person) ? "failed" : "sent"]);
      if (failNames.includes(r.person)) expect(r.note).toMatch(/^couldn't be done \(reference .+\)$/);
    }
    expect(out.summary).toContain(`failed ${failNames.length}`);
    expect(Number((await db.q(sql`select count(*)::int as n from time.reminder`))[0].n) - before).toBe(tried.length - failNames.length);
  }, 60_000);
});

