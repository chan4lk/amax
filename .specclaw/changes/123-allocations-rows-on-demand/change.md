# Allocations: the board builds rows as you scroll to them

**Change:** 123-allocations-rows-on-demand · **Created:** 2026-11-16
**Review:** covered-by 124-preset-clean-up

## Problem

Switching to Everyone on the Allocations tab still feels laggy. The board builds a row for every person (about 140, each with dozens of elements) even though about a dozen are on screen, and each switch repeats that work. Change 121 spread the work out but still did all of it. The product owner cannot show the page to the architect like this.

## Mock Delta

At the foot of the board, when there are more people than are built, a "Show 24 more" button and the line "N more people load as you scroll". Nothing else changes on screen. See [`123-allocations-rows-on-demand`](../../mock/index.html#123-allocations-rows-on-demand).

## Acceptance Criteria

1. **AC-1** The board builds the first 20 people of the chosen group and adds 24 more each time the reader scrolls near the end or presses Show more, until everyone is built. Nobody is left out: the same people appear in the same order.
2. **AC-2** Switching groups only builds the rows for the new group's first 20 people, even if the last group was scrolled far; the first 14 slide in and out, the rest do not animate.
3. **AC-3** The foot of the board says how many people are still to load and has a Show more button, so a keyboard user or a browser without scroll detection can reach everyone.
4. **AC-4** Nothing already on the page is removed: every row, pin, frame, chip and note stays, and the hidden-people note is unchanged.

## Tasks

- [x] `T1` — Rows built on demand, with Show more (AC-1, AC-2, AC-3, AC-4)
  Files: modules/allocations/ui/Board.tsx, ui/board.css

## Verify

**Verdict:** PASS

- AC-1: pass — Everyone (144 people): 20 are built on arrival, and scrolling the page to the foot loaded 20 → 68 → 116 → 144; the "load more" line then disappears. Same people, same name order.
- AC-2: pass — switching measured in a browser on the dev server: to Everyone one slow frame (133 ms, one 95 ms task) and the page holds 1,518 elements; back to My projects no slow frame (33 ms worst). Before this change, with change 121 in place: 12 slow frames, a 316 ms worst frame and 4,587 elements. Before 121: tasks up to 768 ms.
- AC-3: pass — the foot shows "Show 24 more" and "N more people load as you scroll"; pressing the button took the board from 20 to 44 people.
- AC-4: pass — rows, pins, red frames, Fix chips, the keys and the hidden-people note are unchanged. Compared side by side.

Type-check clean. Allocations tests: same 3 failures as before and the rest pass. Found and fixed while testing: the first version loaded every chunk in a chain, and then never loaded on scroll; both are covered by the scroll check above. Not measured: a production build, because production mode turns off the demo sign-in used here. Browser spec not run.

