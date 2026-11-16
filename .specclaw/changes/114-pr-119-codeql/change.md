# PR #119's CodeQL alerts: the mock escapes what it puts in HTML, logs stay one line, the fake GitHub stays local

**Change:** 114-pr-119-codeql · **Created:** 2026-11-16 · **Review:** change

## Problem

PR #119 passes every CI job but CodeQL, which reports 19 new alerts: 4 high in the clickable mock's script (text put back
into HTML unescaped, and two regular expressions whose anchor covers only one alternative), 2 medium (a log line that can
carry a caller's newline, and the e2e fake GitHub redirecting to a URL from its query), 3 warnings (a test passing an
argument its step ignores) and 10 notes (unused imports and variables, a missing semicolon). Asked by the product owner
(2026-11-16): fix them all.

## Mock Delta

What changes on screen, and where to see it: [`114-pr-119-codeql`](../../mock/index.html#114-pr-119-codeql)

No screen change: the mock looks the same; its script escapes what it inserts.

## Acceptance Criteria

1. **AC-1** The mock's script escapes every text it puts into HTML with one shared escaper, `window.amaxEsc` (the nav
   and its phone sheet, the charts' legends and hidden tables, the added deal card, the licence list, empty states and
   chat) and
   its amount parser anchors both alternatives (`/^(k|thousand)/`, `/^(m|million)/`); the deployed copy
   (`apps/mock/public/mock/index.html`) matches the spec mock.
2. **AC-2** `logError` writes one line whatever its scope or the error's code holds: only letters, digits and `.:_-`.
3. **AC-3** The e2e fake GitHub redirects only to a `http://localhost:` callback.
4. **AC-4** The warnings and notes are gone: the review-gate test's steps take the argument they are given, and the
   unused imports and variables are removed, except `SHA_RE` in the generated `plugins/amax/scripts/read-specclaw.mjs`,
   which esbuild keeps from `modules/delivery/sync/sha.ts` where it is used.

## Tasks

- [x] `T1` — The mock escapes and anchors; its deployed copy refreshed (AC-1)
  Files: .specclaw/mock/index.html, apps/mock/public/mock/index.html
- [x] `T2` — One-line logs, a local-only fake GitHub, and the warnings and notes (AC-2, AC-3, AC-4)
  Files: packages/core/src/log.ts, apps/web/tests/e2e/git-accounts.spec.ts, packages/testing/tests/review-gate-covered.test.ts,
  modules/time/server/my.ts, modules/delivery/ui/ReleasesPage.tsx, modules/delivery/tests/sync-import.test.ts,
  modules/delivery/tests/mcp-registry.test.ts, modules/delivery/tests/delivery.test.ts, modules/delivery/tests/chat.test.ts

## Verify

**Verdict:** PASS

- AC-1: pass — every innerHTML sink in the mock that takes data goes through `window.amaxEsc`, defined at the top of
  the script (nav, phone sheet, legends, hidden tables, deal card, licence list, empty states, chat; chat's own weaker
  escaper removed). Both regexes are anchored as groups. `apps/mock/public/mock/index.html` is byte-identical to the
  spec mock (`cmp`). The mock loads in Chromium with no page errors; its phone sheet lists 26 screens and its 24 hidden
  chart tables render (scratch Playwright check).
- AC-2: pass — `packages/core/tests/log.test.ts`, 8/8: a newline in the scope, the code or the error's name, or in a
  thrown non-Error's code, still logs one line.
- AC-3: pass — the fake authorize page answers 400 unless `redirect_uri` is `http://localhost…`
  (`apps/web/tests/e2e/git-accounts.spec.ts`).
- AC-4: pass — unused imports and variables removed. `packages/testing/tests/review-gate-covered.test.ts` passes 18/18.
  Its steps keep `(_h)` against review minor B11, because CodeQL flags the superfluous argument without it.
- Commands: `npx turbo run lint` for core, web, testing, delivery and time (tsc: 5/5 successful); the vitest runs above.
- Review: CLEAN — 2 rounds, final pass 80b268ed49, models opus/opus; last round 0/0/0 b/M/m
- Screenshots: none. No screen changes; the mock check above is the evidence.
