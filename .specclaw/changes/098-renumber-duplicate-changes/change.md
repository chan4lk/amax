# Renumber the three duplicate change numbers

**Change:** 098-renumber-duplicate-changes · **Created:** 2026-11-10

## Problem

Three change numbers are each held by two folders: 062 (`062-specclaw-sync-plugin`, `062-marketing-site`, both
archived), 074 (`074-fork-pr-review-gate`, `074-dev-demo-data`) and 075 (`075-amaxerp-url`,
`075-team-time-status-band`). Neither folder of a pair can own the proposal key, so amax has never had AMX-062, AMX-074
or AMX-075: every push skips them and asks for review, which hides real skips among standing ones.

In each pair the newer folder moves to the next free number, and the older one keeps its number:

| From | To | Why this side |
|---|---|---|
| `archive/062-marketing-site` (created 16:15, after the plugin) | `archive/101-marketing-site` | newer; parent of no mock section (the plugin's section is parent of 7) |
| `074-dev-demo-data` (2026-11-02) | `099-dev-demo-data` | newer (`074-fork-pr-review-gate` is 2026-10-28) |
| `075-team-time-status-band` (2026-11-02) | `100-team-time-status-band` | newer (`075-amaxerp-url` is 2026-10-29) |

## Mock Delta

No screen changes. The three moved changes' mock sections take their new ids, so their anchors become
[`099-dev-demo-data`](../../mock/index.html#099-dev-demo-data), [`100-team-time-status-band`](../../mock/index.html#100-team-time-status-band)
and [`101-marketing-site`](../../mock/index.html#101-marketing-site). Both mock copies (`.specclaw/mock/` and
`apps/mock/public/mock/`) stay identical. This change gets no section of its own, because it shows nothing new.

## Acceptance Criteria

1. **AC-1** No two folders under `.specclaw/changes/` or `.specclaw/changes/archive/` share a number. A check in the test
   suite fails if two ever do again.
2. **AC-2** The three folders are renamed as in the table. Each one's heading line, `state.json` `change`, `status.md`
   and mock `data-change`/`id` (and its scoped CSS selectors) use the new name. Their history, phases, tasks and
   verdicts are otherwise unchanged.
3. **AC-3** Every live reference to an old name uses the new one: the R4 review rule (`062-marketing-site`) and
   `.specclaw/STATUS.md`. Records of what already happened keep
   the name they had then: review rounds, gate output in `shots/`, `review-memory/findings.jsonl`, the Problem and task
   text of 078 and 089, test titles named after a change (`"062 AC-3 …"`, `062-ac1-landing.test.ts`), and the sample
   names in `packages/testing/tests/change-numbers.test.ts`. (Amended at plan, 2026-11-10: a search finds the old names
   in those records too, and rewriting them would change the record.) Archived 063's and 064's `Depends on` links keep
   `../062-marketing-site/` (amended at build: those changes are archived records, and any edit to 064 fails the fork
   gate, since it has 16 passes from before the cap). 073's `## Verify` line keeps naming 074-dev-demo-data and
   075-team-time-status-band, because it records what that loop reviewed. (Amended at verify: editing it makes the fork
   gate judge 073, whose reviewed head `5056a50` isn't in this branch since the stack was rebased. The gate skips the
   moves under AC-7, so the cover line isn't needed.)
4. **AC-4** `099-dev-demo-data` and `100-team-time-status-band` still declare `**Review:** covered-by
   073-time-workflow-enhancements`, and `scripts/check-review-gate.mjs` passes for this branch, with the moves skipped
   under AC-7 and 098 judged by its own loop. If the gate can't follow a renamed covered change, this change says so
   under `## Verify` and asks the product owner before going on.
5. **AC-5** A sync preview of the whole repo (`sync_specclaw`, `dryRun: true`) shows AMX-062, AMX-074 and AMX-075 created
   for the older folders, and AMX-099, AMX-100 and AMX-101 for the moved ones. It shows no "two changes numbered" skip,
   and `needsReview` is false unless something else needs a person.
6. **AC-6** `pnpm lint`, `pnpm test` and `pnpm build` pass.
7. **AC-7** On a fork PR, the review gate skips a change folder that the PR only moved to a new name. A move means the
   old folder is gone, the new one has the same slug, and every file matches apart from the change's own name. The
   pairing is one to one: exactly one removed folder and exactly one new folder carry that slug, otherwise each is
   judged (amended at review round 3). The gate
   prints `scope=move skip — moved from <old>`. A folder the PR moved *and* changed in any other way is judged as before.
   (Amended at build, 2026-11-10, product owner: the gate couldn't pass the renames. 101-marketing-site has 20 passes
   from before the cap, and covered-by 073 can't see commits made under the new names.)

## Out of scope

- **The "undefined" skip reason.** The CI pushes at 09:30 and 12:41 UTC on 2026-11-10 (`9613db6`, `25e7d86`) stored
  `AMX-062: undefined` (and the same for 074 and 075) instead of "two changes numbered …". The code at those commits
  and at HEAD builds the text correctly, so it most likely came from the build deployed then. It's recorded in
  `follow-ups.md` for its own change: find the build that was deployed, and add a test that pushes a duplicate pair
  and checks the stored line. Once this change removes the duplicates, the line no longer appears.
- Stopping a new duplicate when a number is picked, beyond the AC-1 check.

## Tasks

- [x] `T1` — Mock: the three moved sections take their new `data-change`/`id` and scoped selectors; both copies stay identical (AC-2, Mock Delta)
  Files: .specclaw/mock/index.html, apps/mock/public/mock/index.html
- [x] `T2` — Rename the three folders (`archive/062-marketing-site` → `archive/101-marketing-site`, `074-dev-demo-data` → `099-dev-demo-data`, `075-team-time-status-band` → `100-team-time-status-band`); heading line, `state.json` `change` and `status.md` use the new names; `covered-by 073` kept (AC-2, AC-4)
  Files: .specclaw/changes/archive/101-marketing-site/, .specclaw/changes/099-dev-demo-data/, .specclaw/changes/100-team-time-status-band/
  Depends: T1
- [x] `T3` — Live references: R4 rule, `STATUS.md` via `specclaw-update-status` (AC-3)
  Files: .specclaw/review/rules/R4-marketing-time-claims.md, .specclaw/STATUS.md
  Depends: T2
- [x] `T4` — A test that fails when two folders under `.specclaw/changes/` or `archive/` share a number, run against the working tree (AC-1)
  Files: packages/testing/tests/change-numbers.test.ts
  Depends: T2
- [x] `T6` — The review gate skips a pure move: `movedFrom` compares the old folder at the merge base with the new one at the head, with both names neutralised; `gate()` prints the move line instead of judging it (AC-7)
  Files: scripts/review-gate/moves.mjs, scripts/review-gate/rules.mjs, scripts/check-review-gate.mjs, packages/testing/tests/review-gate-moves.test.ts
  Depends: T4
- [x] `T5` — Integration: `check-change-numbers.mjs` and `check-review-gate.mjs` for this branch; `pnpm lint`, `pnpm test`, `pnpm build`; a full-repo `sync_specclaw` dry run showing AMX-062/074/075 and AMX-099/100/101 created with no duplicate skips (AC-4, AC-5, AC-6)
  Files: (no source files; results go under `## Verify`)
  Depends: T3, T4, T6

## Verify

**Verdict:** PASS. The review is clean at pass 5 of 5 (final pass at `38b4582`). The pass-4 major is recorded below as a
known limit.

- AC-1: pass. `packages/testing/tests/change-numbers.test.ts` "098 … AC-1" passes on the tree, and it fails with a
  temporary `099-probe-duplicate` folder (tried, then removed). `read-specclaw` finds no shared number across all 101
  records.
- AC-2: pass. The three folders were moved (git sees renames R084–R100). Each one's `change.md` heading, `state.json`
  `change` and `status.md` use the new name, and the mock `data-change`/`id` and scoped selectors were renamed in both
  identical mock copies. The mock banner comments read 099/100/101.
- AC-3: pass. The R4 rule and `STATUS.md` use the new names. The records listed in AC-3 keep the old ones.
- AC-4: pass. 099 and 100 still declare `covered-by 073-time-workflow-enhancements`.
  `node scripts/check-review-gate.mjs --base ae0f5eb --head HEAD --fork true` prints `scope=move skip` for 099, 100
  and 101, and judges 098 by its own loop (its final round 4 has 0 blockers).
- AC-5: pass, scoped to this branch. The `sync_specclaw` dry run at `25f9d7e` (ref `specclaw/098-…`) returned 0 skipped
  and `needsReview: false`, with 098 updated and 6 records ignored as not this branch's. amax creates AMX-062, 074,
  075, 099, 100 and 101 only on the default branch's push after merge, which isn't visible from this branch.
- AC-6: pass, with Windows host limits. `pnpm lint` 35/35, `pnpm build` 2/2. `pnpm turbo run test --continue`: 33/35
  packages pass. The two failures are Windows-only and in files 098 doesn't touch: `@amax/core` `ac5-adapters`
  (backslash paths) and `@amax/testing` `ac7-config` (symlink EPERM). DB suites were skipped (no `DATABASE_URL`).
  The 098 suites pass: 42 tests in `review-gate*` and `change-numbers`.
- AC-7: pass. `review-gate-moves.test.ts` has a 9-row table: only moved, an archived folder moved, moved and edited, a
  new file, another slug, two new numbers, two removed folders, archived while a copy appeared, and beside a code
  change. Each new guard was checked to fail its row with the guard removed.
- Quality: `specclaw-quality-scan --gate` passes on `scripts/review-gate` and `packages/testing/tests` (lizard and
  jscpd ran: 0 duplicated lines, 0 high functions). Over all of `scripts/`, jq hits Windows' "Argument list too long",
  so lizard was run alone on `scripts/check-review-gate.mjs`, with no warnings. `specclaw-preset-check`: 098 adds no
  violations (the repo's existing code comments make the whole-repo check fail).
- `node scripts/check-change-numbers.mjs --base ae0f5eb --head HEAD`: ok.

**Review loop (specclaw-review, opus/opus, base scoped to `ae0f5eb0` for the run, then restored):**

- Round 1 (1 blocker): a moved folder still counted as a change, so a fork PR could rename one folder and carry code
  with no change judged. Fixed: moves are set aside before owners, judging and the no-change guard.
- Round 2: clean; its design pass raised a major (two new folders could claim one removed folder). Fixed: one-to-one
  pairing.
- Round 3 (1 major): the "exactly one removed folder" guard had no test. Fixed with two more rows; one slug helper;
  AC-7 states the pairing.
- Round 4 (final, `e1ed67d`): 0 blockers, 1 major, 2 minors. `specclaw-review verdict`: "OPEN — 4 rounds, final pass
  missing, models opus/opus; last round 0/1/2 b/M/m".
- **Known limit, recorded at pass 4 (product owner, 2026-11-10).** 099 and 100 still declare `covered-by 073`, while 073's
  `## Verify` names them by their old names, so a later fork PR that touches 099 or 100 can't pass through 073. This
  was already true before 098, because 073's reviewed head `5056a50` isn't in this branch since the stack rebase (the
  gate reported "not in this PR" at verify). Any later fork PR that edits 099 or 100 needs its own review loop and
  must drop `covered-by`. This is recorded in `follow-ups.md`.
- Minors from pass 4: the mock banner comments are fixed. The marketing tests titled `062 AC…` are kept as records
  (AC-3). The shared change-folder pattern and listing is in `follow-ups.md`.
- Round 5 (final, `38b4582`): clean, 0 blockers, 0 majors, 1 minor plus 1 pre-existing (both already in
  `follow-ups.md`). `specclaw-review verdict`: "CLEAN — 5 rounds, final pass 38b4582f5a, models opus/opus; last round
  0/0/1 b/M/m". It ran because PR #115's review-gate failed: the banner fix in `338348e` touched
  `apps/mock/public/mock/index.html` after the pass-4 final, so covered-by changes 082–086 and 092 (in #115 through the
  stack) found a commit that no loop in the PR had reviewed. A final pass at HEAD credits it to 098's loop.
