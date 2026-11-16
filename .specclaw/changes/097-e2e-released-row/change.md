# The proposals e2e checks a Prod-released row and a repo-history row, not whichever row is first

**Change:** 097-e2e-released-row · **Created:** 2026-11-10 · **Review:** change

**Depends on:** 096-repo-sync-follow-ups (same branch, PR #113).

## Problem

PR #113's `checks` fails one e2e: `delivery.spec.ts` "AC2 proposals show the phase bar and the full list" opens Released
and expects the first row to say "Prod". Since 091 the e2e's AMX sync brings the repo's archived changes in as Released
history, which correctly reads "Released · from repo" (092), so the first row is AMX-066 and the check fails. (The
`role "root" does not exist` lines in the job are the Postgres service's `pg_isready` health check, present in green runs
too, not the cause.)

## Mock Delta

What changes on screen, and where to see it: [`097-e2e-released-row`](../../mock/index.html#097-e2e-released-row)

Nothing: the Released list already shows "Prod" for a Prod-released proposal and "Released · from repo" for repo
history; the section restates the two rows the test checks.

## Acceptance Criteria

1. **AC-1** The e2e opens the Released tab, then checks Contoso's Released list (`?project=CON`): its first row says
   "Prod" (a Prod deployment released it).
2. **AC-2** It checks AMX's Released list (`?project=AMX`): its first row says "Released · from repo", not "Prod".
3. **AC-3** PR #113's `checks` job is green.

## Tasks

- [x] `T1` — The proposals e2e checks a Prod-released row and a repo-history row by project (AC-1, AC-2, AC-3)
  Files: apps/web/tests/e2e/delivery.spec.ts

## Verify

**Verdict:** PASS

- AC-1: pass — the e2e reads the first row's "Shipped to" cell of `/delivery/proposals/released?project=CON`; on the dev
  server it is CON-009, "Prod".
- AC-2: pass — the same cell for `?project=AMX`; on the dev server AMX-045, "Released · from repo".
- AC-3: pending CI on push. The previous run's only failure was this assertion (`delivery.spec.ts:91`, 1 failed, 52
  passed); the `role "root" does not exist` lines are the Postgres service's `pg_isready` health check and appear in
  green runs too (194 in run 42744272254).

**Commands:** `apps/web` `tsc --noEmit`: exit 0. The e2e itself runs in CI (not on this host).

### Review loop (2026-11-10)

Scope: commits after `c012edf1` (096's verify). `Review: CLEAN — 2 rounds, final pass 35467abf8a`.

| Round | Pass | Result |
|---|---|---|
| 1 | round (opus) | clean; 1 minor to follow-ups (check every row's cell, not only the first) |
| 2 | final (opus) | clean |
