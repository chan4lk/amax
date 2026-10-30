import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { hasDb } from "@amax/db/testdb";
import { registryFrom, runDueJobs, setInstalledModules } from "@amax/core/server";
import { weekStatusHandlers } from "../server/status";
import type { Report } from "../server/view";
import { reportsDb, T } from "./db";

describe.skipIf(!hasDb)("072 AC-6 utilisation counts submitted and approved weeks (Postgres)", () => {
  let db: Awaited<ReturnType<typeof reportsDb>>;
  beforeAll(async () => { db = await reportsDb(); }, 240_000);
  afterAll(() => db?.t.drop());

  const hers = async () => (await db.call<Report>("maya", "get_utilisation", {})).rows.find((x) => x.name === "Tharushi Wijesinghe")?.billableHours ?? null;
  const step = async (key: string, tool: string, args: object) => { await db.call(key, tool, args); await db.tick(); await db.tick(); return hers(); };
  const week = { person: "tharushi@lumenlabs.test", week: "2026-W42" };

  it("AC6 a week's hours count while it's submitted or approved, and drop out while it's a draft, sent back or reopened", async () => {
    expect(await step("tharushi", "log_time", { projectKey: "FLT", day: "2026-10-16", hours: 4, billable: true })).toBeNull();
    expect(await step("tharushi", "submit_week", { week: "2026-W42" })).toBe(4);
    expect(await step("maya", "reject_week", { ...week, comment: "Split Friday" })).toBeNull();
    expect(await step("tharushi", "submit_week", { week: "2026-W42" })).toBe(4);
    expect(await step("sahan", "approve_week", week)).toBe(4);
    expect(await step("sahan", "reopen_week", { ...week, reason: "Fix Friday" })).toBeNull();
    const lede = (await db.call<Report>("maya", "get_utilisation", {})).lede;
    expect(lede).toMatch(/^Billable hours from submitted and approved time ÷ available hours/);
  }, 240_000);

  // Review rounds 1 and 2: a copied hour whose week this copy has no status for (a week submitted before 072 listened,
  // an approved week whose event was missed) is looked up in Time, never read as a draft. Each case applies a change
  // to such a week, so the copied hour carries the week; under "no status = draft" it would be dropped.
  const kasun = async (): Promise<number> => (await db.call<Report>("maya", "get_utilisation", {})).rows.find((x) => x.name === "Kasun Dias")?.billableHours ?? 0;
  const used = new Set<string>();
  const applyChange = async (): Promise<number> => {
    const week = await db.call<{ entries: { id: string; hours: number; billable: boolean }[] }>("kasun", "get_my_week", { week: "2026-W42" });
    const e = week.entries.find((x) => x.billable && x.hours > 1 && x.hours < 9 && !used.has(x.id))!; // an entry not copied yet
    used.add(e.id);
    const r = await db.call<{ id: string }>("kasun", "request_time_change", { entryId: e.id, hours: e.hours - 1, reason: "Left an hour early" });
    await db.call("maya", "decide_change_request", { requestId: r.id, decision: "apply" });
    for (let i = 0; i < 3; i++) await db.tick();
    return e.hours - 1;
  };
  const statusRow = async (): Promise<unknown> => (await db.q(sql`select s.status from reports.week_status s join time.week w on w.id = s.week_id join auth.user u on u.id = w.user_id
    where u.email = 'kasun@lumenlabs.test' and w.iso_week = 42`))[0]?.status ?? null;
  // A worker that consumed Time's events before Reports' week-status handlers existed (deployment order): events run
  // and are marked done, but Reports never records the status. The real path to a week with no status, not a hand delete.
  const tickWithoutStatusHandlers = async () => {
    const reg = registryFrom(db.modules.map((m) => (m.id === "reports" ? { ...m, events: { ...m.events!, handles: (m.events!.handles ?? []).filter((h) => !weekStatusHandlers.includes(h)) } } : m)));
    for (let i = 0; i < 3; i++) await runDueJobs(db.app, reg);
  };
  it.each([
    ["a submitted week from before 072 (no status ever sent), with a change applied", async (): Promise<number> => applyChange()],
    // The locked change into an approved week, applied by its approver. (An Admin's locked log for someone else has no
    // public tool, only Time's service, which this module may not import; it writes the same copied row.)
    ["an approved week whose approval Reports never consumed, with a locked change applied", async (): Promise<number> => {
      await db.call("sahan", "approve_week", { person: "kasun@lumenlabs.test", week: "2026-W42" });
      await tickWithoutStatusHandlers();
      return applyChange();
    }],
  ] as const)("%s keeps counting: its status is read from Time", async (_, act) => {
    for (let i = 0; i < 3; i++) await db.tick();
    const before = await kasun();
    const added = await act();
    expect(await statusRow()).toBeNull();
    // Kasun's seeded report rows aren't Time's entries, so each changed hour is a new row carrying its week.
    expect(await kasun()).toBeCloseTo(before + added, 1);
  }, 240_000);

  // Review rounds 3 and 4: when neither this copy nor Time can give a week's status, the hours are neither counted nor
  // dropped as a draft: the row says its figure is incomplete, and the team figure says why it left the person out.
  // Two ways to get there: Time switched off in this deployment (hasModule), with copied hours whose weeks carry no
  // status (Kasun's, from the cases above); and a week Time doesn't hold. The second can only be planted: Time
  // anonymises weeks rather than deleting them, and a visible hour always has a visible week (both use seesWeek).
  it.each([
    ["Time switched off in this deployment", "Kasun Dias", async () => setInstalledModules(db.modules.filter((m) => m.id !== "time").map((m) => m.id))],
    ["a week Time doesn't hold (planted)", "Dinesh Wickrama", async () => {
      const dinesh = (await db.q(sql`select id from auth.user where email = 'dinesh@lumenlabs.test'`))[0].id as string;
      await db.q(sql`insert into reports.logged_hours (tenant_id, entry_id, week_id, user_id, day, hours, billable, revision)
        values (${T}, gen_random_uuid(), gen_random_uuid(), ${dinesh}, '2026-10-14', 3, true, 1)`);
    }],
  ] as const)("%s: the person's figure is incomplete and the team says why", async (_, name, setup) => {
    await setup();
    try {
      const r = await db.call<Report>("maya", "get_utilisation", {});
      expect(r.rows.find((x) => x.name === name)).toMatchObject({ hoursIncomplete: true, utilisation: null });
      expect(r.team.statusUnknown).toBeGreaterThanOrEqual(1);
      expect(r.notes.some((n) => /timesheet status couldn't be read/.test(n))).toBe(true);
    } finally {
      setInstalledModules(db.modules.map((m) => m.id));
    }
  }, 240_000);
});

