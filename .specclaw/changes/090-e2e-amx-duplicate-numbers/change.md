# The AMX e2e counts leave out the duplicate-numbered changes the sync skips

**Change:** 090-e2e-amx-duplicate-numbers · **Created:** 2026-11-10 · **Review:** change

**Depends on:** 089-specclaw-sync-over-mcp (same branch, PR #113).

## Problem

Since 089, `readSpecclaw` returns both folders of a shared number (062, 074 and 075 in this repo), and the sync skips
them. Two e2e tests in `apps/web/tests/e2e/delivery.spec.ts` still counted every record, so CI's `e2e:auth` failed on
PR #113: the AMX lanes expected 3, 0, 1, 24, 64 and the board showed 3, 0, 0, 21, 62; "in flight" expected 65 and
showed 61. The fix landed after 089's last review pass (`7111a89`), so the review gate counts it as unreviewed; it
needs a loop of its own, and 089 is at the five-pass cap.

## Mock Delta

None. Tests only; no screen changes. No section.

## Acceptance Criteria

1. **AC-1** The e2e helper `amx()` returns only the records the sync puts on the board (not `duplicate`), and the
   "039 the AMX board" test uses it for its lane counts: they match the board (3, 0, 0, 21, 62 at the time of writing).
2. **AC-2** "AC2 proposals show the phase bar" counts AMX's in-flight proposals through the same helper, so the
   "in flight" figure matches the page (61 at the time of writing).
3. **AC-3** The review gate passes on PR #113: the e2e fix's commit names this change, and this change's final pass
   comes after it.

## Tasks

- [x] `T1` — `amx()` leaves out duplicate-numbered records; the 039 test uses it (AC-1, AC-2)
  Files: apps/web/tests/e2e/delivery.spec.ts
- [x] `T2` — Review loop for this change after the commit, then the gate on PR #113 (AC-3)
  Files: .specclaw/changes/090-e2e-amx-duplicate-numbers/change.md
  Depends: T1

## Verify

**Verdict:** PASS

- AC-1: pass — `amx()` is `onBoard(readSpecclaw(repo))`, the self-sync's own rule (`skipReason` in
  `sync/duplicates.ts`, also used by `import.ts`); `on-board-090.test` (4 cases: own number, shared number,
  unreadable `state.json`, client-flagged). The 039 lanes match CI's AMX board (3, 0, 0, 21, 62 on run 42651966844).
- AC-2: pass — the AC2 test counts in-flight through the same helper (61 on the same run).
- AC-3: pass once pushed — the fix's commits name this change (`f78831e3`, `41a56df6`) and this change's final pass
  ran at `41a56df6`; the gate's rule (`scripts/review-gate/covered.mjs`) excuses a later commit only when it names a
  change whose final pass came after it.

Commands (Windows, local Postgres): `tsc --noEmit` in `modules/delivery` and `apps/web`: 0 errors. Vitest:
`on-board-090`, `sync-import`, `sync-push-089`, `sync-push`: 47/47. e2e: not run here (the browser download fails on
this network); PR #113's `checks` job passed with the first version of the fix (run 42651966844).

Review: `Review: CLEAN — 2 rounds, final pass 41a56df6f3, models opus/opus; last round 0/0/0 b/M/m`.
- Round 1 (final): 1 major (B4), the e2e filter copied half of the sync's skip rule. Fixed with one shared rule.
- Round 2 (final): clean; one pre-existing minor in `follow-ups.md` (push.ts keeps its own copy of the skip rule).
- Scope: commits after `0dbf250b` (089's verify), `git.base_branch` set for each run, then restored.
