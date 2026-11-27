import { describe, expect, it } from "vitest";
import type { OverviewWaiting } from "@amax/core";
import { byAttention } from "../lib/overview";

const item = (id: string, since: string, snoozeDays?: number): OverviewWaiting =>
  ({ id, title: id, detail: null, context: "", raisedBy: "amax", agent: true, since, action: "", prompt: "", pin: { label: id, tool: "t", args: {} }, ...(snoozeDays ? { snoozeDays } : {}) });

// 116 final pass (AC-5): a nudge leads "Waiting on you", so six older decisions never push it out of view.
describe("116 AC-5 the order of Waiting on you", () => {
  it.each([
    ["a nudge newer than every decision", [item("d1", "2026-11-01"), item("nudge", "2026-11-16", 30), item("d2", "2026-11-02")], ["nudge", "d1", "d2"]],
    ["seven decisions and a nudge", [...Array.from({ length: 7 }, (_, i) => item(`d${i}`, `2026-11-0${i + 1}`)), item("nudge", "2026-11-16", 30)], ["nudge", "d0", "d1", "d2", "d3", "d4", "d5", "d6"]],
    ["decisions alone, oldest first", [item("b", "2026-11-03"), item("a", "2026-11-01")], ["a", "b"]],
  ])("%s", (_n, items, order) => {
    expect([...items].sort(byAttention).map((i) => i.id)).toEqual(order);
  });
});
