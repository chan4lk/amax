# Reports: the page follows the product owner's demo

**Change:** 128-reports-demo-look · **Created:** 2026-11-16

## Problem

The product owner supplied a demo of the Reports tab (`reports-demo.html`) and asked for the real page to match it, with the same smooth Your people / Everyone switch. The old page was a stack of figures and tables. Nothing already on the page may be removed, so the tables, Export and Change target stay.

## Mock Delta

A ring of billable against available, the 12-month graph with a hover box, a Needs attention strip, "How the percentage is made" bars, hours against the plan, a People race and a Coming up timeline, with the tables below. See [`128-reports-demo-look`](../../mock/index.html#128-reports-demo-look).

## Acceptance Criteria

1. **AC-1** The page has the demo's seven cards in its order, with its sizes, colours and light and dark themes, then the Utilisation and Availability tables with Export.
2. **AC-2** Both groups are read on the server, so the switch changes every card at once: numbers glide, the ring and bars grow, the thick graph line moves, People rows re-sort, project rows close and the timeline reflows. The address keeps `?group=`.
3. **AC-3** The graph shows both groups, a hover or focus box with both scores against the target, and four summary tiles.
4. **AC-4** Needs attention steps through over-100% people, projects more than 20% off plan, under-target people and people with no time yet, by itself and with the arrow keys. Many people with no time yet are one item.
5. **AC-5** Take action, Change target and every card, tile, row and timeline item open chat with the record pinned; there is no form and no write on the page.
6. **AC-6** The report carries each person's job title from HR. The People race shows the top 15 and says how many more there are; everyone is in the table.
7. **AC-7** No existing control is removed: tables, tabs, Export, Change target, notes and pins stay.

## Tasks

- [x] `T1` — Job titles come with the report (AC-6)
  Files: modules/reports/server/inputs.ts, server/view.ts
- [x] `T2` — Cards, graph, strip, race, timeline and the switch (AC-1, AC-2, AC-3, AC-4, AC-5, AC-7)
  Files: modules/reports/ui/*, modules/reports/tests/e2e/reports.spec.ts
  Depends: T1

## Verify

**Verdict:** PASS

- AC-1: pass — page measured against `reports-demo.html` side by side at 1280 px, light and dark; the tables and Export follow the cards. Compared side by side.
- AC-2: pass — switch traced in a browser: the page changes group within about 0.3 s in dev, the address becomes `?group=`, no browser errors.
- AC-3: pass — hover box checked in a browser: both scores against the 80% target, the chosen group marked selected.
- AC-4: pass — strip steps by itself; people with no time yet are one item when there are more than three, and at most seven tabs show.
- AC-5: pass — Take action and Change target open chat with the record pinned; every card, tile, row and timeline item has a pin; no form on the page.
- AC-6: pass — job titles come with the report; the race shows the top 15 and "and 128 more".
- AC-7: pass — tables, tabs, Export, Change target, notes and pins are still there.

Type-check clean. Reports tests: 23 of 23 pass. The Reports browser spec was updated for the new layout but not run. The test database was behind on one Reports table (`week_status`); it was brought up with the repo's own migrate command. The real bot was not asked questions in a browser here; check it on localhost:3000.

