import { describe, expect, it } from "vitest";
import { completionOf, releaseDay, releaseStatus, Tracking } from "../server/release-status";

const at = (today: string, completed = false) => releaseStatus({ today, start: "2026-12-01", target: "2026-12-12", completed });

describe("123 release status rule", () => {
  it("AC3 planned, in progress, overdue and completed by the project's day, late judged in its zone", () => {
    expect([at("2026-11-30"), at("2026-12-01"), at("2026-12-12"), at("2026-12-13"), at("2026-12-13", true)])
      .toEqual(["planned", "in_progress", "in_progress", "overdue", "completed"]);
    const evening = "2026-12-12T20:00:00Z";
    expect(completionOf(releaseDay("UTC", evening), "2026-12-12")).toBe("on_time");
    expect(completionOf(releaseDay("Asia/Colombo", evening), "2026-12-12")).toBe("late");
    expect(completionOf(releaseDay("America/New_York", "2026-12-13T03:00:00Z"), "2026-12-12")).toBe("on_time");
  });

  it("AC4 fields: a name, Dev, UAT or Prod in any case, and real calendar days", () => {
    expect(Tracking.parse({ name: " Offline drafts ", category: "uat", startDate: "2026-12-01", targetDate: "2026-12-12" }))
      .toEqual({ name: "Offline drafts", category: "uat", startDate: "2026-12-01", targetDate: "2026-12-12" });
    for (const bad of [{ name: " " }, { category: "QA" }, { startDate: "2026-02-30" }, { targetDate: "12/12/2026" }])
      expect(Tracking.safeParse({ name: "R", category: "Prod", startDate: "2026-12-01", targetDate: "2026-12-12", ...bad }).success).toBe(false);
  });
});
