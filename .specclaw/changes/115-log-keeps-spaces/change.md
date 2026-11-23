# Server logs keep their spaces: only control characters are replaced

**Change:** 115-log-keeps-spaces · **Created:** 2026-11-16 · **Review:** change

## Problem

114 made `logError` write one line by turning every character but letters, digits and `.:_-` into `_`. That also turns
spaces into `_`, so `amax ai.tool read_ticket: …` became `amax ai.tool_read_ticket: …` and a provider's
`400 invalid_request_error` became `400_invalid_request_error`. Three `@amax/ai` gateway tests fail on PR #119.

## Mock Delta

What changes on screen, and where to see it: [`115-log-keeps-spaces`](../../mock/index.html#115-log-keeps-spaces)

No screen change: only server log lines.

## Acceptance Criteria

1. **AC-1** `logError` replaces only control characters (CR, LF and the other C0 codes, DEL, and the Unicode line and
   paragraph separators) in the scope, the error's name and its code, so a log line stays one line and keeps its spaces:
   `amax ai.tool read_ticket: Error [<id>]`, `amax chat: AiOutputError 400 invalid_request_error [<id>]`.
2. **AC-2** `packages/ai` `tests/gateway.test.ts` and `packages/core` `tests/log.test.ts` pass, the latter with a row
   for each replaced kind (CR/LF, a tab, U+2028).

## Tasks

- [x] `T1` — `logError` replaces only control characters; log tests for each kind (AC-1, AC-2)
  Files: packages/core/src/log.ts, packages/core/tests/log.test.ts

## Verify

**Verdict:** PASS

- AC-1: pass — `oneLine` replaces `[\n\r\p{Zl}\p{Zp}\x00-\x1f\x7f-\x9f]`: C0 controls (CR and LF included), DEL, C1
  controls (NEL included) and U+2028/U+2029. Spaces stay: `amax ai.tool read_ticket: Error [<id>]` and
  `amax chat: Error 400 invalid_request_error [<id>]` (log test rows).
- AC-2: pass — `packages/core` `tests/log.test.ts` passes 17/17, with rows for CR/LF, a tab, U+2028, U+2029, DEL, NEL
  and a control character in the error's name. `@amax/ai` passes 82/82 against Postgres, including the three gateway
  tests that failed on PR #119. `packages/core` `tsc --noEmit` exits 0.
- Review: CLEAN — 3 rounds, final pass ab83e93c25, models opus/opus; last round 0/0/1 b/M/m; fix proof not proven: no
  review.test_command configured. The minor (Unicode format characters such as bidi overrides) is in `follow-ups.md`.
- Screenshots: none. Only server log lines change.
