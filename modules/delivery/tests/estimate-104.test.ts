import { describe, expect, it } from "vitest";
import { estimateDays } from "../sync/estimate";

const at = (h: string, day = "2026-11-12") => `${day}T${h}:00Z`;
let n = 0;
const c = (when: string) => ({ id: `c${++n}`, at: when });
const days = (times: string[], zone?: string) => estimateDays(times.map((t, i) => ({ id: `c${i + 1}`, at: t })), zone).map(({ ids: _ids, ...d }) => d);

// 104 AC-3: hours from commit times: sessions 90 minutes apart, 30 minutes before the first, quarter hours, 8 h a day,
// split at midnight.
describe("104 AC-3 the estimate from commit times", () => {
  it.each([
    ["one commit is half an hour", [at("09:00")], [{ day: "2026-11-12", hours: 0.5, commits: 1 }]],
    ["one session: 30 minutes before the first commit to the last", [at("09:00"), at("09:40"), at("10:15")], [{ day: "2026-11-12", hours: 1.75, commits: 3 }]],
    ["two sessions when commits are 90 minutes or more apart, summed", [at("09:00"), at("09:30"), at("11:00"), at("11:20")], [{ day: "2026-11-12", hours: 1.75, commits: 4 }]],
    ["rounded to a quarter hour", [at("09:00"), at("09:07")], [{ day: "2026-11-12", hours: 0.5, commits: 2 }]],
    ["capped at 8 hours a day", Array.from({ length: 12 }, (_, i) => at(`${String(8 + i).padStart(2, "0")}:00`)), [{ day: "2026-11-12", hours: 8, commits: 12 }]],
    ["order of input doesn't matter, and an unreadable time is skipped", [at("10:15"), "soon", at("09:00")], [{ day: "2026-11-12", hours: 1.75, commits: 2 }]],
    ["no commits, no days", [], []],
  ])("AC-3 %s", (_, times, want) => {
    expect(days(times)).toEqual(want);
  });

  // Review rounds 1 and 2 (B3, B4): days are the person's own (their entity's zone). A day names only the commits made on
  // it, and time on a day with none of the session's commits (its lead-in) goes to the day of its first commit.
  it.each([
    ["UTC: a session across midnight, commits on both days", "UTC", [at("23:30"), at("00:45", "2026-11-13")],
      [{ day: "2026-11-12", hours: 1, commits: 1 }, { day: "2026-11-13", hours: 0.75, commits: 1 }]],
    ["UTC: only the lead-in is before midnight, so it all goes to the commit's day", "UTC", [at("00:10", "2026-11-13")], [{ day: "2026-11-13", hours: 0.5, commits: 1 }]],
    ["Colombo (+05:30): 20:00 UTC is the next local day", "Asia/Colombo", [at("20:00"), at("20:30")], [{ day: "2026-11-13", hours: 1, commits: 2 }]],
    ["Colombo: a session across local midnight (18:30 UTC), a commit on each side", "Asia/Colombo", [at("18:15"), at("18:45")],
      [{ day: "2026-11-12", hours: 0.75, commits: 1 }, { day: "2026-11-13", hours: 0.25, commits: 1 }]],
    ["Sydney (+11:00 in November): 22:00 UTC is the next local day", "Australia/Sydney", [at("22:00")], [{ day: "2026-11-13", hours: 0.5, commits: 1 }]],
  ])("review-1 %s", (_, zone, times, want) => {
    expect(days(times, zone)).toEqual(want);
  });

  it("review-2 each day's ids are its own commits, so the count, the ids and the days agree", () => {
    const a = c(at("23:30")), b = c(at("00:45", "2026-11-13")), d = c(at("09:00", "2026-11-13"));
    const out = estimateDays([a, b, d]);
    expect(out.map((x) => [x.day, x.ids])).toEqual([["2026-11-12", [a.id]], ["2026-11-13", [b.id, d.id]]]);
    expect(out.every((x) => x.commits === x.ids.length && x.ids.length > 0)).toBe(true);
    expect(out.flatMap((x) => x.ids).sort()).toEqual([a.id, b.id, d.id].sort());
  });
});
