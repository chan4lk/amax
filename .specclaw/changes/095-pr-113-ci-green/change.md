# PR #113's CI goes green: plain tool schemas, the board's Released card as mocked, an exact e2e link, and the review gate follows covered-by

**Change:** 095-pr-113-ci-green · **Created:** 2026-11-10 · **Review:** change

**Depends on:** 094-sync-repo-dates-and-owner-parser (same branch, PR #113).

## Problem

PR #113's CI has been red since 091. `checks` fails its unit tests on 094's zod transforms inside MCP tool inputs
("Transforms cannot be represented in JSON Schema"), and its e2e on two delivery specs: the Contoso board's Released
card reads "In Prod · v2.3.0" beside its own `v2.3.0` chip, wraps and is 32 px taller than the mock; and the proposals
spec clicks `link "Released"`, which AMX-091's synced title now also matches. `review-gate` (fork PR) fails 082–086:
commit `806f4c6` names 092, which is `covered-by 093`, and the gate doesn't credit a commit naming a covered change to
its cover's loop, though that loop reviewed it. `docker-k3s` failed on a k3d image import (passed at `8e6a698`).

## Mock Delta

What changes on screen, and where to see it: [`095-pr-113-ci-green`](../../mock/index.html#095-pr-113-ci-green)

The board's Released card says "In Prod" next to its release chip, as `001-amax-foundation-project`'s board already
shows (no new design; the app goes back to the mock).

## Acceptance Criteria

1. **AC-1** Every MCP tool's input schema converts to JSON Schema (`tool-schemas.test.ts` green): the repo dates in
   `sync_proposal`, `sync_specclaw` and `TaskInput` are plain optional datetimes, and the bound on future dates (094) is
   applied where they're written, so a future date still reads as unknown on every path.
2. **AC-2** A Released card on a project board says "In Prod" when a live Prod deployment released it (its release is
   the chip beside it), "Released · from repo" or "Released" otherwise; the Contoso board e2e matches the mock again.
3. **AC-3** The proposals e2e opens the Released tab by its exact name ("Released, all time"), whatever proposal titles say.
4. **AC-4** The review gate credits a commit that names a `covered-by` change to that change's cover: it counts as reviewed
   when the cover's final pass came after it. Table test: the named change covered by the judged change's cover (pass), by
   another cover whose final pass came after (pass) or before (fail), and a covered change naming itself with no cover
   loop after (fail).
5. **AC-5** PR #113's CI: `checks`, `review-gate` and `docker-k3s` green (`docker-k3s` by a rerun if it flakes again).

## Tasks

- [x] `T1` — Tool inputs carry plain repo datetimes; the future-date bound applies where they're written (AC-1)
  Files: modules/delivery/server/repo-time.ts, modules/delivery/server/services.ts, modules/delivery/server/tasks.ts, modules/delivery/server/push.ts, modules/delivery/mcp.ts, modules/delivery/tests/ci-095.test.ts
- [x] `T2` — The board's Released card says "In Prod" beside its release chip (AC-2)
  Files: modules/delivery/ui/released.ts, modules/delivery/tests/board-092.test.ts
- [x] `T3` — The proposals e2e opens "Released, all time" by its exact name (AC-3)
  Files: apps/web/tests/e2e/delivery.spec.ts
- [x] `T4` — The review gate credits a commit naming a covered-by change to its cover's final pass (AC-4)
  Files: scripts/review-gate/rules.mjs, packages/testing/tests/review-gate-covered.test.ts
- [x] `T5` — PR #113's CI green (AC-5)
  Depends: T1–T4

## Verify

**Verdict:** PASS

- AC-1: pass — chat works again: on the dev server a turn reached Anthropic, called `list_proposals` and answered ("AMX
  has 26 proposals in Verified", 5.4 s, no `AiOutputError`). `apps/web/tests/tool-schemas.test.ts` (chat's converter over
  every module's tools) passes; `ci-095`: `knownTime` table and `sync_proposal`'s write keeping stored dates over future
  ones (created, task, both; past dates taken as the control).
- AC-2: pass — `board-092`: the Released card renders `v2.3.0` then "In Prod"; on the dev server the Contoso card is
  111.5625 px tall, the mock's height.
- AC-3: pass — the proposals e2e clicks `link "Released, all time"` exactly (CI runs the e2e).
- AC-4: pass — `review-gate-covered`: a later commit naming a covered-by change passes when its cover's final pass came
  after it and fails when before; the fork gate over PR #113 (`--base 0dc978b6 --fork true`) passes 082–086 and 094.
  AGENTS.md states the rule.
- AC-5: pending CI on push (`checks`, `review-gate`; `docker-k3s` failed on a k3d image import and passed at `8e6a698`,
  so a rerun if it flakes).

**Commands (Windows host, dev Postgres):** delivery `tsc --noEmit`: exit 0; delivery `vitest`: 593/594, the one failure the
host-only `releases.test.ts` (backslash paths); review-gate, 094, board and 095 suites 70/70; `tool-schemas` 1/1.
`specclaw-preset-check`: exit 1 from the repo-wide comment backlog, as before. `specclaw-quality-scan`: not_run on this host.

**Screenshots:** the Contoso card measured against the mock section `001-amax-foundation-project` (same height and
labels); the 095 mock section shows the same card.

### Review loop (2026-11-10)

Scope: commits after `25e7d86f` (094's verify). **Clean**: `Review: CLEAN — 3 rounds, final pass 191af34533`.

| Round | Pass | Since | Result |
|---|---|---|---|
| 1 | round (opus) | — | 0/1/4: no test drove sync_proposal's write with future dates; mock card and banner; AGENTS.md; one "converts" |
| 2 | round (opus) | `7d87d939` | clean; 1 pre-existing major (future `committedAt`/`releasedAt` on sync_proposal) to follow-ups |
| 3 | final (opus) | — | clean; 1 pre-existing minor (README line) to follow-ups |
