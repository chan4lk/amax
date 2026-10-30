import { sql } from "drizzle-orm";
import { withTenant, type Db, type Tx } from "@amax/db";
import { lumen } from "@amax/testing";

// 074: the 070–073 Time walkthrough on top of the module fixtures (docs/demo/time-070-073.md). Fictional data only.
// Week 43 is Mon Oct 19 to Fri Oct 23, 2026; week 42 comes from the time module's own fixtures.
const WEEK = { year: 2026, week: 43, monday: "2026-10-19" };
const lanka = lumen.entities.find((e) => e.key === "lk")!.id;

// Person, status, then entries as [day offset from Monday, project key, hours]. Dinesh has none on purpose: "Not started".
const WEEKS: [string, "submitted" | "draft", [number, string, number][]][] = [
  ["nimal", "submitted", [[0, "FLT", 8], [1, "FLT", 8], [2, "FLT", 8], [3, "FLT", 8], [4, "FLT", 8]]],
  ["kasun", "submitted", [[0, "CON", 15], [1, "FLT", 8], [2, "FLT", 8], [3, "FLT", 8], [4, "FLT", 8]]],
  ["ayesha", "submitted", [[3, "HRI", 8]]],
  ["tharushi", "draft", [[0, "FLT", 8], [1, "FLT", 4], [2, "FLT", 8], [3, "CON", 10]]],
  ["liam", "submitted", [[0, "HRI", 8], [1, "HRI", 8], [2, "HRI", 8], [3, "HRI", 8], [4, "HRI", 8]]],
];
const email = (key: string) => `${key}@lumenlabs.test`;

/** Whether this database already has the walkthrough (its week-43 timesheets), so later edits are never overwritten. */
export async function walkthroughLoaded(db: Db, tenantId = lumen.tenant.id) {
  const rows = await withTenant(db, tenantId, (tx) => tx.execute(sql`select 1 from time.week w join auth.user u on u.id = w.user_id
    where u.email = ${email("nimal")} and w.iso_year = ${WEEK.year} and w.iso_week = ${WEEK.week}`));
  return rows.length > 0;
}

/** Adds the walkthrough: Maya scoped to Lanka, the AI data policy confirmed, week 43 and the Reports backfill. */
export async function seedWalkthroughExtras(db: Db, tenantId = lumen.tenant.id) {
  await withTenant(db, tenantId, async (tx) => {
    await tx.execute(sql`insert into ai.settings (tenant_id, zdr_confirmed) values (${tenantId}, true)
      on conflict (tenant_id) do update set zdr_confirmed = true`);
    await tx.execute(sql`update auth.role_assignment set legal_entity_ids = array[${lanka}::uuid]
      where user_id = (select id from auth.user where email = ${email("maya")})`);
    for (const [key, status, entries] of WEEKS) await addWeek(tx, tenantId, key, status, entries);
    await backfillReports(tx);
  });
}

async function addWeek(tx: Tx, tenantId: string, key: string, status: string, entries: [number, string, number][]) {
  const [week] = await tx.execute(sql`insert into time.week (tenant_id, user_id, person_name, iso_year, iso_week, starts_on, status, submitted_at)
    select ${tenantId}, u.id, u.name, ${WEEK.year}, ${WEEK.week}, ${WEEK.monday}::date, ${status}, ${status === "submitted" ? sql`now()` : null}
      from auth.user u where u.email = ${email(key)} on conflict do nothing returning id, user_id`);
  if (!week) return;
  for (const [offset, project, hours] of entries)
    await tx.execute(sql`insert into time.entry (tenant_id, week_id, user_id, project_id, day, hours, billable, source, logged_by)
      select ${tenantId}, ${week.id}, ${week.user_id}, p.id, ${WEEK.monday}::date + ${offset}::int, ${hours}, true, 'person', 'demo'
        from delivery.project p where p.key = ${project}`);
}

// Reports keeps its own copy of logged hours, filled from Time's entry events, and seeded entries never sent those events.
// Its sample history covers Nimal, Kasun and Ayesha, so it gets everyone else's entries and their weeks' status.
async function backfillReports(tx: Tx) {
  await tx.execute(sql`insert into reports.logged_hours (tenant_id, entry_id, week_id, user_id, day, hours, billable, revision)
    select e.tenant_id, e.id, e.week_id, e.user_id, e.day, e.hours, e.billable, e.revision from time.entry e
     where e.deleted_at is null and e.user_id not in (select distinct user_id from reports.logged_hours)
    on conflict (entry_id) do nothing`);
  await tx.execute(sql`insert into reports.week_status (tenant_id, week_id, user_id, status, as_of)
    select w.tenant_id, w.id, w.user_id, w.status, now() from time.week w
     where w.id in (select distinct week_id from reports.logged_hours where week_id is not null)
    on conflict (week_id) do nothing`);
}
