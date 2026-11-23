import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { ctxFor } from "../server/context";
import { contextFor } from "@amax/core/server";
import { getEmployment, getPerson, listPeople, reportUserIds } from "../contracts";
import { getPersonView } from "../server/queries";
import { peopleStats } from "../server/stats";
import { changePerson } from "../server/services";
import { entityDay } from "../server/inforce";
import { entityToday } from "../server/zones";
import { hrDatabase } from "./setup";

// 110: at 20:00 UTC on the 15th it is already the 16th in Sri Lanka and Sydney. HR's changes and reads go by that date.
const EVENING = "2026-11-15T20:00:00Z";

describe.skipIf(!hasDb)("110 HR's one today for changes and reads (Postgres)", () => {
  let db: Awaited<ReturnType<typeof hrDatabase>>;
  beforeAll(async () => { db = await hrDatabase(); }, 60_000);
  afterAll(() => db?.t.drop());
  afterEach(() => { vi.useRealTimers(); });
  const at = (now: string) => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(now)); };
  const zone = (set: boolean) => set
    ? db.t.owner`insert into workflows.entity_zone (legal_entity_id, tenant_id, timezone) select id, tenant_id, 'Australia/Sydney' from core.legal_entity where country = 'AU' on conflict (legal_entity_id) do nothing`
    : db.t.owner`delete from workflows.entity_zone where legal_entity_id in (select id from core.legal_entity where country = 'AU')`;
  const someoneIn = async (country: string) => (await db.tx((tx) => tx.execute(sql`select p.employee_no from hr.person p join core.legal_entity e on e.id = p.legal_entity_id
    where e.country = ${country} and p.status = 'active' order by p.employee_no limit 1`)))[0].employee_no as string;

  it.each([
    ["Sri Lanka, a title with no date", "LK", { title: "Senior engineer" }],
    ["Sydney, a title with no date", "AU", { title: "Account lead" }],
    ["Sri Lanka, a department with no date", "LK", { department: "Quality" }],
    ["Sri Lanka, a title on its own today", "LK", { title: "Lead engineer", effectiveOn: "2026-11-16" }],
  ])("AC1 %s: changes on the entity's own today", async (_name, country, change) => {
    const employeeNo = await someoneIn(country);
    at(EVENING);
    const r = await changePerson(ctxFor(db.mayaAs("HR")), { employeeNo, ...change });
    expect(r.effectiveOn).toBe("2026-11-16");
  });

  it.each([
    ["get_person", "LK"], ["the directory (listPeople)", "AU"], ["the employment in force", "LK"], ["the person page's view", "AU"], ["the People stats", "LK"],
  ])("AC2 a department changed on the entity's today shows at once in %s", async (reader, country) => {
    const employeeNo = await someoneIn(country);
    at(EVENING);
    await changePerson(ctxFor(db.mayaAs("HR")), { employeeNo, department: `Dept ${reader}` });
    const system = contextFor.job(db.maya.tenantId, "hr.test");
    if (reader === "the person page's view") {
      const view = (await getPersonView(db.mayaAs("HR"), employeeNo))!;
      expect([view.person.department, view.person.asOf, view.employment?.department]).toEqual([`Dept ${reader}`, "2026-11-16", `Dept ${reader}`]);
      return;
    }
    if (reader === "the People stats") {
      expect((await peopleStats(db.mayaAs("HR"))).departments.map((d) => d.name)).toContain(`Dept ${reader}`);
      return;
    }
    const department = await db.tx(async (tx) => {
      const p = (await getPerson(tx, system, employeeNo))!;
      if (reader === "get_person") return p.department;
      if (reader === "the directory (listPeople)") return (await listPeople(tx, system, { ids: [p.id] }))[0].department;
      return (await getEmployment(tx, p.id, system))!.department;
    });
    expect(department).toBe(`Dept ${reader}`);
  });

  it("AC2 a new manager from the entity's today has the report at once, and the audited pay read names the day it read", async () => {
    const [report] = await db.tx((tx) => tx.execute(sql`select p.id, p.employee_no, p.user_id from hr.person p join core.legal_entity e on e.id = p.legal_entity_id
      where e.country = 'LK' and p.status = 'active' and p.user_id is not null and p.name <> 'Sahan Kumara' order by p.employee_no limit 1`));
    const [sahan] = await db.tx((tx) => tx.execute(sql`select employee_no, user_id from hr.person where name = 'Sahan Kumara'`));
    at(EVENING);
    await changePerson(ctxFor(db.mayaAs("HR")), { employeeNo: report.employee_no as string, managerEmployeeNo: sahan.employee_no as string });
    expect(await db.tx((tx) => reportUserIds(tx, sahan.user_id as string))).toContain(report.user_id);
    await db.tx((tx) => getEmployment(tx, report.id as string, contextFor.job(db.maya.tenantId, "hr.test")));
    const [audit] = await db.tx((tx) => tx.execute(sql`select after from core.audit_event where action = 'hr.employment.read' order by seq desc limit 1`));
    expect((audit.after as { on: string }).on).toBe("2026-11-16");
  });

  it.each([["Sri Lanka", "LK"], ["Sydney", "AU"]])("111 AC1 %s: one date engine, the write's today is the read's", async (_name, country) => {
    at(EVENING);
    const [e] = await db.tx((tx) => tx.execute(sql`select id from core.legal_entity where country = ${country}`));
    const id = e.id as string;
    const [read] = await db.tx((tx) => tx.execute(sql`select to_char(${entityDay(sql`${id}::uuid`)}, 'YYYY-MM-DD') as day`));
    expect([await db.tx((tx) => entityToday(tx, id)), read.day]).toEqual(["2026-11-16", "2026-11-16"]);
  });

  it("AC1 a person field dated UTC's today, already yesterday there, is refused", async () => {
    const employeeNo = await someoneIn("LK");
    at(EVENING);
    await expect(changePerson(ctxFor(db.mayaAs("HR")), { employeeNo, title: "Principal", effectiveOn: "2026-11-15" })).rejects.toThrow(/change today/);
  });

  it("AC1 an entity with no time zone is refused", async () => {
    const employeeNo = await someoneIn("AU");
    await zone(false);
    try {
      at(EVENING);
      await expect(changePerson(ctxFor(db.mayaAs("HR")), { employeeNo, title: "Director" })).rejects.toThrow(/Lumen Labs Pty Ltd has no time zone set/);
    } finally { await zone(true); }
  });
});
