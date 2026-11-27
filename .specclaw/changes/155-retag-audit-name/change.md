# A re-tag's audit names the release's name when it changes

**Change:** 155-retag-audit-name · **Created:** 2026-11-27 · **Review:** change

## Problem

154 made a re-tag carry a release's name along when the name is just the old version (0025 named every release made
before 145 after its version). Its last review pass found the re-tag's audit row still records only the version, so the
name change is written without a trace; the module standard audits every write. 154 is at its five-pass cap, so the fix
is its own change. Product owner (2026-11-27): keep the rename and fix the audit ("go with the best solution").

## Mock Delta

No screen changes. This change gets no mock section.

## Acceptance Criteria

1. **AC-1 The audit says what changed.** `tag_release`'s audit row has the version in `before` and `after` as today, and
   also the name in both when the re-tag changed it (`before.name` the old version, `after.name` the new one). A re-tag
   that leaves a real name as it is records no name.
2. **AC-2 One rule.** The name written and the name audited come from one computation, so they can't disagree.
3. **AC-3 Tests.** `retag-name-154.test.ts` also checks each case's audit row: the two that rename carry the name in
   `before` and `after`, the one with a real name carries none.

## Tasks

- [x] `T1` — AC-1 AC-2 AC-3: `tagRelease` works out the new name once, writes it and audits it; the test reads each case's audit row
  Files: modules/delivery/server/services.ts, modules/delivery/tests/retag-name-154.test.ts

## Verify

**Verdict:** PASS
Review: CLEAN — 2 rounds, final pass 03287ea439, models opus/opus; last round 0/0/0 b/M/m (`base_branch` 0b3dcd25, config restored after each).

- AC-1: pass. A re-tag that renames records `name` in the audit's `before` and `after`; one that keeps a real name records the version only (`retag-name-154.test.ts`, 3 rows).
- AC-2: pass. `tagRelease` works out the new name once and both writes and audits it.
- AC-3: pass. Each case's audit row is checked; with the old version-only audit the two renaming rows fail.

Commands: `npx vitest run modules/delivery/tests/retag-name-154.test.ts modules/delivery/tests/release-tracking-123-writes.test.ts`: 0 (8/8); `npx tsc --noEmit` in `modules/delivery`: 0. No screen changes, so no screenshots.
