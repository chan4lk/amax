import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import manifest from "../module";
import { ctxFor } from "../server/context";
import { remindWeek } from "../server/decide";
import { missingCard, proposeMissing, remindMissing } from "../server/remind-missing";
import { weekCard } from "../server/week-card";
import { timeDb } from "./db";

const FRI = "2026-10-16";

describe.skipIf(!hasDb)("073 reminders: a missing day, the record, no weekends (Postgres)", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  beforeAll(async () => { db = await timeDb(); }, 60_000);
  afterAll(() => db?.t.drop());

  it("AC3 one card reminds the people with nothing logged that day, skips leave and anyone who logged, carries the message, and links to the day", async () => {
    const maya = await db.as("maya");
    const card = await missingCard(maya, { day: FRI });
    const names = (label: string) => card.lines.some((l) => l.label === label);
    expect(["Nimal Silva", "Tharushi Wijesinghe", "Dinesh Wickrama"].every(names)).toBe(true);
    expect(names("Kasun Dias")).toBe(false);
    expect(names("Ravi Perera")).toBe(false);
    expect(card.lines).toContainEqual({ label: "Ayesha Rahman", value: "skipped: on approved leave" });
    expect(card.lines.at(-1)).toEqual({ label: "Message", value: "Please update your hours for today." });
    expect(card.title).toMatch(/^Remind \d+ people to log Fri Oct 16$/);
    const out = await remindMissing(ctxFor(maya), { day: FRI, message: "Friday's hours, please", userIds: [await db.idOf("dinesh"), await db.idOf("kasun")] });
    expect(out.results).toEqual([{ person: "Dinesh Wickrama", status: "sent", note: null }, { person: "Kasun Dias", status: "skipped", note: "already logged" }]);
    const [ev] = await db.q(sql`select payload from core.event where name = 'time.day.reminded' order by created_at desc limit 1`);
    expect(ev.payload).toMatchObject({ day: FRI, dayLabel: "Fri Oct 16", week: "2026-W42", message: "Friday's hours, please" });
    expect(manifest.notifications?.find((r) => r.id === "time.day-reminded")).toMatchObject({ title: "Log your hours for {dayLabel}", href: "/time/my/{week}?day={day}" });
  }, 60_000);

  it("AC4 every reminder is recorded, and a card warns when the same person was reminded in the last 4 hours", async () => {
    const maya = await db.as("maya");
    expect(await db.q(sql`select kind, day::text as day, message, sender_name from time.reminder where user_id = ${await db.idOf("dinesh")}`))
      .toEqual([{ kind: "day", day: FRI, message: "Friday's hours, please", sender_name: "Maya Fernando" }]);
    expect((await missingCard(maya, { day: FRI })).lines.find((l) => l.label === "Dinesh Wickrama")?.value).toMatch(/^nothing logged · reminded \d+ min ago by Maya Fernando$/);
    await remindWeek(ctxFor(maya), { person: "tharushi@lumenlabs.test", week: "2026-W42", message: "Please submit today" });
    const card = await weekCard("remind")(maya, { person: "tharushi@lumenlabs.test", week: "2026-W42" });
    expect(card.lines).toContainEqual({ label: "Note", value: expect.stringMatching(/^reminded \d+ min ago by Maya Fernando$/) });
    expect(await db.q(sql`select kind, message from time.reminder where user_id = ${await db.idOf("tharushi")}`)).toEqual([{ kind: "week", message: "Please submit today" }]);
  }, 60_000);

  it("AC7 no reminder for a weekend or a day still to come", async () => {
    const maya = await db.as("maya");
    await expect(proposeMissing(maya, { day: "2026-10-17" })).rejects.toThrow(/Sat Oct 17 is a weekend; reminders go out on working days only/);
    await expect(remindMissing(ctxFor(maya), { day: "2026-10-18" })).rejects.toThrow(/weekend/);
    await expect(remindMissing(ctxFor(maya), { day: "2099-01-05" })).rejects.toThrow(/hasn't happened yet/);
  }, 60_000);
});
