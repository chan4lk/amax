# Dev starts fresh: no stale Turbopack cache, no refresh loop

**Change:** 082-dev-fresh-cache · **Created:** 2026-11-03 · **Review:** covered-by 081-proposals-end-to-end

## Problem

On Windows, `pnpm --filter @amax/web dev` with a leftover `apps/web/.next` serves the app, but the browser keeps
reloading in step with the 10 s jobs tick, so people delete `.next` before every start. A cache built on the same
commit doesn't loop (headless check, 90 s, one load), so the trigger is Turbopack's persistent dev cache
(`turbopackFileSystemCacheForDev`, on by default in Next 16.4) going stale across branch switches. Every tick compiles
`/api/jobs/tick` and sends an HMR `built` message, and with a stale cache that becomes a full reload.

## Mock Delta

What changes on screen, and where to see it: [`082-dev-fresh-cache`](../../mock/index.html#082-dev-fresh-cache)

No screen changes. The section records that dev no longer needs `.next` deleted by hand.

## Acceptance Criteria

1. **AC-1** `apps/web/next.config.ts` sets `experimental.turbopackFileSystemCacheForDev: false`, with a one-line
   comment saying why. Production builds (`turbopackFileSystemCacheForBuild`) and every other setting are unchanged.
2. **AC-2** Starting dev twice in a row without deleting `.next`, then signing in as Maya and leaving `/time` open for
   90 s, gives exactly one page load each time (headless count). After the second start, `.next/dev/cache` has no
   Turbopack store from the first start.
3. **AC-3** The README's "Run locally" section says, in one sentence, that dev compiles fresh on each start, so
   `.next` never needs deleting.
4. **AC-4** `pnpm --filter @amax/web build` and `pnpm lint` pass.

## Tasks

Built on `specclaw/081-proposals-end-to-end` at the product owner's request (2026-11-03), not on a branch of its own.

- [x] `T1` — Dev compiles fresh: turn off Turbopack's persistent dev cache, say so in the README (AC-1..AC-4)
  Files: apps/web/next.config.ts, README.md

## Verify

**Verdict:** PASS (2026-11-03, Windows, working tree on `specclaw/081-proposals-end-to-end` at `ab777f36`)

- AC-1: pass — `apps/web/next.config.ts` adds `turbopackFileSystemCacheForDev: false` beside `externalDir`, with the
  reason. Nothing else changed. The option is in Next 16.4.2's `config-shared.d.ts`.
- AC-2: pass — two dev starts in a row, `.next` kept (it held a 12:57 Turbopack store from the old config). Each
  time, a headless Chromium signed in as Maya, opened `/time` and stayed 90 s: `loads=2` (`/signin`, then `/time`),
  no reloads across 9 jobs ticks (HMR `built`, hash `0`). `.next/dev/cache/turbopack` kept its 12:57 timestamp, so
  neither start wrote a store.
- AC-3: pass — README "Run locally" says dev compiles fresh on each start and `.next` never needs deleting.
- AC-4: pass — `pnpm --filter @amax/web build` finished with the route table; `pnpm lint` 35/35 tasks, graph check ok.
- Not reproduced: the loop itself. A cache built on the same commit didn't loop before the change either (90 s, one
  load), and switching branches to build a stale cache wasn't possible here. The fix removes the cache that can go
  stale, whatever made it stale. Confirm by switching branches once and running dev without deleting `.next`.
- Quality: not_run (a two-line config change and one README sentence). Review loop: not run yet.

**Review (2026-11-07):** covered by 081-proposals-end-to-end's loop over the whole stack against `upstream/main`. Its final
pass (round 6) ran at `0bbdd63c`, after this change's commits, with 0 blockers. It stopped at the five-pass cap with two
081 majors open; none is in this change's files. See 081's `## Verify`. **Linux replica of CI** over `0bbdd63c`: every
step passes (35/35 packages, e2e 9, e2e:auth 95).
