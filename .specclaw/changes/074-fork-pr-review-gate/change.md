# Fork PRs must carry a specclaw-review loop

**Change:** 074-fork-pr-review-gate · **Created:** 2026-10-27 · **Review:** change

## Problem

The specclaw-review loop is a convention only: run once at the end of each module (`.specclaw/config.yaml` `review:`). CI checks nothing, so a PR from a fork can merge without any review. CI also can't tell a single change (proposal level) from the end of a module, so it can't apply the right rule.

## Mock Delta

What changes on screen, and where to see it: [`074-fork-pr-review-gate`](../../mock/index.html#074-fork-pr-review-gate)

There is no app screen. The mock shows the new `review-gate` CI check output for three PRs: a fork PR that passes, a fork PR that fails with the reason, and a same-repo PR that skips because it's a single change.

## Acceptance Criteria

1. **AC-1** `change.md` can declare its review scope in the header: `**Review:** change` or `**Review:** module-end`. A missing line means `change`. AGENTS.md and `.specclaw/context.md` document it (the lean template lives in the plugin, outside this repo), and a module-end review is run with `--since`, so its rounds record a non-null `since`.
2. **AC-2** `scripts/check-review-gate.mjs` takes the base and head refs, finds every `.specclaw/changes/<NNN>-*/` (active or archive) touched by the PR diff, and prints one line per change: `pass`, `fail — <reason>` or `skip — <reason>`. It exits non-zero on any fail. Unit tests cover each rule below.
3. **AC-3** When the PR comes from a fork, each touched change needs review evidence in `review/round-N.json`:
   - a round with `final: true` that ran (status `clean`, `open` or `escalate`; not `not_run` or `skipped`);
   - no `blocker` in its counts, unless `## Verify` records the stop and the open blocker;
   - its `head` is an ancestor of the PR head;
   - no more than five counted passes (rounds that were `not_run` don't count).

   A module-end change also needs a counted round with a non-null `since` (final passes don't record `since`).
4. **AC-4** A fork PR that changes files outside `.specclaw/` but touches no change directory fails with "no specclaw change: propose first". A fork PR that only bumps dependencies (only `package.json`/lockfiles, e.g. Dependabot) is out of scope: Dependabot runs from the same repo, so it never reaches this rule.
5. **AC-5** Same-repo PRs keep the module cadence: changes declared `change` skip with "single change, review runs at module end"; changes declared `module-end` get the same checks as AC-3.
6. **AC-6** `.github/workflows/ci.yml` has a `review-gate` job on `pull_request`: checkout with full history, pass `github.event.pull_request.head.repo.full_name != github.repository` as the fork flag, and run the script with a read-only token and no secrets. Pushes to `main` don't run it.

## Tasks

- [x] `T1` — Document the `**Review:** change | module-end` header and the fork rule (AC-1)
  Files: AGENTS.md, .specclaw/context.md
- [x] `T2` — `check-review-gate.mjs`: pure rule core plus git-backed CLI; scope parse, evidence checks, fork and same-repo rules, no-proposal fail (AC-2, AC-3, AC-4, AC-5)
  Files: scripts/check-review-gate.mjs
- [ ] `T3` — Tests for every gate rule, using fixture change dirs (AC-2, AC-3, AC-4, AC-5)
  Files: packages/testing/tests/review-gate.test.ts
  Depends: T2
- [ ] `T4` — `review-gate` job in CI on pull_request, full history, fork flag, read-only (AC-6)
  Files: .github/workflows/ci.yml
  Depends: T2

## Verify
