import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { pinSuggestions } from "../pin-suggestions";
import { remindMany } from "../server/bulk";
import { bulkCard, proposeBulk } from "../server/bulk-card";
import { ctxFor } from "../server/context";
import { getTimesheet } from "../server/sheet";
import { teamGrid } from "../server/grid";
import { T, timeDb } from "./db";

// 073: Team time's rows keep only their pin. Pinning one offers its approve or remind; "Remind N people" reaches
// people with no timesheet too, through remind_weeks with the week and their user ids.
describe.skipIf(!hasDb)("073: row actions move to pin suggestions and the bulk reminder (Postgres)", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  beforeAll(async () => {
    db = await timeDb();
    // Ravi, allocated on Contoso Portal in October, is someone Maya expects to log, with no week-42 timesheet.
    await db.t.owner`insert into allocations.allocation (tenant_id, person_id, project_id, month, percent, updated_by)
      select ${T}, p.id, d.id, '2026-10-01', 50, 'test' from hr.person p, delivery.project d
      where p.user_id = (select id from auth.user where email = 'ravi@lumenlabs.test') and d.key = 'CON'`;
  }, 60_000);
  afterAll(() => db?.t.drop());

  const weekOf = async (key: string) => (await db.q(sql`select w.id from time.week w join auth.user u on u.id = w.user_id where u.email = ${`${key}@lumenlabs.test`} and w.iso_week = 42`))[0].id as string;
  const [onTimesheet] = pinSuggestions;

  it("a pinned person-week offers approve when submitted and remind when draft or not started, only to its approvers", async () => {
    const maya = await db.as("maya");
    expect(await onTimesheet.suggest(maya as never, { weekId: await weekOf("nimal") })).toEqual([{ label: "Approve Nimal's timesheet", prompt: expect.stringMatching(/^Approve Nimal Silva's timesheet for 2026-W42 \(week id [0-9a-f-]{36}\)$/), tool: "approve_week" }]);
    expect((await onTimesheet.suggest(maya as never, { weekId: await weekOf("tharushi") }))[0]).toMatchObject({ label: "Remind Tharushi", tool: "remind_week" });
    expect(await onTimesheet.suggest(maya as never, { weekId: await weekOf("nimal"), project: "Fleet Tracker" })).toEqual([]);
    expect(await onTimesheet.suggest((await db.as("dinesh")) as never, { weekId: await weekOf("nimal") })).toEqual([]);
    // A Not started row pins through get_timesheet too (week + user id), so one person's pin replaces another's in chat.
    expect(await getTimesheet(maya, { week: "2026-W42", userId: await db.idOf("ravi") })).toMatchObject({ personName: "Ravi Perera", status: "not_started", total: 0 });
    expect(await getTimesheet(await db.as("dinesh"), { week: "2026-W42", userId: await db.idOf("ravi") })).toBeNull();
    expect(await onTimesheet.suggest(maya as never, { week: "2026-W42", userId: await db.idOf("ravi") })).toEqual([{ label: "Remind Ravi", prompt: expect.stringContaining("no timesheet yet, user id"), tool: "remind_weeks" }]);
  }, 60_000);

  it("one remind card names drafts and people with no timesheet; each is reminded and recorded", async () => {
    const maya = await db.as("maya");
    const ravi = await db.idOf("ravi"), kasun = await db.idOf("kasun");
    const input = { weekIds: [await weekOf("tharushi")], week: "2026-W42", userIds: [ravi] };
    expect(await bulkCard("remind")(maya, input)).toMatchObject({ title: "Remind 2 people to submit 2026-W42", lines: [{ label: "Tharushi Wijesinghe" }, { label: "Ravi Perera", value: "Not started" }] });
    await expect(proposeBulk("remind")(maya, { weekIds: [], week: "2026-W42", userIds: [kasun] })).rejects.toThrow();
    const out = await remindMany(ctxFor(maya), { weekIds: [], week: "2026-W42", userIds: [ravi, kasun] });
    expect((out as { results: { person: string; status: string; note: string | null }[] }).results).toEqual([
      { person: "Ravi Perera", week: "2026-W42", status: "sent", note: null }, { person: "Kasun Dias", week: "2026-W42", status: "skipped", note: "already has a timesheet" }]);
    expect(await db.q(sql`select kind, week_id, sender_name from time.reminder where user_id = ${ravi}`)).toEqual([{ kind: "week", week_id: null, sender_name: "Maya Fernando" }]);
    // His Not started row on Team time shows that reminder, as a timesheet row does.
    const row = (await teamGrid(maya, { year: 2026, week: 42 }, {})).grid.find((r) => r.userId === ravi)!;
    expect([row.status, row.lastReminder?.by]).toEqual(["not_started", "Maya Fernando"]);
  }, 60_000);
});
