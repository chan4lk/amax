# A completed release keeps the day it completed on

**Change:** 150-release-completed-day · **Created:** 2026-11-26 · **Review:** change

## Problem

125's final review pass left one major open (125's `## Verify`). The release page works out the completion day at read
time, in the project's legal-entity zone as it is now. `completion` (On time or Late) was judged once, at completion, in
the zone of that moment, and since 126 Completed is final. If the project's legal entity or that entity's zone changes
later, the page can show a day after the target beside "On time", or the reverse.

## Mock Delta

What changes on screen, and where to see it: [`150-release-completed-day`](../../mock/index.html#150-release-completed-day)

- The release page's information card and lede: no new UI. After the project's zone changes, the completed day stays the
  one the release completed on, beside the same On time or Late.

## Acceptance Criteria

Terms. **The completion day**: the day in the project's zone (`releaseDay`, in the entity zone, UTC without one) of the
completing deployment's instant, the day `completion` is judged by.

1. **AC-1 Stored at completion.** Migration 0027 adds `delivery.release.completed_day date` and `completed_zone text`. Completing a release (a
   deployment of its category) stores the completion day with `completed_at` and `completion`, judged from that same
   day, in one write. `release_completed_whole` then also requires both on a completed release.
2. **AC-2 Read, never recomputed.** `getRelease` returns the stored day as `completedDay`, and the release page's
   information card and lede show it. Changing the project's legal entity, or the entity's zone, after completion leaves
   the day and On time or Late unchanged.
3. **AC-3 Backfill.** The migration fills `completed_day` for releases completed before it, in their project's zone at
   migration time, by `entityZone`'s rule: the entity's own zone (`workflows.entity_zone`), else its country's default
   (`ENTITY_ZONES`, inlined as it stands at 0027), else UTC. Release tracking (0025) hasn't reached `main`, so only dev
   and test databases hold such rows. (Amended at review round 1: the country step was left out at first.)
4. **AC-4 Scope.** The completion also stores the zone it was judged in (`completed_zone`), and the voided completing
   deployment's day is read in that zone, so both days on the page come from one zone. (Amended at the final pass,
   product owner, 2026-11-26: at first the voided day stayed in the current zone.) No other screen or tool changes.
   `ReleaseTracking` gains `completedDay`, additive.
5. **AC-5 Tests.** A table over at least three zones: complete through `recordDeployment`, then change the project's
   entity or its zone, and the stored day, `completion` and the rendered "Completed on … · On time|Late" still agree;
   the migration's backfill on a release completed before it; the constraint refuses a completed release without a day.

## Tasks

No UI task: the release page already prints `completedDay` (`ui/ReleaseInfo.tsx`, `ui/ReleasePage.tsx`); 128 changes
where that day comes from. `completeBy` is the only writer of a completion.

- [x] `T1` — AC-1 AC-3: migration 0027 adds `completed_day`, backfills completed releases (entity zone, else UTC), and requires it in `release_completed_whole`
  Files: modules/delivery/db/migrations/0027_release_completed_day.sql
- [x] `T2` — AC-1 AC-2 AC-4: `completeBy` stores the day it judged `completion` by; `trackingOf` and `getRelease` return the stored day; the voided day stays in the current zone
  Files: modules/delivery/server/release-tracking.ts, modules/delivery/server/queries.ts, modules/delivery/README.md
  Depends: T1
- [x] `T3` — AC-5: zone-change table through `recordDeployment` and the rendered page; the backfill; the constraint
  Files: modules/delivery/tests/release-completed-day-128.test.ts
  Depends: T2

## Verify

**Verdict:** PASS
Review: CLEAN — 5 rounds, final pass 13ab4c5a4c, models opus/opus; last round 0/0/0 b/M/m (`base_branch` 3f45d852, 125's last commit, for each run; config restored after each). Fix proof not proven: no `review.test_command` configured.
Size: 52 production lines against 3f45d852 (cap 400).

Checked 2026-11-26, Windows 11, dev app on :3000 with the scripted chat model, dev database migrated to 0027.

- AC-1: pass. 0027 adds `completed_zone` and `completed_day`; `completeBy` stores both with `completed_at` and `completion`, judged from that day, in one write; `release_completed_whole` refuses a completed release without either (`release-completed-day-128.test.ts`, the refusal test).
- AC-2: pass. `getRelease` returns the stored day; after the project moves between Kiritimati and Pago Pago (25 hours apart, so the day differs at any hour), the day and On time or Late stay, both On time and Late rows (zone table); on the dev app, CON v8.9.0 read "26 Nov 2026 · On time" before and after its entity moved to Kiritimati, where its completion instant is 27 Nov (`shots/app-before-zone-change.png`, `shots/app-after-zone-change.png`; the entity and zone restored after).
- AC-3: pass. The backfill follows `entityZone`'s rule, own zone, then the country default, then UTC, checked against `entityZone` at a pinned instant whose day differs by zone; it fails with the country step removed.
- AC-4: pass (amended at the final pass by the product owner). The voided completing deployment's day reads in the stored zone (zone table voids after the move); it fails with the voided day forced into another zone. No other screen or tool changed.
- AC-5: pass. `release-completed-day-128.test.ts`, 6 tests.

Commands (exit codes):

- `npx vitest run modules/delivery modules/notifications modules/leave apps/web/tests` (at the final-pass fixes, code unchanged since): 1, 1252/1254, host-only `releases.test` "two call sites" (backslash path) and the `create-project-surfaces` load timeout (7/7 alone)
- `npx tsc --noEmit` in `modules/delivery` and `apps/web`: 0
- `node scripts/check-module-standard.mjs --root .`: 0 (23 modules); `node scripts/check-graph.mjs --root .`: only the deliberate R7 fixture
- `specclaw-verify size .specclaw 128-release-completed-day` (base 3f45d852): 0
- `specclaw-preset-check .`: 1, repo-wide; in 128's files only the comment rule, as across the repo
- `specclaw-quality-scan . --gate`: 2, the complexity tool did not run; duplication repo-wide, none in 128's files
- `pnpm db:migrate` on the dev database: 0027 applied; edited before it reached `main` (only dev and test databases ran it), so the dev database's 0027 checksum and new column were brought up to date by hand

Screenshots: `shots/mock.png`, `shots/app-before-zone-change.png`, `shots/app-after-zone-change.png`

Quality: 860 → 860 duplicated lines (repo-wide; none in 128's files). Build note: no per-task commits from the agent (git is read-only here); the product owner commits.
