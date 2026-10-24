import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import { configureAi } from "@amax/ai";
import { fakeProvider } from "@amax/ai/fake";
import { chatTurn } from "@amax/chat";
import { createRegistry } from "@amax/mcp";
import manifest from "../module";
import { ctxFor } from "../server/context";
import { logTime } from "../server/log";
import { T, timeDb } from "./db";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const weekday = (d: Date, step: number) => { while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + step); return iso(d); };

describe.skipIf(!hasDb)("071 entry rules: allocated projects and the date window, off by default (Postgres)", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  const registry = createRegistry([manifest]);
  beforeAll(async () => {
    db = await timeDb();
    await db.t.owner`insert into ai.settings (tenant_id, zdr_confirmed) values (${T}, true) on conflict do nothing`;
    await db.t.owner`delete from allocations.allocation where person_id = (select id from hr.person where user_id = (select id from auth.user where email = 'tharushi@lumenlabs.test'))`;
    await db.t.owner`insert into allocations.allocation (tenant_id, person_id, project_id, month, percent, updated_by)
      select ${T}, p.id, d.id, '2026-10-01', 50, 'test' from hr.person p, delivery.project d
      where p.user_id = (select id from auth.user where email = 'tharushi@lumenlabs.test') and d.key in ('FLT', 'CON')`;
  }, 60_000);
  afterAll(() => db?.t.drop());

  const call = (v: Viewer, tool: string, input: object) => registry.call(v, tool, input, { source: "mcp" }) as Promise<Record<string, unknown>>;
  const cardFor = async (v: Viewer, name: string, input: object) => {
    configureAi({ provider: fakeProvider([() => ({ toolCalls: [{ type: "tool_use", id: "c1", name, input }] }), () => ({ text: "OK" })]), db: db.app, model: "claude-haiku-5-5" });
    return (await chatTurn(db.app, registry, v, { text: name })).pending;
  };

  it("AC9 AC10 with allocation required, an unallocated project is refused with the allowed ones, and no card is made; off, it logs as before", async () => {
    const [tharushi, sahan, kasun] = [await db.as("tharushi"), await db.as("sahan"), await db.as("kasun")];
    expect(await call(tharushi, "get_time_settings", {})).toEqual({ requireAllocation: false, backdateWeeks: null, allowFuture: true });
    await expect(call(tharushi, "log_time", { projectKey: "HRI", day: "2026-10-27", hours: 1 })).resolves.toMatchObject({ hours: 1 });
    await expect(call(kasun, "set_time_settings", { requireAllocation: true })).rejects.toThrow();
    await call(sahan, "set_time_settings", { requireAllocation: true });
    const refusal = /not allocated to HR Insights in October; allocated to (Fleet Tracker and Contoso Portal|Contoso Portal and Fleet Tracker) that month/;
    await expect(call(tharushi, "log_time", { projectKey: "HRI", day: "2026-10-28", hours: 1 })).rejects.toThrow(refusal);
    expect(await cardFor(tharushi, "log_time", { projectKey: "HRI", day: "2026-10-28", hours: 1 })).toEqual([]);
    const flt = await call(tharushi, "log_time", { projectKey: "FLT", day: "2026-10-28", hours: 1 });
    await expect(call(tharushi, "correct_time_entry", { entryId: flt.id, projectKey: "HRI" })).rejects.toThrow(refusal);
    await call(sahan, "set_time_settings", { requireAllocation: false });
    await expect(call(tharushi, "correct_time_entry", { entryId: flt.id, projectKey: "HRI" })).resolves.toMatchObject({ hours: 1 });
  }, 60_000);

  it("AC11 the back-dating limit and future dates bind the owner's own time; a PM or Admin is exempt", async () => {
    const [tharushi, sahan] = [await db.as("tharushi"), await db.as("sahan")];
    const now = new Date();
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((now.getUTCDay() + 6) % 7) - 28));
    const early = weekday(new Date(monday.getTime() - 3 * 86_400_000), -1);
    const future = weekday(new Date(now.getTime() + 3 * 86_400_000), 1);
    await call(sahan, "set_time_settings", { backdateWeeks: 4, allowFuture: false });
    await expect(call(tharushi, "log_time", { projectKey: "FLT", day: early, hours: 1 })).rejects.toThrow(/up to 4 weeks back, so .* is too early/);
    await expect(call(tharushi, "log_time", { projectKey: "FLT", day: future, hours: 1 })).rejects.toThrow(/is in the future/);
    expect(await cardFor(tharushi, "log_time", { projectKey: "FLT", day: early, hours: 1 })).toEqual([]);
    const [{ id: userId }] = await db.q(sql`select id from auth.user where email = 'tharushi@lumenlabs.test'`);
    await expect(logTime(ctxFor(sahan), { projectKey: "FLT", day: early, hours: 1, userId: userId as string })).resolves.toMatchObject({ day: early });
    await call(sahan, "set_time_settings", { backdateWeeks: null, allowFuture: true });
    await expect(call(tharushi, "log_time", { projectKey: "FLT", day: early, hours: 1 })).resolves.toMatchObject({ hours: 1 });
  }, 60_000);
});
