import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import { createRegistry } from "@amax/mcp";
import { chatSuggestions } from "../chat-suggestions";
import manifest from "../module";
import type { WeekUtilisation } from "../server/utilisation";
import { timeDb } from "./db";

const W43 = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"];

describe.skipIf(!hasDb)("072 weekly utilisation and targets (Postgres)", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  const registry = createRegistry([manifest]);
  beforeAll(async () => { db = await timeDb(); }, 60_000);
  afterAll(() => db?.t.drop());

  const call = async <R>(key: string, tool: string, args: object) => (await registry.call(await db.as(key), tool, args, { source: "mcp" })) as R;
  const logDays = async (key: string, hours: number[]) => { for (const [i, h] of hours.entries()) if (h) await call(key, "log_time", { projectKey: "FLT", day: W43[i], hours: h }); };
  const util = (key: string, args: object = { week: "2026-W43" }) => call<WeekUtilisation[]>(key, "get_week_utilisation", args);
  const row = (rows: WeekUtilisation[], name: string) => rows.find((r) => r.person === name)!;

  it("AC8 hours ÷ target, overtime above 100%, missing days, lowest first, below; an Engineer sees only themself", async () => {
    await logDays("kasun", [8, 8, 6, 8, 4]);
    await logDays("nimal", [8.95, 8.95, 8.95, 8.95, 9]);
    await logDays("dinesh", [8, 0, 0, 0, 0]);
    const all = await util("maya");
    expect(row(all, "Kasun Dias")).toMatchObject({ hours: 34, target: 40, utilisation: 85, overtime: false, missingDays: [] });
    expect(row(all, "Nimal Silva")).toMatchObject({ hours: 44.8, utilisation: 112, overtime: true });
    expect(row(all, "Dinesh Wickrama")).toMatchObject({ hours: 8, utilisation: 20, missingDays: ["Tue Oct 20", "Wed Oct 21", "Thu Oct 22", "Fri Oct 23"] });
    expect(all.map((r) => r.utilisation)).toEqual([...all.map((r) => r.utilisation)].sort((a, b) => a - b));
    expect((await util("maya", { week: "2026-W43", below: 80 })).map((r) => r.person)).toEqual(["Dinesh Wickrama"]);
    expect((await util("kasun")).map((r) => r.person)).toEqual(["Kasun Dias"]);
    const w42 = await util("maya", { week: "2026-W42" });
    expect(row(w42, "Ayesha Rahman")).toMatchObject({ hours: 23.5, utilisation: 59, leaveDays: 1, adjustedTarget: 32, adjustedUtilisation: 73 });
  }, 60_000);

  it("AC7 AC9 an Admin sets and resets a part-time target; my week reads back hours against it; approvers are offered the question", async () => {
    await expect(call("kasun", "set_weekly_target", { person: "Dinesh Wickrama", hours: 24 })).rejects.toThrow();
    await expect(call("sahan", "set_weekly_target", { person: "Dinesh Wickrama", hours: 24 })).resolves.toMatchObject({ target: 24 });
    expect(row(await util("maya"), "Dinesh Wickrama")).toMatchObject({ target: 24, utilisation: 33 });
    expect(await call("dinesh", "get_my_week", { week: "2026-W43" })).toMatchObject({ total: 8, target: 24, utilisation: 33 });
    await call("sahan", "set_weekly_target", { person: "dinesh@lumenlabs.test", hours: null });
    expect(await call("kasun", "get_my_week", { week: "2026-W43" })).toMatchObject({ total: 34, target: 40, utilisation: 85 });
    const offered = async (v: Viewer) => {
      const tools = new Set(registry.toolsFor(v).map((t) => t.name));
      const s = chatSuggestions.find((x) => x.label === "Who is below 80% this week?")!;
      return tools.has(s.tool) && (!s.when || (await s.when(v as never, { week: "2026-W43" })));
    };
    expect(await offered(await db.as("maya"))).toBe(true);
    expect(await offered(await db.as("kasun"))).toBe(false);
  }, 60_000);
});
