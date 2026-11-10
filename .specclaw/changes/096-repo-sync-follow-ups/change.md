# Repo sync follow-ups: a phase the repo reached stays recorded, every repo time is bounded, and the docs match

**Change:** 096-repo-sync-follow-ups · **Created:** 2026-11-10 · **Review:** change

**Depends on:** 095-pr-113-ci-green (same branch, PR #113).

## Problem

094 stopped at the five-pass cap with three findings open, and 095's review left two pre-existing ones. A read of
`state.json` that leaves a phase out (the file is gone, or verify went from done to failed on a re-run) deletes that
phase's stored time, so its "in the repo" history line and its `repo:<phase>` pin disappear. One malformed stored phase
entry hides every repo line. `sync_proposal`'s `meta.source` becomes a phase's read without the commit-sha check.
`sync_proposal` and `mark_synced` take a future `committedAt` (the push refuses one), which then marks the proposal stale
against every real push until the clock catches up, and `releasedAt` is an unchecked string. The delivery README still
says the Released card reads "In Prod · <release>".

## Mock Delta

What changes on screen, and where to see it: [`096-repo-sync-follow-ups`](../../mock/index.html#096-repo-sync-follow-ups)

A proposal whose verify was re-run and failed in the repo still shows "Verified in the repo · 18 Oct" in its history
(the repo reached it then); nothing else on screen changes.

## Acceptance Criteria

1. **AC-1** A phase the repo reached stays recorded: a read that leaves a phase out (no `state.json`, a status that moved
   on) keeps its stored entry and read; a read that gives a phase a new time replaces it. Table: left out, moved on,
   new time, same time, future time, not read at all.
2. **AC-2** Stored phase entries are read one by one: a malformed entry is skipped, and the others still show and pin.
3. **AC-3** A phase's read is recorded only when the write's `meta.source` is `<ref>@<sha>` by the one commit-sha rule
   (`sync/sha.ts`); otherwise the entry is stored with no read and its line says "From the repo".
4. **AC-4** `sync_proposal` and `mark_synced` refuse a `committedAt` in the future, as `sync_specclaw` does (one rule,
   `notFuture`, as a refine that still converts to JSON Schema); `releasedAt` is a datetime, and one in the future is
   unknown (`knownTime`). Rows in the `sync_proposal` table for both.
5. **AC-5** The delivery README says the Released card reads "In Prod" beside its release chip (095 AC-2).
6. **AC-6** Tests: a table per rule; the 089–095 suites and `tool-schemas` stay green.

## Tasks

- [x] `T1` — Repo phases: kept once reached, read entry by entry, a read recorded only from `<ref>@<sha>` (AC-1, AC-2, AC-3)
  Files: modules/delivery/server/repo-time.ts, modules/delivery/tests/repo-sync-096.test.ts, modules/delivery/tests/repo-dates-094.test.ts
- [x] `T2` — `committedAt` refused in the future on `sync_proposal` and `mark_synced`; `releasedAt` a bounded datetime (AC-4)
  Files: modules/delivery/server/services.ts, modules/delivery/mcp.ts, modules/delivery/server/push.ts, modules/delivery/tests/repo-sync-096.test.ts
- [x] `T3` — README and suites (AC-5, AC-6)
  Files: modules/delivery/README.md
  Depends: T1, T2

## Verify

**Verdict:** PASS

- AC-1: pass — `repo-sync-096`: a read that leaves a phase out (moved on, no `state.json`) keeps it; a new time replaces
  it with this read; the same time keeps its first read; a future time is unknown; not read at all keeps them. Through
  the real push: the same folder and a rename on the default branch keep their phases; a folder coming back to a
  withdrawn key, or another folder taking it, starts from its read; the self-sync's withdrawal keeps recorded phases.
  Open at the cap: a hand-withdrawn proposal whose folder stays is also started afresh (follow-ups).
- AC-2: pass — a malformed stored entry (bad time, wrong type, unknown phase) hides only itself.
- AC-3: pass — a phase's read is recorded only from `<ref>@<sha>` by the one rule (`sync/sha.ts`: `READ`/`readParts`),
  which withdrawal (`refOf`), the author walk and the history line also use; a stored read is kept as stored.
- AC-4: pass — `sync_proposal` and `mark_synced` refuse a future `committedAt` (`commitTime`, one rule with the push);
  `releasedAt` and phase times go through one normaliser for reader and server (`sync/instant.ts`: ISO 8601 only, no
  offset reads as UTC) and a future one is unknown; push and self-sync rows for each form.
- AC-5: pass — the delivery README says "In Prod" beside the card's release chip, and states 096's rules.
- AC-6: pass — tables per rule; delivery 622/624 (the two host-only failures, `releases.test.ts` paths and
  `create-project-surfaces` timing, predate 096); plugin and CI sync 16/16 (bundle rebuilt); review gate 18/18;
  `tool-schemas` 1/1.

**Other checks:** `specclaw-preset-check`: exit 1 from the repo-wide comment backlog, as before. `specclaw-quality-scan`:
not_run on this host. Linux CI replica and e2e: not run here; PR #113's CI runs them.

**Screenshots:** none taken; the screen change (a reached phase stays in the history) is covered by the push-path table
and the mock section `096-repo-sync-follow-ups`.

### Review loop (2026-11-10)

Scope: commits after `0b9a56f6` (095's verify). Stopped at the five-pass cap (AGENTS.md) with **0 blockers, 1 major
open**, recorded in `follow-ups.md`: a hand-withdrawn proposal whose folder stays is started afresh like a reused key.

| Round | Pass | Since | Result |
|---|---|---|---|
| 1 | round (opus) | — | 0/2/1: releasedAt checked two ways; a third `<ref>@<sha>` rule; push rows |
| 2 | round (opus) | `b07c849c` | 0/1/1: two time normalisers on two hosts; read rule gave two answers |
| 3 | final (opus) | — | 0/2/2: self-sync withdrawal refused; phases inherited across changes; stamps sort; phase-time rule |
| 4 | final (opus) | — | 0/2/2: renames lost phases; no push-path test; README; history line rule |
| 5 | final (opus) | — | 0/1/0: open at the cap (above) |
