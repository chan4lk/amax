import { describe, expect, it } from "vitest";
import manifest from "../module";
import { EVENTS, isoWeekOf, parseWeekKey, shiftWeek, weekKey, weekStart, workDays } from "../contracts";
import { SHEETS, splitByAgent } from "../fixtures/week42";
import { chatIntents } from "../chat";
import { mcpTools } from "../mcp";

const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 10) / 10;

describe("time contracts", () => {
  it("AC1 weeks follow ISO weeks: week 42 of 2026 is Oct 12 to 16", () => {
    expect(isoWeekOf(new Date("2026-10-16T15:00:00Z"))).toEqual({ year: 2026, week: 42 });
    expect(weekStart({ year: 2026, week: 42 }).toISOString().slice(0, 10)).toBe("2026-10-12");
    expect(workDays({ year: 2026, week: 42 })).toEqual(["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"]);
    expect(isoWeekOf(new Date("2021-01-03T00:00:00Z"))).toEqual({ year: 2020, week: 53 });
    expect(weekKey(isoWeekOf(new Date("2025-12-29T00:00:00Z")))).toBe("2026-W01");
    expect(weekKey(shiftWeek({ year: 2026, week: 53 }, 1))).toBe("2027-W01");
    expect(parseWeekKey("2026-W42")).toEqual({ year: 2026, week: 42 });
    expect(parseWeekKey("2025-W53")).toBeNull();
  });

  it("AC3 fixture sheets add up to fixtures.md: 141.5 h, 90.2 h by agents (64%), 87.5 h submitted", () => {
    const parts = SHEETS.map((s) => ({ s, e: splitByAgent(s) }));
    expect(parts.every(({ e }) => e.every((x) => x.agent >= 0 && x.person >= 0))).toBe(true);
    const total = sum(parts.flatMap(({ e }) => e.map((x) => x.agent + x.person)));
    const agent = sum(parts.flatMap(({ e }) => e.map((x) => x.agent)));
    expect([total, agent, Math.round((agent / total) * 100)]).toEqual([141.5, 90.2, 64]);
    expect(parts.map(({ s, e }) => sum(e.map((x) => x.agent)) === s.agentHours)).toEqual([true, true, true, true, true]);
    expect(sum(SHEETS.filter((s) => s.status === "submitted").flatMap((s) => s.days.map((d) => d[2])))).toBe(87.5);
    const project = (k: string) => sum(SHEETS.flatMap((s) => s.days.filter((d) => d[1] === k).map((d) => d[2])));
    expect([project("CON"), project("FLT"), project("HRI")]).toEqual([68, 51.5, 22]);
  });

  it("AC4 and AC5 the manifest declares its events, the log time intent and the MCP tools", () => {
    expect(manifest.events?.emits).toEqual(Object.values(EVENTS));
    expect(Object.values(EVENTS).every((e) => e.startsWith("time."))).toBe(true);
    expect(chatIntents.map((c) => [c.id, c.tool])).toEqual([["time.log", "log_time"], ["time.correct", "correct_time_entry"], ["time.request", "request_time_change"], ["time.delete", "delete_time_entry"]]);
    expect(mcpTools.map((t) => t.name)).toEqual(expect.arrayContaining(["log_time", "correct_time_entry", "delete_time_entry", "submit_week", "approve_week", "request_time_change", "decide_change_request", "get_change_requests"]));
    expect(manifest).toMatchObject({ id: "time", group: "Work", order: 20, dependsOn: ["delivery"], integratesWith: ["hr", "leave"] });
  });
});
