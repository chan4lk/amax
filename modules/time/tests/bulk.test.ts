import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { configureAi } from "@amax/ai";
import { fakeProvider } from "@amax/ai/fake";
import { chatTurn, confirmAction } from "@amax/chat";
import { createRegistry } from "@amax/mcp";
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
    expect(result).toMatchObject({ summary: "Approved 2 · skipped 0 · failed 1", results: [{ person: "Nimal Silva", status: "approved" }, { person: "Kasun Dias", status: "approved" }, { person: "Ayesha Rahman", status: "failed", note: expect.stringContaining("approval store down") }] });
    expect(await db.q(sql`select status from time.week where id = ${ayesha}`)).toEqual([{ status: "submitted" }]);
  });
});
