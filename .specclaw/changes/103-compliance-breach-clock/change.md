# Compliance breach test clock

**Change:** 103-compliance-breach-clock · **Created:** 2026-11-12

## Problem

CI's `checks` job fails on `modules/compliance/tests/registers.test.ts` AC2 ("expected … to match object { daysLeft: 5 }",
got 6), on PR #116 and, by the date alone, on any branch. The test mixes a breach due 72 h from the real clock with the
fixtures' Payslip breach, fixed at 2026-11-15. From 2026-11-11 on, the reminder run timed off the real clock falls inside
the Payslip breach's last week, so that breach's first reminder says 6 days left instead of 5. From about 2026-11-13,
the same run marks it reminded for a later day and the 2026-11-10 run reminds nothing.

**Amendment 1 (2026-11-12, product owner):** with compliance fixed, CI's signed-in e2e failed next on the same kind of
drift. `retention.spec.ts:32` expects the "Agent run logs" row (9,410) in the Data retention page's purged-in-the-last-30-
days card, but `apps/web/lib/privacy-fixtures.ts` seeds the purge log at a fixed 2026-10-12T01:00Z, which left the
30-day window (`purgedSince`, `packages/core/src/privacy/view.ts`) on 2026-11-11. The local demo's card is empty for the
same reason. 103 now covers both (AC-4, T2).

## Mock Delta

What changes on screen, and where to see it: [`103-compliance-breach-clock`](../../mock/index.html#103-compliance-breach-clock)

No screen changes. The section says so.

## Acceptance Criteria

1. **AC-1** `registers.test.ts` AC2 pins the clock (`Date` only) to the fixtures' day, 2026-10-16, and restores it after,
   so every date the test checks is fixed. Its assertions are otherwise unchanged: the 72 h deadline, the regulator, the
   reminders and `daysLeft: 5`.
2. **AC-2** The test passes today, and CI's `checks` job passes the compliance suite on PR #116.
3. **AC-3** No change to `modules/compliance/server/`, the compliance fixtures, or any other test. (Amendment 1: the
   only other file is the privacy seed in AC-4.)
4. **AC-4** (amendment 1) The demo and e2e seed writes the purge log at `now() - 4 days`, as 2026-10-12 was to the
   fixtures' day, so the Data retention card shows "Agent run logs 9,410" on any date. `purgedSince` and the page are
   unchanged, and the card shows no date, so screens and visual snapshots don't change. `retention.spec.ts` passes.

## Tasks

No UI: a test-only fix (the mock section says so).

- [x] `T1` — Pin AC2's clock (`Date` only) to 2026-10-16 and restore it when the test finishes; update its comment (AC-1, AC-2, AC-3)
  Files: modules/compliance/tests/registers.test.ts
- [x] `T2` — Seed the purge log relative to today (AC-4)
  Files: apps/web/lib/privacy-fixtures.ts

## Verify

**Verdict:** PASS on this host, verified at `35c8157b` on 2026-11-12. `Review: CLEAN — 4 rounds, final pass
35c8157b65`. CI's `checks` on PR #116 still has to confirm AC-2 and the retention e2e of AC-4 after the push.
Two minors from rounds 3–4 are in `follow-ups.md`: the seed doesn't re-date rows on a reused database, and the mock
section doesn't mention amendment 1.

- AC-4: on this host, the page's own query (`purgedSince`, 30 days) over a row seeded at `now() - 4 days` returns
  "Agent run logs 9410", and over one at the old 2026-10-12T01:00Z returns nothing (both inside a rolled-back
  transaction on the local database). The signed-in e2e can't run on this Windows host: every spec, including
  unrelated visual ones, times out filling the sign-in form ("Cannot append headers after they are sent to the
  client"). `retention.spec.ts` is checked by CI's `checks` job. `apps/web` `tsc --noEmit`: exit 0.

Before amendment 1 (`Review: CLEAN — 2 rounds, final pass 6e16461885`):

- AC-1: pass — AC2 calls `vi.useFakeTimers({ toFake: ["Date"], now: 2026-10-16T08:00:00Z })` and restores the real
  clock in `onTestFinished`. Its assertions are unchanged (72 h deadline, regulator, reminders, `daysLeft: 5`).
- AC-2: pass on this host — before the fix the test failed locally exactly as in CI (`daysLeft` 6, expected 5); after
  it, `modules/compliance` passes 14/14. CI's `checks` on PR #116 is pending the push.
- AC-3: pass — the only code file changed is `modules/compliance/tests/registers.test.ts` (plus the two identical mock
  copies' section for 103).
- `tsc --noEmit` in `modules/compliance`: exit 0.
- Screenshot: not needed beyond the mock's text: no screen changes.

### Review loop (2026-11-12)

Scope: commits after `9aefa301` (102's last commit; this change is stacked on it). Models opus/opus.

| Round | Pass | Result |
|---|---|---|
| 1 | round | clean; 1 minor (the fixture day is written in three places) to follow-ups |
| 2 | final | clean |
| 3 | round, since `66730fa8` (amendment 1) | clean; 1 minor (a reused database keeps old seed dates) to follow-ups |
| 4 | final | clean; 1 minor (the mock lede doesn't mention amendment 1) to follow-ups |
