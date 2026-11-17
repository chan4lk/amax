# Allocations: a fast switch, a whole Fix chip and a whole month box

**Change:** 090-allocations-switch-speed · **Created:** 2026-11-16

## Problem

On the Allocations tab, switching My projects / Everyone lags: the page freezes for up to 0.4 s because every month name on the board is built with a new date formatter on each call, and up to 140 rows are drawn, animated and removed in one go. Two things are also cut off: the Fix chip under a red-framed month is half hidden (its own row clips it and the next row paints over it), and the graph's month box can be covered at the bottom by the card below it.

## Mock Delta

The Fix chip shows whole under its frame, and the month box on the graph shows whole, also at the last month. Nothing else changes on screen. See [`090-allocations-switch-speed`](../../mock/index.html#090-allocations-switch-speed).

## Acceptance Criteria

1. **AC-1** `monthLabel` names a month exactly as before but builds its date formatter once and each month once, so drawing the board no longer spends time on formatters.
2. **AC-2** On a switch, only the rows that are on screen slide in and out; the rest appear in small quiet chunks and are removed in small chunks after the slide, so no single step freezes the page.
3. **AC-3** The Fix chip under a red-framed month is fully visible and fully clickable: neither its row nor the row below hides any of it.
4. **AC-4** The month box on the graph is never covered by the card below it, at any month, including a month with 0 demand.
5. **AC-5** No row, card, pin or control is removed, and the switch still shows the same rows in the same order.

## Tasks

- [x] `T1` — Month names built once (AC-1)
  Files: modules/allocations/server/months.ts, tests/months.test.ts
- [x] `T2` — Quiet rows, whole chip, whole box (AC-2, AC-3, AC-4, AC-5)
  Files: modules/allocations/ui/Board.tsx, ui/board.css, ui/runway.css

## Verify

**Verdict:** PASS

- AC-1: pass — `monthLabel` caches its formatter and each month; the new test checks the same names as before. Profiling the switch showed `monthLabel` at 553 ms of self time before and nowhere in the top entries after.
- AC-2: pass — measured in a browser on the dev server (143 people), switching to Everyone and back: worst frame 316 ms and 449 ms before, 133 ms and 183 ms after; longest task 768 ms before, 107 ms after. The rest of the time is React's development-mode element builder, which a production build does not have; a production build was not measured.
- AC-3: pass — with the red-framed row scrolled to the middle, the top, bottom and corner of the Fix chip all answer a hit test as the chip; its row's overflow is visible once it has slid in.
- AC-4: pass — the last month (Apr, 0 demand) was hovered: the whole box is on screen above the board; the graph card now has its own layer above the next card.
- AC-5: pass — the same rows in the same order; nothing removed. Compared on a screenshot.

Type-check clean. Allocations tests: 59 pass and the same 3 fail as before (AC-3 audit events, AC19 only, suggestions AC2/AC3). Browser spec not run.

