import { describe, expect, it } from "vitest";
import { ago } from "../ui/age";

const min = 60_000;
describe("070 AC-57 a change request's age, to the minute", () => {
  it("AC57 counts minutes, then hours and minutes, then days and hours", () => {
    expect([0, 30_000, 5 * min, 59 * min, 60 * min, 84 * min, 24 * 60 * min, 27 * 60 * min, -min].map(ago)).toEqual(
      ["just now", "just now", "5 min ago", "59 min ago", "1 h ago", "1 h 24 min ago", "1 d ago", "1 d 3 h ago", "just now"]);
  });
});
