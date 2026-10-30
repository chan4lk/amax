import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import manifest from "../module";
import { stateOf, teamGrid, type GridRow } from "../server/grid";
import { getTimesheet } from "../server/sheet";
import { T, timeDb } from "./db";

const W42 = { year: 2026, week: 42 };

describe.skipIf(!hasDb)("073 amendment 1: the Team grid (Postgres)", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  beforeAll(async () => {
    db = await timeDb();
    await db.t.owner`insert into allocations.allocation (tenant_id, person_id, project_id, month, percent, updated_by)
      select ${T}, p.id, d.id, '2026-10-01', 50, 'test' from hr.person p, delivery.project d
      where p.user_id = (select id from auth.user where email = 'ravi@lumenlabs.test') and d.key = 'CON'`;
  }, 60_000);
  afterAll(() => db?.t.drop());

  const grid = async (q = {}) => teamGrid(await db.as("maya"), W42, q);
  const row = (rows: GridRow[], name: string) => rows.find((r) => r.personName === name)!;
  const states = (r: GridRow) => r.cells.map((c) => c.state);

  it("AC13 a cell's state follows the person's daily target, leave, today and weekends", async () => {
    expect([stateOf("2026-10-14", 0, 8, "2026-10-20", false), stateOf("2026-10-14", 5.9, 8, "2026-10-20", false), stateOf("2026-10-14", 6, 8, "2026-10-20", false),
      stateOf("2026-10-14", 9, 8, "2026-10-20", false), stateOf("2026-10-14", 9.1, 8, "2026-10-20", false), stateOf("2026-10-21", 0, 8, "2026-10-20", false),
      stateOf("2026-10-14", 0, 8, "2026-10-20", true), stateOf("2026-10-17", 4, 8, "2026-10-20", false)]).toEqual(["missing", "low", "on_target", "on_target", "over", "not_yet", "leave", "weekend"]);
    const g = await grid();
    expect(states(row(g.grid, "Kasun Dias"))).toEqual(["on_target", "on_target", "on_target", "on_target", "low"]);
    expect(states(row(g.grid, "Nimal Silva"))[4]).toBe("missing");
    expect(states(row(g.grid, "Ayesha Rahman")).slice(2)).toEqual(["missing", "on_target", "leave"]);
    expect(row(g.grid, "Kasun Dias").cells[4].projects.map(({ name, hours }) => ({ name, hours }))).toEqual([{ name: "Fleet Tracker", hours: 1 }]);
    await db.t.owner`insert into time.target (tenant_id, user_id, hours, updated_by) select ${T}, id, 24, 'test' from auth.user where email = 'dinesh@lumenlabs.test'`;
    expect(states(row((await grid()).grid, "Dinesh Wickrama")).slice(2, 4)).toEqual(["over", "low"]);
    await db.t.owner`delete from time.target`;
  }, 60_000);

  it("AC14 AC15 AC19 the summary, utilisation and footer add up", async () => {
    const g = await grid();
    expect(row(g.grid, "Kasun Dias")).toMatchObject({ total: 32.5, target: 40, utilisation: 81, overtime: false });
    expect(g.summary).toMatchObject({ hours: 141.5, awaiting: 3 });
    expect(g.summary.missingPeople).toBe(g.grid.filter((r) => r.cells.some((c) => c.state === "missing")).length);
    expect(g.footer).toEqual(g.days.map((_, i) => Math.round(g.grid.reduce((n, r) => n + r.cells[i].hours, 0) * 10) / 10));
  }, 60_000);

  it("AC16 AC20 AC22 filters recalculate, sort orders, and people with no timesheet show as Not started", async () => {
    const all = await grid();
    expect(row(all.grid, "Ravi Perera")).toMatchObject({ status: "not_started", weekId: null, total: 0 });
    expect(states(row(all.grid, "Ravi Perera"))).toEqual(["missing", "missing", "missing", "missing", "missing"]);
    const fleet = await grid({ project: "Fleet Tracker" });
    expect(fleet.summary.hours).toBe(all.projects.find((p) => p.name === "Fleet Tracker")!.hours);
    expect(fleet.grid.every((r) => r.total > 0 && r.cells.every((c) => c.projects.every((p) => p.name === "Fleet Tracker")))).toBe(true);
    expect((await grid({ status: "submitted" })).grid.map((r) => r.status)).toEqual(["submitted", "submitted", "submitted"]);
    expect(new Set((await grid({ status: "not_submitted" })).grid.map((r) => r.status))).toEqual(new Set(["draft", "not_started"]));
    if (all.options.teams?.length) expect((await grid({ team: all.options.teams[0] })).grid.every((r) => r.department === all.options.teams![0])).toBe(true);
    const totals = (await grid({ sort: "total" })).grid.map((r) => r.total);
    expect(totals).toEqual([...totals].sort((a, b) => a - b));
    const utils = (await grid({ sort: "utilisation", dir: "desc" })).grid.map((r) => r.utilisation);
    expect(utils).toEqual([...utils].sort((a, b) => b - a));
    expect((await grid()).grid.map((r) => r.personName)).toEqual([...all.grid.map((r) => r.personName)].sort((a, b) => a.localeCompare(b)));
  }, 60_000);

  it("AC18 a member's week opens at /time/w/{week}/p/{weekId}, and only for a week the viewer may see", async () => {
    expect(manifest.routes.map((r) => r.path)).toContain("w/:week/p/:weekId");
    const kasun = row((await grid()).grid, "Kasun Dias");
    expect(kasun.weekId).toBeTruthy();
    expect(await getTimesheet(await db.as("maya"), { weekId: kasun.weekId!, project: "Fleet Tracker" })).toMatchObject({ person: "Kasun Dias", project: "Fleet Tracker", days: [0, 0, 0, 7.5, 1], total: 8.5 });
    const asDinesh = await teamGrid(await db.as("dinesh"), W42, {});
    expect(asDinesh.grid.find((r) => r.weekId === kasun.weekId)).toBeUndefined();
  }, 60_000);
});
