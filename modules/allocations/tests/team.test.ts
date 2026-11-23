import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import { teamFor } from "../server/team";
import { allocationsDatabase, TODAY } from "./setup";

describe.skipIf(!hasDb)("project team (Postgres)", () => {
  let db: Awaited<ReturnType<typeof allocationsDatabase>>;
  let auOnly: Viewer;
  beforeAll(async () => {
    db = await allocationsDatabase();
    const [au] = await db.tx((tx) => tx.execute(sql`select id from core.legal_entity where country = 'AU'`));
    auOnly = { ...(await db.as("sarah")), viewAs: undefined, assignments: [{ role: "HR", legalEntityIds: [au.id as string], departments: null }] };
  }, 60_000);
  afterAll(() => db?.t.drop());

  it("AC3 lists this project's people for three months with role and percent, and hides people outside the viewer's hr scope", async () => {
    const leader = await teamFor(await db.as("maya", "Leadership"), "CON", TODAY);
    expect(leader!.months).toEqual(["2026-10-01", "2026-11-01", "2026-12-01"]);
    expect(leader!.people.length).toBeGreaterThan(0);
    const [ids] = await db.tx((tx) => tx.execute(sql`select count(distinct person_id)::int as n from allocations.allocation a join delivery.project p on p.id = a.project_id
      where p.key = 'CON' and a.month between '2026-10-01' and '2026-12-01'`));
    expect(leader!.people.length + leader!.hidden).toBe(ids.n);
    for (const p of leader!.people) {
      expect(p.role).toBeTruthy();
      expect(p.percents.some((n) => n !== null && n > 0)).toBe(true);
    }
    const other = await teamFor(await db.as("maya", "Leadership"), "AMX", TODAY);
    expect(other?.people.map((p) => p.personId) ?? []).not.toEqual(leader!.people.map((p) => p.personId));
    const limited = await teamFor(auOnly, "CON", TODAY);
    expect(limited!.people.length + limited!.hidden).toBe(ids.n);
    expect(limited!.people.length).toBeLessThan(leader!.people.length);
    await expect(teamFor(await db.as("maya", "Engineer"), "CON", TODAY)).rejects.toThrow();
  }, 60_000);

  it("081 AC69 each team member carries their sign-in user id, so chat can name them as a proposal's owner", async () => {
    const team = await teamFor(await db.as("maya", "Leadership"), "CON", TODAY);
    const [users] = await db.tx((tx) => tx.execute(sql`select array_agg(p.user_id::text) as ids from hr.person p where p.id::text in (${sql.join(team!.people.map((p) => sql`${p.personId}`), sql`, `)})`));
    expect(team!.people.map((p) => p.userId).sort()).toEqual([...(users.ids as (string | null)[])].sort());
    expect(team!.people.some((p) => p.userId)).toBe(true);
  }, 60_000);

  it("081 AC80 each team member carries this month's spare capacity: FTE less every allocation that month, as the grid counts it", async () => {
    const team = await teamFor(await db.as("maya", "Leadership"), "CON", TODAY);
    const ids = team!.people.map((p) => p.personId);
    const rows = await db.tx((tx) => tx.execute(sql`select p.id::text as id,
        round(coalesce((select e.fte from hr.employment e where e.person_id = p.id and e.starts_on <= ${`${team!.months[0].slice(0, 8)}15`}::date
          and (e.ends_on is null or e.ends_on >= ${`${team!.months[0].slice(0, 8)}15`}::date) limit 1), 0) * 100)::int
        - coalesce((select sum(a.percent) from allocations.allocation a where a.person_id = p.id and a.month = ${team!.months[0]}::date), 0)::int as free
      from hr.person p where p.id::text in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`));
    for (const p of team!.people) expect([p.name, p.freeThisMonth]).toEqual([p.name, rows.find((r) => r.id === p.personId)!.free]);
  }, 60_000);
});
