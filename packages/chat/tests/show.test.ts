import { describe, expect, it } from "vitest";
import { showOf } from "../src/show";

describe("chat show", () => {
  it("AC4 follows only a same-site path that a tool result asks the screen to show", () => {
    expect(showOf({ shown: true, show: "/allocations?q=Amal" })).toBe("/allocations?q=Amal");
    for (const bad of ["//evil.example", "https://evil.example", "\\evil", 5, undefined]) expect(showOf({ show: bad })).toBeUndefined();
    expect(showOf(null)).toBeUndefined();
  });
});
