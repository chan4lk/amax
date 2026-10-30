import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@amax/db";
import { hasDb } from "@amax/db/testdb";
import { ctxFor } from "../server/context";
import { hoursVisibleTo } from "../server/hours-scope";
import { logTime } from "../server/log";
import { T, timeDb } from "./db";

// 071 review rounds 1–3: Reports see a person's hours week by week on Time's own seesWeek rule, counting every live
// entry of the week. Nimal is PM of Fleet Tracker; Kasun's entries:
//   W42 (fixtures): Fleet Tracker and Contoso Portal.
//   W44: Fleet Tracker on Mon Oct 26, Contoso Portal on Thu Oct 29. A range from Oct 28 splits this week: the Fleet
//        Tracker day is outside it, yet the week still holds Fleet Tracker hours, as Time counts it.
//   W45: only Contoso Portal, on Tue Nov 3.
describe.skipIf(!hasDb)("071 hoursVisibleTo follows Time's week scope (Postgres)", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  beforeAll(async () => {
    db = await timeDb();
    const kasun = ctxFor(await db.as("kasun"));
    // Seeds fail the test if they fail: no swallowed errors.
    await logTime(kasun, { projectKey: "FLT", day: "2026-10-26", hours: 1 });
    await logTime(kasun, { projectKey: "CON", day: "2026-10-29", hours: 1 });
    await logTime(kasun, { projectKey: "CON", day: "2026-11-03", hours: 1 });
  }, 60_000);
  afterAll(() => db?.t.drop());

  const OCT = { from: "2026-10-01", to: "2026-10-31" };
  it.each([
    ["nimal", "2026-10-14", OCT, true], // W42 has Fleet Tracker hours
    ["nimal", "2026-10-29", { from: "2026-10-28", to: "2026-10-31" }, true], // W44 split by the range: Fleet Tracker is on the 26th, outside it
    ["nimal", "2026-11-03", { from: "2026-11-01", to: "2026-11-30" }, false], // W45 only Contoso Portal
    ["maya", "2026-11-03", { from: "2026-11-01", to: "2026-11-30" }, true], // Kasun's line manager sees every week
    ["kasun", "2026-11-03", { from: "2026-11-01", to: "2026-11-30" }, true], // their own
    ["dinesh", "2026-10-14", OCT, false], // a colleague, no chain
  ] as const)("%s sees Kasun's hours on %s", async (who, day, range, want) => {
    const [viewer, owner] = await Promise.all([db.as(who), db.as("kasun")]);
    const sees = await withTenant(db.app, T, (tx) => hoursVisibleTo(tx, viewer, { userIds: [owner.userId], ...range }));
    expect(sees(owner.userId, day)).toBe(want);
  });
});
