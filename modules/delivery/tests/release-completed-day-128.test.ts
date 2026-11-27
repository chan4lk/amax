import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@amax/db";
import { hasDb } from "@amax/db/testdb";
import { entityZone } from "@amax/workflows";
import { createRelease, recordDeployment, voidDeployment } from "../server/services";
import { getProject, getRelease, listEnvironments } from "../server/queries";
import { dayLabel, releaseDay } from "../server/release-status";
import { ReleaseBody } from "../ui/ReleasePage";
import { OPEN, releaseDb, T } from "./release-db";

const dayIn = (zone: string, at: string) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at));
const dayBefore = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
const migration = readFileSync(new URL("../db/migrations/0027_release_completed_day.sql", import.meta.url), "utf8");

describe.skipIf(!hasDb)("128 a completed release keeps the day it completed on (Postgres)", () => {
  let db: Awaited<ReturnType<typeof releaseDb>>;
  let entity: string;
  const zoneTo = async (zone: string | null) => {
    if (zone) await db.t.owner`insert into workflows.entity_zone (legal_entity_id, tenant_id, timezone) values (${entity}, ${T}, ${zone}) on conflict (legal_entity_id) do update set timezone = excluded.timezone`;
    await db.t.owner`update delivery.project set legal_entity_id = ${zone ? entity : null} where key = 'RTK'`;
  };
  const page = async (version: string) => {
    const [release, envs, project] = await Promise.all([getRelease(db.sahan, "RTK", version), listEnvironments(db.sahan, "RTK"), getProject(db.sahan, "RTK")]);
    return renderToStaticMarkup(createElement(ReleaseBody, { viewer: db.sahan, release: { ...release!, projectId: project!.project.id }, envs }));
  };
  const complete = async (version: string, targetDate: string) => {
    await createRelease(db.admin(), { ...OPEN, projectKey: "RTK", version, targetDate });
    await recordDeployment(db.admin(), { projectKey: "RTK", version, environment: "UAT" });
    return (await getRelease(db.sahan, "RTK", version))!;
  };
  beforeAll(async () => {
    db = await releaseDb();
    entity = (await db.t.owner`select id from core.legal_entity where tenant_id = ${T} limit 1`)[0].id as string;
  }, 120_000);
  afterAll(() => db?.t.drop());

  // Kiritimati and Pago Pago are 25 hours apart, so at any hour the move changes the day a read-time rule would show.
  it.each([
    { from: "Pacific/Kiritimati", to: "Pacific/Pago_Pago", late: false },
    { from: "Pacific/Pago_Pago", to: "Pacific/Kiritimati", late: false },
    { from: "Pacific/Kiritimati", to: "Pacific/Pago_Pago", late: true },
    { from: "Pacific/Pago_Pago", to: "Pacific/Kiritimati", late: true },
  ])("AC-1 AC-2 AC-4 completed in $from (late: $late), the days and the word stay after the project moves to $to", async ({ from, to, late }) => {
    await zoneTo(from);
    const today = dayIn(from, new Date().toISOString());
    const version = `k-${from}-${late}`.replace(/\W+/g, "-");
    const done = await complete(version, late ? dayBefore(today) : today);
    const day = dayIn(from, done.completedAt!);
    expect([done.completedDay, done.completion]).toEqual([day, late ? "late" : "on_time"]);
    await zoneTo(to);
    expect(dayIn(to, done.completedAt!)).not.toBe(day);
    await voidDeployment(db.admin(), { projectKey: "RTK", version, environment: "UAT", reason: "wrong run" });
    const after = (await getRelease(db.sahan, "RTK", version))!;
    expect([after.completedDay, after.completion, after.completingVoided?.day]).toEqual([day, done.completion, dayIn(from, after.completingVoided!.at)]);
    const html = await page(version);
    expect(html).toContain(`<dt>Completed</dt><dd>${dayLabel(day)} · ${late ? "Late" : "On time"}</dd>`);
    expect(html).toContain(`was voided on ${dayLabel(after.completingVoided!.day)}: wrong run`);
  });

  // The backfill against the rule completeBy judged by (entityZone): own zone, the country's default, none (UTC).
  it("AC-3 the migration fills the zone and day of a release completed before it by entityZone's rule: own zone, country default, UTC", async () => {
    const [lk, other] = await Promise.all(["=", "<>"].map(async (op) => (await db.t.owner`select id from core.legal_entity where tenant_id = ${T} and country ${db.t.owner.unsafe(op)} 'LK' limit 1`)[0].id as string));
    await db.t.owner`delete from workflows.entity_zone where legal_entity_id = ${lk}`;
    await db.t.owner`insert into workflows.entity_zone (legal_entity_id, tenant_id, timezone) values (${other}, ${T}, 'Pacific/Kiritimati') on conflict (legal_entity_id) do update set timezone = excluded.timezone`;
    await zoneTo(null);
    await complete("b1", OPEN.targetDate);
    const [{ id: rtk }] = await db.t.owner`select id from delivery.project where key = 'RTK'`;
    // The table as 0026 left it, under 0025's check: no zone or day. RTK's completions moved to an instant whose day
    // differs by zone (20:00 UTC on 12 Dec is 13 Dec in Colombo and Kiritimati), so a wrong zone step can't pass.
    // 154 made the release's completing-deployment key deferred; checked per statement here, so no pending check blocks the
    // ALTERs that follow an UPDATE in the same batch (in a real run 0027 comes before 0029, so it never meets one).
    const replay = (text: string) => db.t.owner.unsafe(`set constraints all immediate; ${text}`);
    const before = () => replay(`alter table delivery.release drop constraint release_completed_whole;
      alter table delivery.release drop column completed_zone, drop column completed_day;
      update delivery.release set completed_at = '2026-12-12T20:00:00Z' where project_id = '${rtk}' and completed_at is not null;
      alter table delivery.release add constraint release_completed_whole check ((status = 'completed') = (completed_at is not null and completion is not null and completing_deployment_id is not null) or status is null)`);
    try {
      for (const [legalEntity, own, day] of [[other, "Pacific/Kiritimati", "2026-12-13"], [lk, null, "2026-12-13"], [null, null, "2026-12-12"]] as const) {
        await db.t.owner`update delivery.project set legal_entity_id = ${legalEntity} where key = 'RTK'`;
        const zone = await withTenant(db.app, T, (tx) => entityZone(tx, legalEntity));
        expect(zone).toBe(own ?? (legalEntity ? "Asia/Colombo" : "UTC"));
        await before();
        await replay(migration);
        const rows = await db.t.owner`select completed_at, completed_zone, completed_day::text as day from delivery.release where project_id = ${rtk} and completed_at is not null`;
        expect(rows.length).toBeGreaterThan(0);
        for (const r of rows) expect([r.completed_zone, r.day, releaseDay(zone, r.completed_at as Date)]).toEqual([zone, day, day]);
      }
    } finally {
      const [{ n }] = await db.t.owner`select count(*)::int as n from information_schema.columns where table_schema = 'delivery' and table_name = 'release' and column_name = 'completed_zone'`;
      if (n === 0) await replay(migration);
    }
  });

  it("AC-1 a completed release without its zone or day is refused", async () => {
    await complete("c1", OPEN.targetDate);
    for (const column of ["completed_zone", "completed_day"]) {
      await expect(db.t.owner.unsafe(`update delivery.release r set ${column} = null from delivery.project p where p.id = r.project_id and p.key = 'RTK' and r.version = 'c1'`))
        .rejects.toThrow(/release_completed_whole/);
    }
  });
});
