import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { contextFor } from "@amax/core/server";
import { createRelease, recordDeployment, updateRelease } from "../server/services";
import { evaluateReleases } from "../server/release-check";
import { EVENTS } from "../contracts";
import { OPEN, releaseDb, T } from "./release-db";

describe.skipIf(!hasDb)("127 the release status event (Postgres)", () => {
  let db: Awaited<ReturnType<typeof releaseDb>>;
  const pin = (day: string) => db.t.owner`insert into delivery.clock_pin (tenant_id, today) values (${T}, ${day}) on conflict (tenant_id) do update set today = excluded.today`;
  const check = () => evaluateReleases(contextFor.job(T, "delivery.release-status"), {});
  const events = async (version: string) => (await db.t.owner`select payload from core.event where name = ${EVENTS.releaseStatusChanged} and payload->>'version' = ${version} order by created_at, id`)
    .map((e) => `${e.payload.from}>${e.payload.to}:${e.payload.source}`);
  beforeAll(async () => { db = await releaseDb(); await pin("2026-11-20"); }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC-1 each status change raises one event with the release's name, category, target and link; an unchanged write raises none", async () => {
    await createRelease(db.admin(), { ...OPEN, projectKey: "RTK", version: "n1", name: "November", startDate: "2026-12-01", targetDate: "2026-12-10" });
    await updateRelease(db.admin(), { projectKey: "RTK", version: "n1", name: "November Release" });
    const [e] = await db.t.owner`select payload from core.event where name = ${EVENTS.releaseStatusChanged} and payload->>'version' = 'n1'`;
    expect(e.payload).toMatchObject({ projectKey: "RTK", name: "November", category: "uat", categoryLabel: "UAT", targetDate: "2026-12-10", targetDay: "10 Dec 2026", from: null, to: "planned", toLabel: "Planned", source: "create",
      href: "/delivery/releases/RTK/n1" });
    expect(await events("n1")).toEqual(["null>planned:create"]);
  });

  it("AC-3 once per transition: Off track raises one event however often the check runs; a new transition raises again; completion is its own", async () => {
    await pin("2026-12-11");
    await check();
    await check();
    expect(await events("n1")).toEqual(["null>planned:create", "planned>overdue:schedule"]);
    await updateRelease(db.admin(), { projectKey: "RTK", version: "n1", targetDate: "2026-12-20" });
    await pin("2026-12-21");
    await check();
    await recordDeployment(db.admin(), { projectKey: "RTK", version: "n1", environment: "UAT" });
    expect((await events("n1")).slice(2)).toEqual(["overdue>in_progress:update", "in_progress>overdue:schedule", "overdue>completed:deployment"]);
  });

  it("AC-5 two checks at once, and a check racing a deployment, write each transition once: one history row, one event", async () => {
    await pin("2026-11-20");
    for (const version of ["c1", "c2"]) await createRelease(db.admin(), { ...OPEN, projectKey: "RTK", version, startDate: "2026-11-25", targetDate: "2026-11-28" });
    await pin("2026-11-30");
    const runs = await Promise.all([check(), check(), recordDeployment(db.admin(), { projectKey: "RTK", version: "c2", environment: "UAT" })]);
    expect((runs[0] as { changed: number }).changed + (runs[1] as { changed: number }).changed).toBeLessThanOrEqual(2);
    for (const version of ["c1", "c2"]) {
      const rows = await db.history("RTK", version);
      expect([version, new Set(rows).size, (await events(version)).length]).toEqual([version, rows.length, rows.length]);
    }
    expect(await db.history("RTK", "c1")).toEqual(["null>planned:create", "planned>overdue:schedule"]);
  });

  it("AC-4 a run that fails part way changes nothing and raises nothing; its retry raises each event once", async () => {
    await pin("2026-11-20");
    for (const version of ["p1", "p2"]) await createRelease(db.admin(), { ...OPEN, projectKey: "RTK", version, startDate: "2026-11-25", targetDate: "2099-12-31" });
    await db.t.owner`create function delivery.fail_p2() returns trigger language plpgsql as $$ begin
      if exists (select 1 from delivery.release where id = new.release_id and version = 'p2') then raise exception 'injected failure'; end if; return new; end $$`;
    await db.t.owner`create trigger fail_p2 before insert on delivery.release_status_history for each row execute function delivery.fail_p2()`;
    await pin("2026-11-26");
    await expect(check()).rejects.toMatchObject({ cause: { message: expect.stringMatching(/injected failure/) } });
    expect([...(await events("p1")), ...(await events("p2"))]).toEqual(["null>planned:create", "null>planned:create"]);
    expect((await db.row("RTK", "p1")).status).toBe("planned");
    await db.t.owner`drop trigger fail_p2 on delivery.release_status_history`;
    await check();
    await check();
    expect([(await events("p1")).at(-1), (await events("p2")).at(-1), (await events("p1")).length]).toEqual(["planned>in_progress:schedule", "planned>in_progress:schedule", 2]);
  });
});
