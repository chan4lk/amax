import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { afxDb } from "./afx";

describe.skipIf(!hasDb)("121 escalation: Health reads what the repo says", () => {
  let afx: Awaited<ReturnType<typeof afxDb>>;

  beforeAll(async () => { afx = await afxDb(); }, 120_000);
  afterAll(() => afx?.db.t.drop());
  beforeEach(async () => { await afx.db.t.owner`delete from delivery.proposal where key in ('AFX-002', 'AFX-003')`; });

  it.each([
    ["a blocked open proposal puts the project at risk", [["AFX-002", "building", { status: "blocked" }]], "at-risk", "AFX-002 blocked"],
    ["a failed verify outranks a blocked proposal", [["AFX-002", "building", { status: "blocked" }], ["AFX-003", "building", { verdict: "FAIL" }]], "off-track", "AFX-003 failed verify"],
    ["a released proposal that was blocked doesn't count", [["AFX-002", "released", { status: "blocked" }]], "on-track", null],
    ["an old build with no dates and no blocker is on track", [["AFX-002", "building", { status: "ready" }]], "on-track", null],
  ] as const)("AC-3 %s", async (_, rows, health, reason) => {
    for (const [key, phase, meta] of rows) await afx.proposal(key, phase, null, meta);
    expect(await afx.row()).toMatchObject({ health, healthReason: reason });
  });
});
