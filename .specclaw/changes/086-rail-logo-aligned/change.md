# The rail's logo sits on the icons' centre line, at full size

**Change:** 086-rail-logo-aligned · **Created:** 2026-11-07 · **Review:** covered-by 081-proposals-end-to-end

## Problem

The amax logo at the top of the left rail is misaligned (found by the product owner, 2026-11-07). The rail's icon rule,
`.rail svg{width:22px;height:22px;stroke:currentColor;…}` (`packages/ui/src/styles/shell.css`), also matches the logo,
which is an `svg.logo`. The logo is drawn for 44 px with a 26 px left margin, so its centre falls on the icons' centre
line (48 px across the 96 px rail). At 22 px, its centre sits 11 px left of that line, it's half size, and it picks up
the icons' outline stroke. The mock copies the same rule, so it shows the same bug.

## Mock Delta

What changes on screen, and where to see it: [`086-rail-logo-aligned`](../../mock/index.html#086-rail-logo-aligned)

- **Every screen's rail:** the logo is 44 px, centred over the nav icons, with no outline. The mock's shell CSS gets the
  same `.rail .logo` rule as the app.
- **The section** shows the top of the rail before and after, with the centre line drawn through the icons.

## Acceptance Criteria

1. **AC-1** The rail's logo renders at 44 × 44 px, and its horizontal centre is within 1 px of the nav icons' centre
   (48 px from the rail's left edge) at desktop width.
2. **AC-2** The logo has no outline: its rounded square shows only its gradient fill, as `Logo.tsx` draws it.
3. **AC-3** The nav icons, the expanded rail on hover, and the phone layout (where the logo is hidden) are unchanged.
4. **AC-4** The mock's rail shows the same: its CSS carries the same rule, in both copies (`.specclaw/mock/index.html`,
   `apps/mock/public/mock/index.html`).

**Affected:** `packages/ui/src/styles/shell.css`; the mock's shell CSS and a new `086-rail-logo-aligned` section, in both
copies. No data, tool or permission change.

## Tasks

- [x] `T1` — The rail's logo at 44 px on the icons' centre line, no outline; the mock's CSS and section match (AC-1 to AC-4)
  Files: packages/ui/src/styles/shell.css, .specclaw/mock/index.html, apps/mock/public/mock/index.html, apps/web/tests/e2e/shell.spec.ts
- [x] `T2` — Check it on the running app: the logo's size and centre against an icon's at 1440 px, the hover rail, the phone layout (AC-1 to AC-3)
  Files: .specclaw/changes/086-rail-logo-aligned/change.md
  Depends: T1

## Verify

**Verdict:** PASS

Run 2026-11-07 on Linux: the Docker replica of CI's `checks` job (node:24-bookworm, fresh postgres:16-alpine with the
`amax_app` role), over `git archive` of HEAD `6089b5b6`, which holds 081 to 086.

- AC-1: pass. `shell.spec.ts` "086 AC1" passed in the replica's `e2e` run. Measured on that build at 1440 px: the logo is
  44 × 44, its centre is at 72 px, and the first nav icon's centre is at 72 px.
- AC-2: pass. The logo's computed `stroke` is `none` on that build; `shots/app.png` shows the gradient square only.
- AC-3: pass. `shell.spec.ts` AC5 (the app's rail against the mock's) passed. The hover rail and the 390 px layout were
  checked on the dev app at build time (below); 086 changes one rule on `.rail .logo` only.
- AC-4: pass. The `.rail .logo` rule is in both mock copies; `shots/mock.png` is the section, before and after.

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile`, `pnpm db:migrate` | exit 0 |
| `pnpm lint` (35 type checks + graph check) | exit 0 |
| `pnpm turbo run test --concurrency=2` | exit 0, 35/35 packages |
| `node scripts/check-module-standard.mjs` | exit 0 |
| `pnpm build` | exit 0 |
| `pnpm --filter @amax/web e2e` | exit 0, 9 passed (includes both `shell.spec.ts` tests) |
| `pnpm --filter @amax/web e2e:auth` | exit 0, 95 passed |
| `specclaw-preset-check .` | exit 1 from the repo-wide backlog (3602); none in 086's four files |
| `specclaw-quality-scan . --gate` | exit 126, not_run (jq "Argument list too long", as in 066–080) |

Screenshots: `shots/app.png` (the app's rail, from the replica's build) and `shots/mock.png` (the 086 section).

Review: covered by 081-proposals-end-to-end's loop, which reviews 081 to 086 on this branch against `upstream/main`.

Build notes (2026-11-07, Windows host):
- On the running dev app as Maya at 1440 px: the logo is 44 × 44, its centre at 72 px, the same as the first nav icon's;
  computed `stroke: none`. Hovering expands the rail as before. At 390 px the logo is hidden, as before.
- The mock's rail carries the same rule; `shell.spec.ts` AC5 compares the two logo boxes, so both moved together.
- New `shell.spec.ts` test "086 AC1". It and AC5 couldn't run locally: `pnpm start` serves a stale production build,
  and `.env.local` turns on sign-in, so "/" is the marketing page. Run them in the Linux CI replica.
- Quality scan skipped: the change is one CSS rule and one test.

**Review (2026-11-07):** covered by 081-proposals-end-to-end's loop over the whole stack against `upstream/main`. Its final
pass (round 6) ran at `0bbdd63c`, after this change's commits, with 0 blockers. It stopped at the five-pass cap with two
081 majors open; none is in this change's files. See 081's `## Verify`. **Linux replica of CI** over `0bbdd63c`: every
step passes (35/35 packages, e2e 9, e2e:auth 95).
