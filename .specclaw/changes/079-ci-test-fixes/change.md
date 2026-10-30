# CI tests: order-independent sync, chat tool list

**Change:** 079-ci-test-fixes · **Created:** 2026-10-30 · **Review:** change

## Problem

The PR's `test` job fails in `@amax/delivery` (run 41046160367). `sync-import.test.ts` re-syncs this repo and gets
`updated: 1`: 070's change.md lists `T26` before `T25`, and the sync compares the repo's tasks in file order with the
stored ones, which come back sorted by ref, so 070 reads as changed on every run. `chat.test.ts` AC-5 still expects the
tools `whoami, search`; 076 AC-1 added `offer_choices` to every chat turn and missed this test.

**Amendment 1, 2026-10-30** (product owner: "approve"). The next run fails in `e2e:auth` (run 41062118793), two tests
073 never ran (it ran only the time e2e). The Settings hub lists 073's per-entity reminder schedules, which wait for a
fixture entity's time zone ("2 schedules wait for an entity's time zone"); `admin.spec.ts` expects the old count. And 073
gave time cards their own confirm label and receipt ("Submit", "Submitted 2026-W42 · 29 h"); the shared e2e helper
`askAndConfirm` only clicks "Add it" and expects "Done:". The `FATAL: role "root"` lines are the `pg_isready` health
check, not the failure.

## Mock Delta

What changes on screen, and where to see it: [`079-ci-test-fixes`](../../mock/index.html#079-ci-test-fixes)

No screen changes. The mock section notes that.

## Acceptance Criteria

1. **AC-1** `fingerprint()` in `modules/delivery/sync/import.ts` (used by both the import and the repo push to
   decide "changed?") compares tasks sorted by ref, so a re-sync of an unchanged repo is `updated: 0` however the
   change.md orders its tasks. A variant table (T26 before T25, T10 before T9, reversed, sorted) checks the
   fingerprint, and a DB test syncs tasks written `T2, T10, T1` twice and gets `created: 0, updated: 0`. (Amended
   after the final pass: the sort moved from `desired()` into `fingerprint()`, so storage order no longer matters.)
2. **AC-2** `modules/delivery/tests/chat.test.ts` AC-5 expects the refused role's tools to be
   `whoami, search, offer_choices`, matching 076 AC-1.
3. **AC-3** `pnpm turbo run test --filter @amax/delivery` passes against local Postgres, and the fork-PR review gate
   still exits 0 with 079's own final review round.
4. **AC-4** (amendment 1) `askAndConfirm` (`apps/web/tests/e2e/ask.ts`) takes an optional `confirm` label and `done`
   text, defaulting to "Add it" and "Done:"; chat-first's submit test passes "Submit" and "Submitted 2026-W42".
5. **AC-5** (amendment 1) `admin.spec.ts` 047 AC1 expects the schedules item in the hub's lede for both roles. The full
   `pnpm --filter @amax/web e2e:auth` passes locally, including the 12 tests the failed run never reached.

## Tasks

- [x] `T1` — Sync orders a record's tasks as storage does, with an out-of-order re-sync test (AC-1)
  Files: modules/delivery/sync/import.ts, modules/delivery/tests/sync-import.test.ts
- [x] `T2` — Delivery chat test expects `offer_choices` (AC-2)
  Files: modules/delivery/tests/chat.test.ts
- [x] `T3` — Run the delivery tests on local Postgres and the review gate (AC-3)
  Files: .specclaw/changes/079-ci-test-fixes/change.md
  Depends: T1, T2
- [x] `T4` — e2e helper takes the card's own confirm label and receipt; admin hub expects the schedules item (AC-4, AC-5)
  Files: apps/web/tests/e2e/ask.ts, apps/web/tests/e2e/chat-first.spec.ts, apps/web/tests/e2e/admin.spec.ts

## Verify

**Verdict:** PASS

Amendment 1 verified 2026-10-30 at `4e4e9444`, in WSL Ubuntu set up as CI's runner (Node 24.22.2, pnpm 9.15.9, a
fresh `postgres:16-alpine`, a clean `git archive` of HEAD, which holds all of upstream/main; `CI=1`):

- AC-4: pass — `e2e:auth` chat-first "054 AC5 time: pin the week, ask amax to submit it" passes with `confirm: "Submit"`.
- AC-5: pass — `admin.spec.ts` 047 AC1 passes as Admin and IT Admin. `pnpm --filter @amax/web e2e` 8/8 and
  `pnpm --filter @amax/web e2e:auth` **82 passed, 0 failed**, including the 12 tests CI's failed run never reached.
- Final pass round 3 (over all of 079, head `4e4e9444`): clean, 0/0/0. Review gate (fork mode) with it: exit 0,
  every change passes.

Verified 2026-10-30 at `dc678e29`.

- AC-1: pass — `fingerprint()` sorts tasks by ref; `sync-task-order.test.ts` 5/5 (four orders fingerprint as storage's,
  a different task set doesn't); `sync-import.test.ts` "079 AC-1" re-syncs `T2, T10, T1` with `updated: 0`; the
  real-repo re-sync (070's T26 before T25) passes.
- AC-2: pass — `chat.test.ts` AC-5 expects `whoami, search, offer_choices` and passes.
- AC-3: pass — `@amax/delivery` tests 261/262 on local Postgres; the one failure is Windows-only (below). The fork-PR
  review gate over this branch exits 0, all 10 changes pass, 079 "final round 2/5 clean". `specclaw-review verdict`:
  "CLEAN — 2 rounds, final pass dc678e29c3".
- Final pass round 2: clean, 0/0/1. The minor (no `pushSpecclaw` out-of-order case) is in `follow-ups.md`.
- Screenshots: no app UI; the mock section only notes that. Mock `#079-ci-test-fixes`: compared by eye: Umar Ahamed,
  2026-10-30.

Amendment 1 build notes, 2026-10-30 (AC-4, AC-5 not yet verified):

- `pnpm lint`: exit 0 (35/35), including `tsc` over the edited e2e files.
- `e2e:auth` can't run on this Windows host: the built app answers 404 for every module page under `next start`
  ("does not work with output: standalone"), so the suite fails at the first sign-in. No change in this stack ran
  `e2e:auth` locally (only 074-fork-pr-review-gate, from upstream). CI's Linux run is the check for AC-4 and AC-5.

Build notes, 2026-10-30:

- `DATABASE_MIGRATE_URL=…:5440 pnpm turbo run test --filter @amax/delivery`: 256 passed, 1 failed. The two CI failures
  (`sync-import` re-sync, `chat` AC-5) and the new out-of-order test pass. The one failure is
  `releases.test.ts:289`, Windows-only: its `modules\/delivery\/` path regex doesn't match backslash paths. Untouched
  by 079; it passes on CI's Linux runner.
- `pnpm lint`: exit 0 (35/35).
- Final pass round 1 (open, 0 blockers, 2 majors, 1 minor): the sort lived in two places (JS and SQL) and the test
  had one case and skipped the push path. Fixed: the sort is inside `fingerprint()` and `sync-task-order.test.ts`
  is a variant table over it. Re-run: 261 passed, 1 failed (the same Windows-only `releases.test.ts:289`).
  The pre-existing major (a task removed from or listed twice in change.md also reads as a change every sync) is
  out of scope, in `follow-ups.md`.
