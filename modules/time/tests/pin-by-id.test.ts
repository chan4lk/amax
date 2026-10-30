import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { createRegistry } from "@amax/mcp";
import manifest from "../module";
import { timeDb } from "./db";

// 073 review round 1 (R3, 059): a project row's pin names the project by id, so renaming the project never breaks it.
// Team time's project row (get_team_week) and a member's project row (get_timesheet) resolve before and after a rename.
describe.skipIf(!hasDb)("073 project-row pins resolve by id (Postgres)", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  const registry = createRegistry([manifest]);
  beforeAll(async () => { db = await timeDb(); }, 60_000);
  afterAll(() => db?.t.drop());

  const call = async (tool: string, args: object) => registry.call(await db.as("maya"), tool, args, { source: "mcp" }) as Promise<Record<string, unknown> | null>;

  it.each(["Fleet Tracker", "Fleet Tracker Pro"])("with the project named %s", async (name) => {
    const [flt] = await db.q(sql`select id from delivery.project where key = 'FLT'`);
    await db.t.owner`update delivery.project set name = ${name} where key = 'FLT'`;
    const team = await call("get_team_week", { week: "2026-W42", projectId: flt.id });
    expect(team).toMatchObject({ week: "2026-W42", project: name });
    const [kasun] = await db.q(sql`select w.id from time.week w join auth.user u on u.id = w.user_id where u.email = 'kasun@lumenlabs.test' and w.iso_week = 42`);
    expect(await call("get_timesheet", { weekId: kasun.id, projectId: flt.id })).toMatchObject({ project: name });
    // An id that names no project resolves to nothing, never to another row.
    expect(await call("get_timesheet", { weekId: kasun.id, projectId: "00000000-0000-4000-8000-000000000000" })).toBeNull();
  }, 60_000);

  // Review round 2: the own-week path pins by id too, and a closed project's row still resolves (its id never goes
  // through the active-project names).
  it.each([["active"], ["closed"]] as const)("Kasun's own Fleet Tracker row resolves by id with the project %s", async (state) => {
    const [flt] = await db.q(sql`select id from delivery.project where key = 'FLT'`);
    if (state === "closed") await db.t.owner`update delivery.project set status = 'closed' where key = 'FLT'`;
    const own = await registry.call(await db.as("kasun"), "get_timesheet", { week: "2026-W42", projectId: flt.id }, { source: "mcp" }) as { rows: { projectId: string }[] } | null;
    expect(own?.rows.map((r) => r.projectId)).toEqual([flt.id]);
  }, 60_000);
});

