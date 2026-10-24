import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { createRegistry } from "@amax/mcp";
import manifest from "../module";
import { proposeBulk } from "../server/bulk-card";
import { submitCard } from "../server/submit-card";
import { timeDb } from "./db";

const W43 = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"];

describe.skipIf(!hasDb)("073 approval checks: missing days on submit, anomalies out of approve-all (Postgres)", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  const registry = createRegistry([manifest]);
  beforeAll(async () => { db = await timeDb(); }, 60_000);
  afterAll(() => db?.t.drop());

  const call = async <R = Record<string, unknown>>(key: string, tool: string, args: object) => (await registry.call(await db.as(key), tool, args, { source: "mcp" })) as R;
  const logWeek = async (key: string, hours: number[]) => { for (const [i, h] of hours.entries()) if (h) await call(key, "log_time", { projectKey: "FLT", day: W43[i], hours: h }); };
  const weekId = async (key: string) => (await db.q(sql`select w.id from time.week w join auth.user u on u.id = w.user_id where u.email = ${`${key}@lumenlabs.test`} and w.iso_week = 43`))[0].id as string;

  it("AC9 submitting a week with a missing working day warns on the card and still submits, listing the day", async () => {
    await logWeek("kasun", [8, 8, 8, 8, 0]);
    expect(await submitCard(await db.as("kasun"), { week: "2026-W43" })).toEqual({ title: "Submit your timesheet for 2026-W43 (32 h)", lines: [{ label: "Missing", value: "Fri Oct 23. You can still submit." }] });
    await expect(call("kasun", "submit_week", { week: "2026-W43" })).resolves.toMatchObject({ status: "submitted", missingDays: ["Fri Oct 23"] });
  }, 60_000);

  it("AC10 over 60 h, a day over 14 h and missing days are flagged, skipped by approve-all, and still approvable one at a time", async () => {
    await logWeek("nimal", [15, 8, 8, 8, 8]);
    await logWeek("tharushi", [13, 13, 13, 13, 13]);
    await logWeek("dinesh", [8, 8, 8, 8, 8]);
    for (const key of ["nimal", "tharushi", "dinesh"]) await call(key, "submit_week", { week: "2026-W43" });
    const rows = (await call<{ rows: { personName: string; anomalies: string[] }[] }>("maya", "get_team_week", { week: "2026-W43" })).rows;
    const flags = (name: string) => rows.find((r) => r.personName === name)?.anomalies;
    expect([flags("Nimal Silva"), flags("Tharushi Wijesinghe"), flags("Kasun Dias"), flags("Dinesh Wickrama")])
      .toEqual([["a day over 14 h (Mon Oct 19)"], ["over 60 h (65 h)"], ["missing Fri Oct 23"], []]);
    const ids = [await weekId("nimal"), await weekId("tharushi"), await weekId("kasun"), await weekId("dinesh")];
    await expect(proposeBulk("approve")(await db.as("maya"), { weekIds: [ids[2]] })).rejects.toThrow(/every submitted timesheet there needs individual review \(Kasun Dias: missing Fri Oct 23\)/);
    const out = await call<{ summary: string; results: { person: string; status: string; note: string | null }[] }>("maya", "approve_weeks", { weekIds: ids });
    expect(out.summary).toBe("Approved 1 · skipped 3 · failed 0");
    expect(out.results.find((r) => r.person === "Kasun Dias")).toMatchObject({ status: "skipped", note: "needs individual review: missing Fri Oct 23" });
    await expect(call("maya", "approve_week", { weekId: ids[0] })).resolves.toMatchObject({ status: "approved" });
  }, 60_000);
});
