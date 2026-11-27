# Next.js security upgrade: move off 16.4.2, which has a known vulnerability

**Change:** 142-next-security-upgrade · **Created:** 2026-11-17 · **Review:** change

Size waiver: the change itself is a version bump, 27+/26− lines outside the lockfile (one `next` line in each of 25
package.json files, plus `next.config.ts`); the 16,616 lines counted are the whole 081–119 stack measured against a stale
local `origin/main` (PR #98). Granted by the product owner, 2026-11-20.

## Problem

`next dev` reports that Next.js 16.4.2 is affected by a known security vulnerability and recommends upgrading. Since
2026-11-17 it also stops at start until the upgrade is done. Asked by the product owner (2026-11-17): run
`next upgrade --agent=security` and follow its instructions.

## Mock Delta

What changes on screen, and where to see it: [`142-next-security-upgrade`](../../mock/index.html#142-next-security-upgrade)

No screen change: only the framework version.

## Acceptance Criteria

1. **AC-1** Next.js is upgraded to the version `next upgrade --agent=security` selects, with the other changes it asks
   for, in this checkout (no worktree or branch is made; the Git steps are the product owner's).
2. **AC-2** `pnpm install` is clean and the lockfile matches; `turbo lint` (typecheck) for web passes; the web test
   suite passes; and `next dev` starts and serves `/signin`.

## Tasks

- [x] `T1` — Run the security upgrade and follow its instructions (AC-1)
  Files: apps/web/package.json, pnpm-lock.yaml
- [x] `T2` — Install, typecheck, test and start the app (AC-2)

## Verify

**Verdict:** PASS. Both ACs pass. The repo-wide preset and quality gates fail on code this change does not touch;
the product owner had them recorded as pre-existing (2026-11-20, below).

- AC-1: pass. Next.js is 16.4.6 in `apps/web`, `apps/mock` and all 23 modules' package.json; `pnpm-lock.yaml` has 12
  `next@16.4.6` entries and no `next@16.4.2`; `apps/web` resolves `next/package.json` to 16.4.6. The upgrade's config
  line (`experimental.agentUpgrade: "security"`) is in `next.config.ts`. No worktree or branch was made.
- AC-2: pass.
  - `pnpm install --frozen-lockfile`: exit 0.
  - `pnpm turbo run lint --filter=@amax/web` (registry + `tsc --noEmit`): exit 0.
  - `pnpm turbo run test --filter=@amax/web`: 349 passed, 45 skipped, 3 failed, every failure a 30 s timeout on the
    first test of a file that loads the whole registry (`agents-tools`, `baseurl`, `pin-refs`), under load. Those
    three files alone (`vitest run --config ../../vitest.config.ts --dir .`): 9/9 passed, exit 0.
  - `next dev`: Next.js 16.4.6 ready in 4.6 s (port 3120) and 1.4 s (`pnpm --filter @amax/web dev`, port 3000), with
    no security-upgrade notice. `/signin` 200 (it was 500 only while Postgres on 5440 was down).
  - Signed in through the fixtures-only demo form as `umar@lumenlabs.test` and `chandima@lumenlabs.test` against the
    dev database (`amax-dev-postgres`, `pnpm db:migrate`: up to date): both land on `/`, Delivery overview, Admin.
- Size: `specclaw-verify size`: 16,616 production lines against `origin/main @ b257a6d57e`, over the 400-line cap,
  with the waiver above; exit 0. The change's own diff is 27+/26− outside the lockfile.
- Preset check (`specclaw-preset-check .`): exit 1, 4,675 `comment`-rule hits across the repo (its change-numbered
  comments). This change adds one: the `// 120:` line in `next.config.ts`, also the review's minor. Pre-existing,
  recorded by the product owner's decision.
- Quality (`specclaw-quality-scan . --gate`, lizard 1.25.1 + jscpd): exit 1, 17 `high` functions (for example
  `ConfirmCard` in `apps/web/components/chat/ConfirmCard.tsx`, `updateCard` in
  `modules/delivery/server/proposal-card.ts`, `seedOpportunity` in `modules/presales/fixtures/index.ts`); none in
  this change's files (package.json and `next.config.ts` only). Pre-existing, recorded by the product owner's decision.
- Review: CLEAN — 2 rounds, final pass cd2c342e25, models opus/opus; last round 0/0/1 b/M/m. Scoped with
  `base_branch` set to `5f9ce880` (119's head) for the run, 27 files, then restored. The minor is in `follow-ups.md`:
  `agentUpgrade: "security"` is Next.js's default and sets the agent-nudge policy, so the comment saying it records
  this upgrade is wrong.
- Screenshots: `shots/app.png` (`/signin`), `shots/mock.png` (`#120-next-security-upgrade`, no screen change),
  `shots/signin-umar.png`, `shots/signin-chandima.png`.
