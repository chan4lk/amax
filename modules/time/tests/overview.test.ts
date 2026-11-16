import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { getProjectRef } from "@amax/delivery/contracts";
import { withTenant } from "@amax/db";
import { timeOverview } from "../server/overview";
import { T, timeDb } from "./db";

describe.skipIf(!hasDb)("Overview parts (Postgres)", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  // 104 AC-15: "this week" is the viewer's current week, so the clock is pinned to the fixtures' day (2026-10-16, W42).
  beforeAll(async () => { vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-16T08:00:00Z") }); db = await timeDb(); }, 60_000);
  afterAll(() => { vi.useRealTimers(); return db?.t.drop(); });

  it("068 AC-2 hours per week split agents and people, filtered by project, with the ticket, by-project share and timesheets to approve", async () => {
    const maya = await db.as("maya");
    const all = await timeOverview(maya, {});
    expect(all.tickets).toEqual([expect.objectContaining({ label: "Hours this week", value: "141.5", percent: 64 })]);
    const trend = all.panels!.find((p) => p.kind === "series");
    expect(trend).toMatchObject({ labels: expect.arrayContaining(["W42"]), pin: { tool: "get_hours_trend", args: { weeks: 12 } } });
    if (trend?.kind !== "series") throw new Error("no trend");
    expect(trend.labels).toHaveLength(12);
    expect([trend.series[0].data.at(-1), trend.series[1].data.at(-1)]).toEqual([90.2, 51.3]);
    const share = all.panels!.find((p) => p.kind === "share");
    if (share?.kind !== "share") throw new Error("no share");
    expect(share.parts.reduce((t, p) => t + p.value, 0)).toBeCloseTo(141.5, 1);
    expect(all.waiting).toEqual([expect.objectContaining({ title: "W42 timesheets", detail: expect.stringContaining("87.5 h"), action: "Review" })]);

    const con = (await withTenant(db.app, T, (tx) => getProjectRef(tx, "CON")))!;
    const only = await timeOverview(maya, { hp: con.id, hw: "26" });
    const conTrend = only.panels!.find((p) => p.kind === "series");
    if (conTrend?.kind !== "series") throw new Error("no trend");
    expect(conTrend.labels).toHaveLength(26);
    expect(conTrend.series[0].data.at(-1)! + conTrend.series[1].data.at(-1)!).toBeCloseTo(68, 1);
    const ignored = await timeOverview(maya, { hp: "javascript:alert(1)", hw: "9999" });
    expect(ignored.panels!.find((p) => p.kind === "series")).toMatchObject({ pin: { args: { weeks: 12 } } });

    const nimal = await timeOverview(await db.as("nimal"), {});
    expect(Number(nimal.tickets![0].value)).toBeLessThan(141.5);
  });
});
