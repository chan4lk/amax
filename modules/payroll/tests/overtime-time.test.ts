import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { approvedWeekHours } from "@amax/time/contracts";
import { payrollDb } from "./db";

const DAYS = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"];

describe.skipIf(!hasDb)("071 overtime from Time's totals read (Postgres)", () => {
  let db: Awaited<ReturnType<typeof payrollDb>>;
  beforeAll(async () => { db = await payrollDb(); }, 120_000);
  afterAll(() => db?.t.drop());

  const call = (v: Awaited<ReturnType<typeof db.as>>, tool: string, args: object) => db.registry.call(v, tool, args, { source: "mcp" }) as Promise<Record<string, unknown>>;
  const userId = async (key: string) => (await db.q(sql`select id from auth.user where email = ${`${key}@lumenlabs.test`}`))[0].id as string;
  const week46 = async (key: string, spare = 0) => {
    const v = await db.as(key);
    const ids = [];
    for (const day of DAYS) ids.push((await call(v, "log_time", { projectKey: "CON", day, hours: 9.2 })).id as string);
    if (spare) ids.push((await call(v, "log_time", { projectKey: "FLT", day: DAYS[0], hours: spare })).id as string);
    return { v, ids };
  };
  const overtimeLine = async (key: string, runId: string) => (await db.q(sql`select l.label from payroll.payslip_line l join payroll.payslip s on s.id = l.payslip_id
    where s.run_id = ${runId} and s.user_id = ${await userId(key)} and l.basis like 'Approved timesheets%'`)).map((r) => r.label);
  const draft = async (v: Awaited<ReturnType<typeof db.as>>) => {
    const [group] = await db.q(sql`select g.id from payroll.pay_group g join core.legal_entity e on e.id = g.legal_entity_id where e.country = 'LK' limit 1`);
    const { runId } = await call(v, "draft_payroll_run", { payGroupId: group.id, period: "2026-10" });
    const [run] = await db.q(sql`select sources from payroll.run where id = ${runId}`);
    return { runId: runId as string, sources: run.sources as Record<string, unknown> };
  };

  it("AC3 TIM-T02 a Payroll drafter gets 6 h from a 46 h approved week; submitted and deleted hours give none; others' detail stays closed", async () => {
    const sahan = await db.as("sahan");
    const kasun = await week46("kasun");
    await call(kasun.v, "submit_week", { week: "2026-W43" });
    await call(sahan, "approve_week", { person: "kasun@lumenlabs.test", week: "2026-W43" });
    await call((await week46("nimal")).v, "submit_week", { week: "2026-W43" });
    const tharushi = await week46("tharushi", 8);
    await call(tharushi.v, "delete_time_entry", { entryId: tharushi.ids[5] });
    for (const id of tharushi.ids.slice(0, 2)) await call(tharushi.v, "delete_time_entry", { entryId: id });
    await call(tharushi.v, "submit_week", { week: "2026-W43" });
    await call(sahan, "approve_week", { person: "tharushi@lumenlabs.test", week: "2026-W43" });

    const payroll = await db.as("maya", "Payroll");
    const run = await draft(payroll);
    expect(await overtimeLine("kasun", run.runId)).toEqual(["Overtime, 6 h"]);
    expect(await overtimeLine("nimal", run.runId)).toEqual([]);
    expect(await overtimeLine("tharushi", run.runId)).toEqual([]);
    expect(run.sources).toMatchObject({ time: expect.stringMatching(/^Approved timesheets, \d+ weeks, \d+ people$/) });
    expect(run.sources.timeIncomplete).toBeUndefined();

    await expect(db.tx((tx) => approvedWeekHours(tx, kasun.v, { from: "2026-10-01", to: "2026-10-31" }))).rejects.toThrow(/time:totals/);
    const [{ id: weekId }] = await db.q(sql`select id from time.week where user_id = ${await userId("kasun")} and iso_week = 43`);
    expect(await call(payroll, "get_timesheet", { weekId })).toBeNull();
    expect(await call(payroll, "get_change_requests", {})).toEqual([]);
  }, 120_000);

  it("AC2 people outside the drafter's entity are flagged overtime-unknown and the Sources line says the read is incomplete", async () => {
    const [lk] = await db.q(sql`select legal_entity_id as id from auth.user where email = 'maya@lumenlabs.test'`);
    const [other] = await db.q(sql`select id from core.legal_entity where id <> ${lk.id} limit 1`);
    await db.t.owner`insert into auth.role_assignment (tenant_id, user_id, role, source, legal_entity_ids)
      select tenant_id, id, 'Payroll', 'manual', ${[lk.id as string]}::uuid[] from auth.user where email = 'ravi@lumenlabs.test' on conflict do nothing`;
    await db.t.owner`update auth.user set legal_entity_id = ${other.id as string} where email = 'kasun@lumenlabs.test'`;
    const run = await draft(await db.as("ravi"));
    expect(run.sources).toMatchObject({ time: expect.stringMatching(/^Timesheets: 1 of \d+ people unreadable, overtime incomplete$/), timeIncomplete: true });
    const [slip] = await db.q(sql`select flags from payroll.payslip where run_id = ${run.runId} and user_id = ${await userId("kasun")}`);
    expect(slip.flags).toContain("overtime-unknown");
  }, 120_000);
});
