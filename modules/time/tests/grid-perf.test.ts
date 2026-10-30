import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { teamGrid } from "../server/grid";
import { T, timeDb } from "./db";

const PEOPLE = 100;

describe.skipIf(!hasDb)("073 AC-23 the Team grid for 100 people (Postgres)", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  beforeAll(async () => {
    db = await timeDb();
    // 100 fictional people, each with a submitted 2026-W45 week of five 8 h days on Fleet Tracker.
    await db.t.owner`insert into auth.user (tenant_id, email, name, legal_entity_id)
      select ${T}, 'perf' || n || '@example.test', 'Perf Person ' || n, (select legal_entity_id from auth.user where email = 'maya@lumenlabs.test')
      from generate_series(1, ${PEOPLE}) n`;
    await db.t.owner`insert into time.week (tenant_id, user_id, person_name, iso_year, iso_week, starts_on, status, submitted_at)
      select ${T}, id, name, 2026, 45, '2026-11-02', 'submitted', now() from auth.user where email like 'perf%@example.test'`;
    await db.t.owner`insert into time.entry (tenant_id, week_id, user_id, project_id, day, hours, billable, source, logged_by)
      select w.tenant_id, w.id, w.user_id, (select id from delivery.project where key = 'FLT'), '2026-11-02'::date + d, 8, true, 'person', 'test'
      from time.week w, generate_series(0, 4) d where w.iso_week = 45 and w.person_name like 'Perf Person%'`;
  }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC23 Team time's data for 100 people loads in under 2 seconds", async () => {
    const maya = await db.as("maya");
    await teamGrid(maya, { year: 2026, week: 45 }, {});
    const start = performance.now();
    const g = await teamGrid(maya, { year: 2026, week: 45 }, {});
    const ms = performance.now() - start;
    expect(g.grid.filter((r) => r.personName.startsWith("Perf Person"))).toHaveLength(PEOPLE);
    expect(ms).toBeLessThan(2000);
  }, 120_000);
});
