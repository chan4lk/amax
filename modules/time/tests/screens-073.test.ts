import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { createRegistry } from "@amax/mcp";
import manifest from "../module";
import { myWeek } from "../server/my";
import { teamWeek } from "../server/team";
import { T, timeDb } from "./db";

const W42 = { year: 2026, week: 42 };

describe.skipIf(!hasDb)("073 screens: weekend columns, last reminder, ThisWeek capacity (Postgres)", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  const registry = createRegistry([manifest]);
  beforeAll(async () => { db = await timeDb(); }, 60_000);
  afterAll(() => db?.t.drop());

  it("AC1 a week shows Mon to Fri, and Sat and Sun only once it has weekend hours", async () => {
    const tharushi = await db.as("tharushi");
    expect((await myWeek(tharushi, W42)).days).toHaveLength(5);
    await db.t.owner`insert into time.entry (tenant_id, week_id, user_id, project_id, day, hours, billable, source, logged_by)
      select w.tenant_id, w.id, w.user_id, p.id, '2026-10-17', 4, true, 'person', 'test' from time.week w, delivery.project p
      where w.user_id = ${tharushi.userId} and w.iso_week = 42 and p.key = 'FLT'`;
    const m = await myWeek(tharushi, W42);
    expect(m.days).toEqual(["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]);
    expect(m.perDay.slice(5)).toEqual([4, 0]);
    expect((await teamWeek(await db.as("maya"), W42)).days).toHaveLength(7);
  }, 60_000);

  it("AC4 a Team time row carries the last reminder, by whom and when", async () => {
    const [maya, dinesh] = [await db.as("maya"), await db.as("dinesh")];
    await db.t.owner`insert into time.reminder (tenant_id, user_id, kind, day, sent_by, sender_name, sent_at) values
      (${T}, ${dinesh.userId}, 'day', '2026-10-15', 'user:x', 'Maya Fernando', now() - interval '3 hours'),
      (${T}, ${dinesh.userId}, 'week', null, 'user:x', 'Sahan Kumara', now() - interval '1 hour')`;
    const row = (await teamWeek(maya, W42)).rows.find((r) => r.personName === "Dinesh Wickrama")!;
    expect(row.lastReminder?.by).toBe("Sahan Kumara");
    expect(Date.now() - Date.parse(row.lastReminder!.at)).toBeGreaterThan(55 * 60_000);
    expect((await teamWeek(maya, W42)).rows.find((r) => r.personName === "Nimal Silva")!.lastReminder).toBeNull();
  }, 60_000);

  it("AC8 ThisWeek's capacity comes from allocations and targets, is unknown without readable allocations, and a project row pins to its hours", async () => {
    const maya = await db.as("maya");
    // Everyone on the card is 100% allocated in October at the 40 h default: 5 × 40 h, the mock's "200 h allocated".
    expect((await teamWeek(maya, W42)).capacity).toBe(200);
    await db.t.owner`insert into time.target (tenant_id, user_id, hours, updated_by) select ${T}, id, 24, 'test' from auth.user where email = 'dinesh@lumenlabs.test'`;
    expect((await teamWeek(maya, W42)).capacity).toBe(184);
    await db.t.owner`update hr.person set user_id = null where user_id = (select id from auth.user where email = 'dinesh@lumenlabs.test')`;
    expect((await teamWeek(maya, W42)).capacity).toBeNull();
    const fleet = await registry.call(maya, "get_team_week", { week: "2026-W42", project: "Fleet Tracker" }, { source: "chat" });
    expect(fleet).toMatchObject({ week: "2026-W42", project: "Fleet Tracker", hours: expect.any(Number) });
  }, 60_000);
});
