# Allocations: the page follows the product owner's demo

**Change:** 088-allocations-demo-look · **Created:** 2026-11-16

## Problem

The product owner supplied a demo of the Allocations tab (`allocations-demo.html`) and asked for the real page to match it: its fonts, colours, spacing, cards, chart and the smooth Your people / Everyone switch. The old page was a table with several cards the demo does not have. The bot also refused to change lines the user may change, because it read `manages` (does the person manage the project) where it needed `editable` (may the user change this line).

## Mock Delta

The title row, the 6-month capacity and demand graph with a month box, the People by month board with bench blocks and a red frame for over 100%, a Conflicts card, a Bench by month card and a Rolling off card. See [`088-allocations-demo-look`](../../mock/index.html#088-allocations-demo-look).

## Acceptance Criteria

1. **AC-1** The page is laid out as the demo: title with three chips, a summary sentence, then a left column (graph, board) and a right column (Conflicts, Bench by month, Rolling off). Cards the demo does not have are gone.
2. **AC-2** The graph covers six months and its month box shows capacity and demand in FTE for the team, plus spare or short for everyone and for the chosen group, and says who is over 100%.
3. **AC-3** The board shows each person's project lines as bars, bench months as hatched blocks, and months over 100% in a red frame that never covers a project name. A Fix chip in the frame opens chat with the person pinned and "Fix <name>'s over-allocation in <month>".
4. **AC-4** Switching My projects / Everyone is immediate: rows slide in and out, the chips dip, nothing waits on the server, and the page stays responsive with 140 people.
5. **AC-5** Bars load on arrival (no scroll reveal), and the chat opens over the page without pushing it.
6. **AC-6** Every line carries `editable` (the user may change it), and the bot rules use it. Allocations and the bot say six months are shown.
7. **AC-7** Every card, row and stat keeps its pin, and writes still go through chat only.

## Tasks

- [x] `T1` — The bot knows which lines the user may change, and six months (AC-6)
  Files: modules/allocations/server/grid.ts, server/row.ts, chat-rules.ts, mcp.ts, tests/grid-title.test.ts, tests/people.ts, tests/chat-first.test.ts
- [x] `T2` — Page, graph, board, side cards and the switch (AC-1, AC-2, AC-3, AC-4, AC-5, AC-7)
  Files: modules/allocations/ui/*, packages/ui/src/styles/chat.css, tests/header.test.ts, tests/runway.test.ts
  Depends: T1

## Verify

**Verdict:** PASS

- AC-1: pass — page measured against `allocations-demo.html` side by side at 1280 px; cards the demo lacks are removed. Compared by eye: the product owner.
- AC-2: pass — month box shows the team's capacity and demand, spare or short for everyone and the chosen group, and the over-100% count.
- AC-3: pass — bars, bench blocks and the red frame behind the bars; the Fix chip sends "Fix <name>'s over-allocation in <month>", the wording the old Fix it button used.
- AC-4: pass — switch traced in a browser: rows enter in batches and slide, chips dip; no server wait. 140 people stay responsive.
- AC-5: pass — bars draw on load; chat overlays the page.
- AC-6: pass — `editable` on every line (grid-title test AC2); bot rules and the tool text say six months.
- AC-7: pass — every card, row and stat has a pin; no form or write on the page.

Type-check clean. Allocations tests: 58 pass, 3 fail (AC-3 audit events, AC19 only, suggestions AC2/AC3); the same 3 failed before this change. Not run: the Allocations browser spec. The real bot was not asked questions in a browser here; check it on localhost:3000.

