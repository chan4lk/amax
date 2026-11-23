import { describe, expect, it } from "vitest";
import { onlyInput } from "../server/only";

const base = { person: "Ayesha Rahman", projectKey: "CON", percent: 50 };

describe("allocate_only takes at most 24 months at a time, like allocate", () => {
  it.each([
    ["one month", "2026-12", undefined, true],
    ["exactly 24 months", "2026-12", "2028-11", true],
    ["25 months", "2026-12", "2028-12", false],
    ["a range across three years", "2026-11", "2029-01", false],
    ["a reversed range", "2027-03", "2027-01", false],
  ])("%s", (_name, month, through, ok) => {
    expect(onlyInput.safeParse({ ...base, month, through }).success).toBe(ok);
  });
});
