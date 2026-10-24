import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import { configureAi } from "@amax/ai";
import { fakeProvider } from "@amax/ai/fake";
import { chatTurn } from "@amax/chat";
import { createRegistry } from "@amax/mcp";
import manifest from "../module";
import { dayLabel } from "../week";
import { T, timeDb } from "./db";

type Entry = { id: string; projectName: string; day: string; hours: number };

describe.skipIf(!hasDb)("070 amendment 2: Time confirm cards in plain words, and no doomed card", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  const registry = createRegistry([manifest]);
  beforeAll(async () => {
    db = await timeDb();
    await db.t.owner`insert into ai.settings (tenant_id, zdr_confirmed) values (${T}, true) on conflict do nothing`;
  }, 60_000);
  afterAll(() => db?.t.drop());

  const card = async (v: Viewer, name: string, input: object) => {
    configureAi({ provider: fakeProvider([() => ({ toolCalls: [{ type: "tool_use", id: "c1", name, input }] }), () => ({ text: "Confirm?" })]), db: db.app, model: "claude-haiku-5-5" });
    return (await chatTurn(db.app, registry, v, { text: name })).pending.map((p) => ({ title: p.title, lines: p.lines }));
  };
  const fleet = async (v: Viewer) => ((await registry.call(v, "get_timesheet", { week: "2026-W42", project: "Fleet Tracker" }, { source: "chat" })) as { entries: Entry[] }).entries[0];
  const named = (e: Entry) => ({ project: e.projectName, day: e.day, hoursBefore: e.hours, entryId: e.id });

  it("AC21 a correction's card names the project and day and shows each changed field before → after, never the id", async () => {
    const tharushi = await db.as("tharushi");
    const e = await fleet(tharushi);
    expect(await card(tharushi, "correct_time_entry", { ...named(e), hours: 2, note: "Morning only" })).toEqual([{ title: `Fix Fleet Tracker, ${dayLabel(e.day)}`,
      lines: [{ label: "Hours", value: `${e.hours} h → 2 h` }, { label: "Note", value: "none → Morning only" }] }]);
  });

  it("AC22 a delete's card names the project, day and hours", async () => {
    const tharushi = await db.as("tharushi");
    const e = await fleet(tharushi);
    expect(await card(tharushi, "delete_time_entry", named(e))).toEqual([{ title: `Remove Fleet Tracker, ${dayLabel(e.day)}: ${e.hours} h`, lines: [] }]);
  });

  it("AC23 a log card says how many hours go where, with billable and note when given", async () => {
    expect(await card(await db.as("dinesh"), "log_time", { projectKey: "FLT", hours: 1.5, day: "2026-10-16", billable: false, note: "Release notes" })).toEqual([
      { title: "Log 1.5 h to Fleet Tracker, Fri Oct 16", lines: [{ label: "Billable", value: "no" }, { label: "Note", value: "Release notes" }] }]);
  });

  it("AC24 approval cards name the person, the week and its hours, with the comment", async () => {
    const maya = await db.as("maya");
    expect(await card(maya, "approve_week", { person: "Nimal Silva", week: "2026-W42" })).toEqual([{ title: "Approve Nimal Silva's timesheet for 2026-W42 (31.5 h)", lines: [] }]);
    expect(await card(maya, "reject_week", { person: "Nimal Silva", week: "2026-W42", comment: "Split Tuesday by project" })).toEqual([
      { title: "Send back Nimal Silva's timesheet for 2026-W42 (31.5 h)", lines: [{ label: "Comment", value: "Split Tuesday by project" }] }]);
  });

  it("AC25 no card for a week that can't take the change, and nothing is written", async () => {
    const [kasun, maya, sahan] = await Promise.all([db.as("kasun"), db.as("maya"), db.as("sahan")]);
    const count = async () => (await db.q(sql`select (select count(*) from time.entry) + (select count(*) from core.audit_event) as n`))[0].n;
    const before = await count();
    const refused = [
      await card(kasun, "log_time", { projectKey: "FLT", hours: 6, day: "2026-10-14" }),
      await card(kasun, "correct_time_entry", { ...named(await fleet(kasun)), hours: 6 }),
      await card(maya, "approve_week", { person: "Tharushi Wijesinghe", week: "2026-W42" }),
      await card(maya, "remind_week", { person: "Kasun Dias", week: "2026-W42" }),
      await card(sahan, "reopen_week", { person: "Kasun Dias", week: "2026-W42", reason: "Wrong project" }),
    ];
    expect(refused).toEqual([[], [], [], [], []]);
    expect(await count()).toBe(before);
  });
});
