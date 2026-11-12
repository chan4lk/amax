# Notifications tests pass at any hour

**Change:** 088-notifications-tests-quiet-hours · **Created:** 2026-11-07 · **Review:** change

## Problem

CI failed on PR #113 in `@amax/notifications#test`. Maya's fixture quiet hours run 21:00 to 07:00 in Sri Lanka time,
which is 15:30 to 01:30 UTC. `delivery-routing.test` and `time-routing.test` don't clear them, so a run during those
hours holds Maya's deliveries. `drain()` wakes the sleeping runs, quiet hours put them back to sleep, and the test fails
with "events or runs never settled". Two other files already clear the quiet hours themselves. The "insight … has no
source" line in the CI log is noise: `insights.test` provokes that error on purpose.

**Depends on:** 087-proposal-review-follow-ups (same branch, PR #113).

## Mock Delta

None. Tests only; no screen changes. No section.

## Acceptance Criteria

1. **AC-1** `notificationsDb()` (the shared test helper) clears the fixture quiet hours once, after loading fixtures,
   so every Notifications test runs the same at any hour. `delivery-flow.test` and `rules.test` drop their own copies.
   `channels.test` keeps checking quiet hours with fixed timestamps (`quietEnd`).
2. **AC-2** Every Notifications test file passes after 21:00 Sri Lanka time, checked on a run made in that window.

## Tasks

- [x] `T1` — The shared test helper clears the fixture quiet hours once; the two per-file copies go; checked after 21:00 Colombo (AC-1, AC-2)
  Files: modules/notifications/tests/db.ts, modules/notifications/tests/delivery-flow.test.ts, modules/notifications/tests/rules.test.ts

## Verify

**Verdict:** PASS

- AC-1: pass — `notificationsDb()` clears the fixture quiet hours after loading fixtures; `delivery-flow` and `rules` no longer
  clear them themselves; `channels.test` still checks quiet hours with fixed timestamps.
- AC-2: pass — Notifications 7/7 files, 15/15 tests, run at 21:48 Sri Lanka time, inside the quiet-hours window. Without the
  fix, the same suite failed 3 at 21:43 (`delivery-routing` AC75, `time-routing` AC3/AC4 and AC5: "events or runs never settled").

Notes:
- The CI log's "insight … has no source" ERROR is from `insights.test` (line 25), which provokes it on purpose; it
  appears in every run, passing or failing.
- Review: `Review: CLEAN`, one final pass at `aad6acab` (0/0/0), scoped to 088's three test files (`git.base_branch` set
  to `53723f9e` for the run, then restored). It came after every commit PR #113 has, so 082 to 087's commits are covered too.
