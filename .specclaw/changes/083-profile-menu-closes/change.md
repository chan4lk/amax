# The profile menu closes like a menu

**Change:** 083-profile-menu-closes · **Created:** 2026-11-05 · **Review:** covered-by 081-proposals-end-to-end

## Problem

The profile menu (your name, top right) closes only on Escape or a second click on your name. Clicking anywhere else,
picking a theme or a View-as role, or tabbing out of it leaves it open. 001's mock closes it in each of those cases;
the app's [`ProfileMenu.tsx`](../../../apps/web/components/shell/ProfileMenu.tsx) never did.

## Mock Delta

What changes on screen, and where to see it: [`083-profile-menu-closes`](../../mock/index.html#083-profile-menu-closes)

No new screen. The app catches up with 001's mock, whose profile menu already closes this way. The section only says so.

## Acceptance Criteria

1. **AC-1** A click or tap anywhere outside the open menu and its button closes it.
2. **AC-2** Picking a theme or a View-as role closes the menu and puts focus back on the name button. Sign out and the
   links (Settings and the rest) close it as they act.
3. **AC-3** Tab, or Shift+Tab, out of the menu closes it; focus goes where Tab sends it.
4. **AC-4** Escape still closes it and returns focus to the button. A second click on the button still toggles it.
5. **AC-5** One browser test checks AC-1 to AC-4 on a signed-in page, and axe finds no violations with the menu open.

## Tasks

- [x] `T1` — The profile menu closes on an outside click, on a choice (focus back to the button), on Tab out, and still on Escape and the toggle; a browser test with axe (AC-1 to AC-5)
  Files: apps/web/components/shell/ProfileMenu.tsx, apps/web/tests/e2e/profile-menu.spec.ts

## Verify

**Linux replica of CI** (2026-11-05), over the working tree together with 081's Amendment 7, against a fresh Postgres:

| Check | Result |
|---|---|
| install, `db:migrate`, `lint` (graph check), `check-module-standard`, `build`, `e2e` | pass |
| `e2e:auth` | 93 passed, including "083 the profile menu closes …" (AC-1 to AC-5: a click outside, a theme choice with focus back on the name, Tab out, Escape, the toggle, axe clean with the menu open) |
| `pnpm turbo run test` | pass for this change. The one failure that run, 081's `delivery-flow` ordering, is fixed and recorded in 081 |

- **AC-1:** pass. A pointerdown outside the menu and its button closes it.
- **AC-2:** pass. A theme or View-as choice closes it and focuses the button; the links and Sign out close it too.
- **AC-3:** pass. Focus moving outside closes it. A blur with no `relatedTarget` (Safari's click on a button) doesn't,
  so the click still lands.
- **AC-4:** pass. Escape and the toggle are unchanged.
- **AC-5:** pass.

Review loop: not run (the specclaw-review server isn't connected).

**Review (2026-11-07):** covered by 081-proposals-end-to-end's loop over the whole stack against `upstream/main`. 083's
work went in with 081's amendment 7 commit `da337a8e`. The final pass (round 6) ran at `0bbdd63c`, after it, with 0
blockers. It stopped at the five-pass cap with two 081 majors open; none is in this change's files. See 081's `## Verify`.
**Linux replica of CI** over `0bbdd63c`: every step passes (35/35 packages, e2e 9, e2e:auth 95, including "083 the profile
menu closes").
