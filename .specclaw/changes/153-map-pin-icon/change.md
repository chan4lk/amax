# The Release map's pin shows as a small "+", not one across the map

**Change:** 153-map-pin-icon · **Created:** 2026-11-27 · **Review:** change

## Problem

Hovering the Release map card (all releases and a project's Releases tab) shows the card's pin as a purple "+" about
760 px wide across the map. The rule meant for the map drawing, `.map svg{width:100%;max-width:1000px;min-width:760px}`
in `modules/delivery/ui/delivery.css`, also matches the PinButton's 24-px icon in the card head, which only appears on
hover. Found in the product owner's demo, 2026-11-27 (measured: the icon renders 760×760).

## Mock Delta

What changes on screen, and where to see it: no mock section. The Release map looks as its mock shows (051); on hover
its pin is the same small "+" as every other card's pin. Like 098, this change gets no section of its own.

## Acceptance Criteria

1. **AC-1 The map's size rule sizes only the map.** The rule applies to the map drawing alone (the card's direct `svg`
   child), so the pin icon in the card head keeps the pin's own size, and the map keeps its width, its 760-px minimum
   and its horizontal scroll on narrow screens.
2. **AC-2 Checked on screen and by a test.** Hovering the Release map card shows a pin icon the size of other cards' pins
   (screenshot before and after, light and dark); a test renders the Releases cards and checks the size rule can't
   reach an `svg` outside the map drawing.

## Tasks

- [x] `T1` — AC-1 AC-2: the map's size rule scoped to the card's direct `svg` child (`.map > svg`), and a test that renders the Releases cards, checks the map drawing is the card's direct `svg` child and the pin icon isn't, and that no `.map` rule sizes a descendant `svg`
  Files: modules/delivery/ui/delivery.css, modules/delivery/tests/map-pin-icon-153.test.ts

## Verify

**Verdict:** PASS
Review: CLEAN — 2 rounds, final pass 6405df04a8, models opus/opus; last round 0/0/0 b/M/m (`base_branch` 962bb5ce for each run; config restored after each).
Size: 2 production lines against 962bb5ce (cap 400).

Checked 2026-11-27, Windows 11, dev app on :3000, signed in as maya@lumenlabs.test on CON's Releases tab.

- AC-1: pass. `.map>svg` sizes only the map drawing; hovering the Release map card, the pin icon measures 15×15 (760×760 before), and the map keeps its width (`shots/app-hover-before.png`, `shots/app-hover-light.png`, `shots/app-hover-dark.png`).
- AC-2: pass. `map-pin-icon-153.test.ts` (2 tests): the only `.map` rule sizing an `svg` is `.map>svg` with its 760-px minimum, and in the rendered cards the map drawing is the card's direct `svg` child while the pin's icon sits in the card head's button; with the old `.map svg` put back, the stylesheet test fails.

Commands (exit codes):

- `npx vitest run modules/delivery apps/web/tests packages/testing/tests/mock-balanced-116.test.ts`: 1, host-only `releases.test` "two call sites", plus three load timeouts that pass alone (27/27: `authors-091`, `commits-104`, `create-project-surfaces`)
- `node scripts/check-module-standard.mjs --root .`: 0 (23 modules)
- `specclaw-verify size .specclaw 153-map-pin-icon` (base 962bb5ce): 0
- `specclaw-preset-check .`: 1, repo-wide; in 153's files only the comment rule, as across the repo
- `specclaw-quality-scan . --gate`: 2, the complexity tool did not run

Screenshots: `shots/app-hover-before.png`, `shots/app-hover-light.png`, `shots/app-hover-dark.png` (no mock section: the map looks as 051's mock shows)

Quality: no duplicated lines added (a one-selector CSS change and one test). Build notes: in the running dev app the map card's pin icon measured 760×760 on hover before and 15×15 after. No per-task commits from the agent (git is read-only here).
