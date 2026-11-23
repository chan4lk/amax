import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { ctxFor } from "../server/context";
import { addPerson, recordLeaver } from "../server/services";
import { peopleStats, type PeopleStats } from "../server/stats";
import { shortDate } from "../ui/parts";
import { PeopleAllPage } from "../ui/PeoplePage";
import { PersonPage } from "../ui/PersonPage";
import { hrDatabase } from "./setup";

const html = async (node: unknown) => (await import("react-dom/server")).renderToStaticMarkup((await node) as never);

// 110 AC-2, review round 2: the screens read each person's own day, not UTC's. At 20:00 UTC on 15 Nov it is the 16th in
// Sri Lanka; at 20:00 UTC on 30 Nov it is already 1 Dec there, another month.
describe.skipIf(!hasDb)("110 the People screens read each person's own day (Postgres)", () => {
  let db: Awaited<ReturnType<typeof hrDatabase>>;
  beforeAll(async () => { db = await hrDatabase(); }, 60_000);
  afterAll(() => db?.t.drop());
  afterEach(() => { vi.useRealTimers(); });
  const at = (now: string) => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(now)); };
  const join = async (name: string) => (await addPerson(ctxFor(await db.as("sahan"), "mcp"), { name, title: "Engineer", department: "Engineering", entity: "Sri Lanka" })).employeeNo;

  it.each([
    ["the person page", async (no: string) => html(PersonPage({ params: { employeeNo: no }, viewer: db.mayaAs("HR") } as never))],
    ["the People directory", async () => html(PeopleAllPage({ params: {}, viewer: db.mayaAs("HR") } as never))],
  ])("AC2 %s shows someone who joined today there as joined today", async (_name, render) => {
    at("2026-11-15T20:00:00Z");
    const no = await join(`Joiner ${_name}`);
    expect(await render(no)).toContain(`Joined ${shortDate("2026-11-16")}`);
  });

  // Each row at 20:00 UTC on 30 Nov, already 1 Dec in Sri Lanka and Sydney: one record in December or next month, counted.
  it.each([
    ["a probation review due 15 Dec, due this month", async (no: string) => { await db.t.owner`insert into hr.probation (tenant_id, person_id, ends_on) select tenant_id, id, '2026-12-15' from hr.person where employee_no = ${no}`; },
      (s: PeopleStats) => s.probation.dueThisMonth],
    ["a fixed-term contract ending 15 Jan, ending next month", async (no: string) => { await db.t.owner`update hr.employment set contract = 'fixed-term', ends_on = '2027-01-15' where person_id = (select id from hr.person where employee_no = ${no})`; },
      (s: PeopleStats) => s.contractsEndingNextMonth],
    ["a leaver on 1 Dec, in December and the quarter", async (no: string) => { await recordLeaver(ctxFor(db.mayaAs("HR")), { employeeNo: no, leftOn: "2026-12-01" }); },
      (s: PeopleStats) => s.leavers[11] + s.quarter.left],
    ["a joiner on 1 Dec, in December", async () => undefined, (s: PeopleStats) => s.joiners[11]],
  ])("AC2 the People stats count by each person's own month: %s", async (name, record, count) => {
    at("2026-11-30T20:00:00Z");
    const hr = db.mayaAs("HR");
    const before = await peopleStats(hr);
    await record(await join(`Stats ${name}`));
    const after = await peopleStats(hr);
    expect([after.day, after.oneMonth, count(after) - (count(before) || 0)]).toEqual(["2026-12-01", true, name.startsWith("a leaver") ? 2 : 1]);
  });

  it.each([
    ["30 Nov 20:00 UTC: 1 Dec for both, the month named", "2026-11-30T20:00:00Z", ["in January", "Joiners and leavers, Q4"]],
    ["31 Dec 14:00 UTC: Sydney's 1 Jan, Sri Lanka's 31 Dec, no month named", "2026-12-31T14:00:00Z", ["next month", "Joiners and leavers, Q1"]],
  ])("AC2 the People lede and quarter on %s", async (_name, now, texts) => {
    at(now);
    const page = await html(PeopleAllPage({ params: {}, viewer: db.mayaAs("HR") } as never));
    for (const t of texts) expect(page).toContain(t);
  });
});
