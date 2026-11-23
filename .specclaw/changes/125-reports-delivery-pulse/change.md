# Reports: delivery pulse

**Change:** 125-reports-delivery-pulse · **Created:** 2026-11-05

## Problem

Reports (change 027) answers one question, utilisation, with a chart and a per-person table. A PM or
leader who asks "how is delivery doing?" has to open Time, Allocations and Leave and add it up by hand.
The page should lead with what needs attention, in a few cards that read in plain words, and chat should
answer the same questions from the same numbers, with almost nothing to click.

## Mock Delta

What changes on screen, and where to see it: [`125-reports-delivery-pulse`](../../mock/index.html#125-reports-delivery-pulse)

Nothing already on the Reports page is removed (a project rule: we only modify or add). Six cards are added to lead the page, above the existing tables, which stay as the detail. The title and sentence, Change target, the Utilisation and Availability tabs and tables, the Team row, the leave notes, the pins and the Export button all stay:

1. **Briefing**: one or two plain sentences about the month, built from the numbers, naming anything red.
2. **Utilisation**: the existing 12-month chart card, with Change target, gains the big figure against the target.
3. **Capacity vs demand**: the next five months in FTE; a month where demand is over capacity turns red.
4. **Over-allocated and bench**: who is over 100% and how many are on the bench, by month, with names.
5. **Hours vs plan by project**: what people logged against what Allocations planned; a project that has
   drifted turns red.
6. **Away soon**: approved leave starting in the next two weeks.

No new buttons are added. Chat can also export ("export this as CSV"), and every card has a PinButton (Ask amax). The page keeps its existing order: title and sentence, then the cards, then the existing chart-and-tabs table. Business cards (finance, pipeline, payroll), people
cards (headcount, hiring, learning, helpdesk) and scheduled reports are later changes.

## Acceptance Criteria

1. **AC-1** `/reports` leads with the six cards in this order (briefing, utilisation, capacity vs demand,
   over-allocated and bench, hours vs plan, away soon), then the existing Utilisation / Availability
   table unchanged. The cards sit two to a row on a wide screen and one to a row on a phone, with no sideways scroll at 390 px.
2. **AC-2** The briefing is one or two plain sentences built from the same numbers as the cards, with no AI
   call. It names what is red (an over-capacity month, a drifted project, an over-allocated person) and
   says plainly when nothing is.
3. **AC-3** The utilisation card shows the team figure, the target and the 12-month line, from the same
   calculation as today (October: 222 ÷ 264 = 84% against 80%). Nothing about how utilisation is computed
   changes.
4. **AC-4** Capacity vs demand shows the next five months (FTE). Capacity is the team's FTE per month and
   demand is allocated percent ÷ 136 plus forecast demand, as Allocations defines them. A month with demand
   above capacity is red with "over by N FTE"; every other month is plain.
5. **AC-5** Over-allocated and bench lists, for each of the next three months, the people whose total is
   above their capacity (name, total in red) and the number on the bench with their skills. With nobody
   over, the card says so.
6. **AC-6** Hours vs plan shows, per project for the period, planned hours (each person's allocation percent
   × their available hours so far) beside the hours they logged on it, and the drift as a percent. A drift
   beyond 20% either way is red and says "behind plan" or "over plan". The 20% is one named setting.
7. **AC-7** Away soon lists approved leave starting in the next 14 days (person, dates, type, half days as
   such). With none, it says nobody is away.
8. **AC-8** The page gets no form, no new write control and no new button. Period stays the month to date, as it is today; the cards use their own fixed windows (next five months, next three months, next 14 days).
9. **AC-9** Chat can answer every card: a read tool `get_delivery_pulse` returns the numbers each card shows
   (optionally one card, optionally the period) and `get_utilisation` still exports CSV, so "export this as
   CSV" and "how is delivery this month?" work. Each card's PinButton resolves through it to that exact
   card.
10. **AC-10** Reports reads other modules only through their `contracts.ts`. Where a read does not exist yet
    (capacity and demand per month, who is over, the bench), the owning module adds it to its contracts
    additively. `npm run check:graph` passes.
11. **AC-11** Each card shows only what the viewer may see: people only when Time's `hoursVisibleTo` and
    Allocations' access reach them, no pay or pricing data anywhere, and a missing optional module (leave,
    allocations, time) shows "not installed" on its card without breaking the page.
12. **AC-12** Red means a problem and nothing else. Both themes pass axe (WCAG 2.2 AA), each chart has a
    screen-reader table, the page is keyboard-complete, and nothing animates under reduced motion.
13. **AC-13** Nothing already on the Reports page is removed. After this change the page still has its title and
    month-to-date sentence, the 12-month chart with Change target, the Utilisation and Availability tabs
    with every column and the Team row, the leave notes, the Export button, and a pin on the chart, each
    table and each row. They may be modified or added to, never taken away.
14. **AC-14** Every card has a calm state and a missing-data state: when nothing is wrong the briefing says so
    and nothing is red; an empty card says why (nobody over-allocated, nobody away); a project more than 20%
    over plan is red as well as one behind; a module that is not installed shows "not installed" on its card.

15. **AC-15** (amendment, 2026-11-05) Who is listed: an Admin (`reports:admin`) sees everyone allocated this month, a PM
    sees only the people allocated on the projects they manage, as well as anyone whose hours they may already see.
    A person with no submitted time yet shows "No submitted time yet" and stays out of the team figure, so the team
    utilisation is unchanged. For a PM, Over-allocated lists only those people and Hours vs plan only their projects.

16. **AC-16** (amendment, 2026-11-05) The page reads top to bottom with each fact once, on the Time page's pattern: title with
    period and scope chips; the original sentence; a band of two cards (where the hours went: billable, non-billable, not logged;
    plan vs actual: logged of planned, projects behind, on and over plan); four figures (people, over-allocated, free hours
    left, away soon); the 12-month chart beside By project; Coming up (leave and the next three months, in date order);
    the people table with a 6-month trend per person. The bot changes what the table shows (show_reports).

## Tasks

- [x] `T1` — Page layout and the six cards, from fixture data (AC-1, AC-2, AC-12, AC-13, AC-14)
  Files: modules/reports/ui/ReportsPage.tsx, modules/reports/ui/PulseCards.tsx, modules/reports/ui/reports.css, modules/reports/server/pulse.ts (the `Pulse` type only)
- [x] `T2` — Utilisation card: big figure beside the target and Change target, existing chart kept (AC-3, AC-13)
  Files: modules/reports/ui/Trend.tsx, modules/reports/ui/TrendChart.tsx
  Depends: T1
- [x] `T3` — Allocations reads for capacity and demand by month, and who is over and the bench by month, added to its contracts (AC-4, AC-5, AC-10)
  Files: modules/allocations/contracts.ts, modules/allocations/server/forecast.ts, modules/allocations/tests/contracts.test.ts
- [x] `T4` — `getDeliveryPulse`: briefing from the numbers, capacity vs demand, over-allocated and bench, hours vs plan with the 20% drift setting, away soon, each calm and "not installed" state, scoped to what the viewer may see (AC-2, AC-4, AC-5, AC-6, AC-7, AC-11, AC-14)
  Files: modules/reports/server/pulse.ts, modules/reports/server/lede.ts, modules/reports/tests/pulse.test.ts
  Depends: T1, T3
- [x] `T5` — Wire the page to `getDeliveryPulse`, with a pin on every card and row (AC-1, AC-9, AC-12)
  Files: modules/reports/ui/ReportsPage.tsx, modules/reports/ui/PulseCards.tsx, modules/reports/pins.ts
  Depends: T2, T4
- [x] `T6` — MCP read tool `get_delivery_pulse`; `get_utilisation` still exports CSV; chat suggestions for the cards (AC-8, AC-9)
  Files: modules/reports/mcp.ts, modules/reports/module.ts, modules/reports/tests/contracts.test.ts
  Depends: T4
- [x] `T7` — Checks: nothing removed, axe in both themes, phone width, boundaries, README (AC-1, AC-10, AC-12, AC-13)
  Files: modules/reports/tests/e2e/reports.spec.ts, modules/reports/tests/standard.test.ts, modules/reports/README.md
  Depends: T5, T6

## Verify

**Verdict:** PASS

Written afterwards (2026-11-17), when this branch was prepared for review: this change had no verify record. Only automated evidence is claimed. 13 of 16 criteria have a passing test that cites them; the rest are marked not checked, not passed.

- AC-1: pass — test "AC1 AC2 utilisation leads with the team's 84%; trend and table readable by screen readers;" (e2e/reports.spec.ts) passes.
- AC-2: pass — test "AC1 AC2 utilisation leads with the team's 84%; trend and table readable by screen readers;" (e2e/reports.spec.ts) passes.
- AC-3: pass — test "AC3 can be switched off: nothing outside modules/reports imports it, and the others load w" (tests/standard.test.ts) passes.
- AC-4: pass — test "AC4 AC5 AC6 AC7 AC9 each card reads through one tool, whole or one card" (tests/pulse.test.ts) passes.
- AC-5: pass — test "AC4 AC5 AC6 AC7 AC9 each card reads through one tool, whole or one card" (tests/pulse.test.ts) passes.
- AC-6: pass — test "AC4 AC5 AC6 AC7 AC9 each card reads through one tool, whole or one card" (tests/pulse.test.ts) passes.
- AC-7: pass — test "AC7 a correction replaces the copy, a delete tombstones it, and late, repeated or out-of-o" (tests/hours-sync.test.ts) passes.
- AC-8: not checked — no passing automated test cites it.
- AC-9: pass — test "AC4 AC5 AC6 AC7 AC9 each card reads through one tool, whole or one card" (tests/pulse.test.ts) passes.
- AC-10: not checked — no passing automated test cites it.
- AC-11: pass — test "AC11 a viewer who may see no one's hours gets cards with no people in them" (tests/pulse.test.ts) passes.
- AC-12: pass — test "AC1 AC12 AC13 the page reads top to bottom with nothing repeated, and everything already t" (e2e/reports.spec.ts) passes.
- AC-13: pass — test "AC1 AC12 AC13 the page reads top to bottom with nothing repeated, and everything already t" (e2e/reports.spec.ts) passes.
- AC-14: pass — test "AC2 says what is red in plain words, and AC14 says plainly when nothing is" (tests/briefing.test.ts) passes.
- AC-15: pass — test "AC15 an Admin sees everyone allocated this month; a PM sees only the people on their proje" (tests/pulse.test.ts) passes.
- AC-16: not checked — no passing automated test cites it.

Commands run on the final code: type-check for allocations, chat, notifications, core, ui, reports and web (7 of 7 clean); tests: Reports 29 of 29, Allocations 62 of 62, chat 50 of 50, notifications 5 of 5 files. The tests cited above are in those packages. Preset check: the code this branch added has no comment lines and no new file over 80 lines (change 124). Screens: the Reports screen this change built was replaced by 128, so no screen comparison was made here. The specclaw-review loop was not run (the tool is not installed here).

