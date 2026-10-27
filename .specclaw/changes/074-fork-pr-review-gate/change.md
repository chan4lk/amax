# Fork PRs must carry a specclaw-review loop

**Change:** 074-fork-pr-review-gate · **Created:** 2026-10-27 · **Review:** change

## Problem

The specclaw-review loop is a convention only: run once at the end of each module (`.specclaw/config.yaml` `review:`). CI checks nothing, so a PR from a fork can merge without any review. CI also can't tell a single change (proposal level) from the end of a module, so it can't apply the right rule.

## Mock Delta

What changes on screen, and where to see it: [`074-fork-pr-review-gate`](../../mock/index.html#074-fork-pr-review-gate)

There is no app screen. The mock shows the new `review-gate` CI check output for three PRs: a fork PR that passes, two fork PRs that fail with the reason (missing review, no proposal), and a same-repo PR that skips because it's a single change.

## Acceptance Criteria

1. **AC-1** `change.md` can declare its review scope in the header: `**Review:** change` or `**Review:** module-end`. A missing line means `change`. AGENTS.md and `.specclaw/context.md` document it (the lean template lives in the plugin, outside this repo), and a module-end review is run with `--since`, so its rounds record a non-null `since`.
2. **AC-2** `scripts/check-review-gate.mjs` takes the base and head refs, finds every `.specclaw/changes/<NNN>-*/` (active or archive) touched by the PR diff, and prints one line per change: `pass`, `fail — <reason>` or `skip — <reason>`. It exits non-zero on any fail. Unit tests cover each rule below.
3. **AC-3** When the PR comes from a fork, each touched change needs review evidence in `review/round-N.json`:
   - a round with `final: true` that ran (status `clean`, `open` or `escalate`; not `not_run` or `skipped`);
   - no `blocker` in its counts, unless `## Verify

**Verdict:** PASS

- AC-1: pass — AGENTS.md ("Review scope") and `.specclaw/context.md` (Constraints) document `**Review:** change | module-end`; `reviewScope()` treats a missing line as `change`; this change's header declares `change`.
- AC-2: pass — `scripts/check-review-gate.mjs` prints one line per touched change and exits 1 on a fail (`packages/testing/tests/review-gate.test.ts` AC2); real output on this branch in `shots/gate-output.txt`.
- AC-3: pass — fork PR fails on no final round, an open blocker with no stop under ## Verify, a reviewed head outside the PR, and more than five passes; passes with a clean final round (test AC2/AC3). AC-3 was corrected during build: round files record `clean|open|escalate|not_run|skipped` (never "ran"), and final passes carry no `since`.
- AC-4: pass — fork PR changing `modules/**` with no change dir fails "propose first"; the same diff from the same repo passes (test AC4).
- AC-5: pass — same-repo `change` scope skips; `module-end` with no `--since` round fails (test AC5).
- AC-6: pass — `review-gate` job in `.github/workflows/ci.yml`: `if: github.event_name == 'pull_request'`, `fetch-depth: 0`, `persist-credentials: false`, no secrets, shas and fork flag via env (`head.repo.full_name != github.repository`). YAML parses; CI run confirms on the PR.

Commands (`DATABASE_MIGRATE_URL` on local test Postgres :5440), all exit 0:
- `pnpm db:migrate`; `pnpm turbo run lint --force`; `node scripts/check-graph.mjs`
- `pnpm turbo run test --force --concurrency=2` (35/35 tasks); `node scripts/check-module-standard.mjs`; `pnpm build`
- `pnpm --filter @amax/web e2e` (8 passed); `pnpm --filter @amax/web e2e:auth` (82 passed)

Notes:
- `specclaw-preset-check .`: exit 1 from the repo-wide backlog (2467 hits); none in 074 files.
- Quality: `specclaw-quality-scan` not_run (jq "Argument list too long", as in 066–069).
- Screenshots: no app UI. `shots/mock.png`; CLI output `shots/gate-output.txt`.
- specclaw-review: not run per change (operator rule: review once per module end). This is a same-repo `change`-scope PR, so its own gate skips it.
