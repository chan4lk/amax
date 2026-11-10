import { describe, expect, it } from "vitest";
import { planWithdrawals } from "../sync/withdraw";

const row = (over: Record<string, unknown> = {}) => ({ phase: "planned", meta: { source: "main@4f2c9a1" }, synced_commit_at: "2026-10-08T09:00:00Z", ...over });
const project = (n: number, extra: Record<string, Record<string, unknown>> = {}) =>
  new Map<string, Record<string, unknown>>([...Array.from({ length: n }, (_, i) => [`FLT-${100 + i}`, row()] as const), ...Object.entries(extra)]);
const first = (n: number) => Array.from({ length: n }, (_, i) => `FLT-${100 + i}`);
// Proposals a push can't withdraw (FLT-9xx, read every time): they must not count toward the mass-withdrawal cap.
const many = (n: number, over: Record<string, unknown>) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`FLT-${900 + i}`, row(over)]));
const released = (n: number) => many(n, { phase: "released" });
const branchSynced = (n: number) => many(n, { meta: { source: "specclaw/9xx@51b9a07" } });
const at = "2026-10-09T09:00:00Z";

// 089 review round 1 (B4, B6): one rule for the push and the self-sync, and a read that looks like "everything was
// deleted" withdraws nothing. Each row: the stored proposals, the keys the sync read, the refs it covers.
describe("089 planWithdrawals", () => {
  it.each([
    ["a gone folder last synced from the default branch", project(6), first(5), ["main"], ["FLT-105"], null],
    ["the sync read no changes", project(6), [], ["main"], [], /read no changes/],
    ["it would withdraw most of the project", project(6), first(1), ["main"], [], /withdraw 5 of 6 proposals \(FLT-101, .*sync again confirming 5 \(/],
    ["a long release history doesn't raise the cap", project(4, released(20)), first(1), ["main"], [], /withdraw 3 of 4 proposals/],
    ["branch-synced proposals don't raise the cap", project(4, branchSynced(20)), first(1), ["main"], [], /withdraw 3 of 4 proposals/],
    ["a person confirms the held count", project(6), first(1), ["main"], first(6).slice(1), null, 5],
    ["a wrong count stays held", project(6), first(1), ["main"], [], /withdraw 5 of 6/, 4],
    ["nothing read can't be confirmed", project(6), [], ["main"], [], /read no changes/, 6],
    ["last synced from a branch", project(4, { "FLT-200": row({ meta: { source: "specclaw/200-x@51b9a07" } }) }), first(4), ["main"], [], null],
    ["a sync that read that branch takes its gone folder", project(4, { "FLT-200": row({ meta: { source: "specclaw/200-x@51b9a07" } }) }), first(4), ["main", "specclaw/200-x"], ["FLT-200"], null],
    ["Released", project(4, { "FLT-200": row({ phase: "released" }) }), first(4), ["main"], [], null],
    ["a newer commit already synced it", project(4, { "FLT-200": row({ synced_commit_at: "2026-10-10T00:00:00Z" }) }), first(4), ["main"], [], null],
    ["already withdrawn", project(4, { "FLT-200": row({ meta: { source: "main@4f2c9a1", withdrawn: true } }) }), first(4), ["main"], [], null],
  ])("%s", (_, rows, read, refs, keys, held, confirm?: number) => {
    const named = new Set([...(read as string[]), ...[...rows.keys()].filter((k) => k.startsWith("FLT-9"))]);
    const plan = planWithdrawals(rows, { named, refs: new Set(refs as string[]), committedAt: at, read: (read as string[]).length, confirm });
    expect(plan.keys).toEqual(keys);
    if (held) expect(plan.held).toMatch(held as RegExp); else expect(plan.held).toBeNull();
  });
});
