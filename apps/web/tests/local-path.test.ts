import { describe, expect, it } from "vitest";
import { localPath } from "../lib/local-path";

describe("070 review round 1: a sign-in `next` target never leaves the site", () => {
  it.each([
    ["/\\evil.example", "/"],
    ["//evil.example", "/"],
    ["/\t/evil.example", "/"],
    ["/\n/evil.example/x", "/"],
    ["\\\\evil.example", "/"],
    ["https://evil.example/", "/"],
    ["javascript:alert(1)", "/"],
    ["", "/"],
    [undefined, "/"],
  ])("refuses %j", (next, want) => expect(localPath(next)).toBe(want));

  it.each([
    ["/", "/"],
    ["/time/my/2026-W43", "/time/my/2026-W43"],
    ["/oauth/authorize?client_id=a&state=b", "/oauth/authorize?client_id=a&state=b"],
    ["/time#requests", "/time#requests"],
  ])("keeps %j", (next, want) => expect(localPath(next)).toBe(want));
});
