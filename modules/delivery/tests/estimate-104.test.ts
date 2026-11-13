import { describe, expect, it } from "vitest";
import { estimateDays } from "../sync/estimate";

const at = (h: string, day = "2026-11-12") => `${day}T${h}:00Z`;

// 104 AC-3: hours from commit times: sessions 90 minutes apart, 30 minutes before the first, quarter hours, 8 h a day,
// split at midnight UTC.
describe("104 AC-3 the estimate from commit times", () => {
  it.each([
    ["one commit is half an hour", [at("09:00")], [{ day: "2026-11-12", hours: 0.5, commits: 1 }]],
    ["one session: 30 minutes before the first commit to the last", [at("09:00"), at("09:40"), at("10:15")], [{ day: "2026-11-12", hours: 1.75, commits: 3 }]],
    ["two sessions when commits are 90 minutes or more apart, summed", [at("09:00"), at("09:30"), at("11:00"), at("11:20")], [{ day: "2026-11-12", hours: 1.75, commits: 4 }]],
    ["rounded to a quarter hour", [at("09:00"), at("09:07")], [{ day: "2026-11-12", hours: 0.5, commits: 2 }]],
    ["capped at 8 hours a day", Array.from({ length: 12 }, (_, i) => at(`${String(8 + i).padStart(2, "0")}:00`)), [{ day: "2026-11-12", hours: 8, commits: 12 }]],
    ["order of input doesn't matter, and an unreadable time is skipped", [at("10:15"), "soon", at("09:00")], [{ day: "2026-11-12", hours: 1.75, commits: 2 }]],
    ["no commits, no days", [], []],
  ])("AC-3 %s", (_, times, days) => {
    expect(estimateDays(times)).toEqual(days);
  });

  // Review round 1 (B3, B4): days are the person's own (their entity's zone), and a session across their midnight names
  // its commits on every day it touches, so no day reads as "0 commits".
  it.each([
    ["UTC: a session across midnight is split, both days name its commits", "UTC", [at("23:30"), at("00:45", "2026-11-13")],
      [{ day: "2026-11-12", hours: 1, commits: 2 }, { day: "2026-11-13", hours: 0.75, commits: 2 }]],
    ["Colombo (+05:30): 20:00 UTC is the next local day", "Asia/Colombo", [at("20:00"), at("20:30")], [{ day: "2026-11-13", hours: 1, commits: 2 }]],
    ["Colombo: the same session crosses local midnight at 18:30 UTC", "Asia/Colombo", [at("18:15"), at("18:45")],
      [{ day: "2026-11-12", hours: 0.75, commits: 2 }, { day: "2026-11-13", hours: 0.25, commits: 2 }]],
    ["Sydney (+11:00 in November): 22:00 UTC is the next local day", "Australia/Sydney", [at("22:00")], [{ day: "2026-11-13", hours: 0.5, commits: 1 }]],
  ])("review-1 %s", (_, zone, times, days) => {
    expect(estimateDays(times, zone)).toEqual(days);
  });
});
