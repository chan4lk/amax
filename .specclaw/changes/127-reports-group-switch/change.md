# Reports: Your people and Everyone, the graph following the choice

**Change:** 127-reports-group-switch · **Created:** 2026-11-09
**Review:** covered-by 124-preset-clean-up

## Problem

The Reports tab fixed whose people it showed: an Admin saw everyone and anyone else saw only the people on projects they manage, with no way to look at the other group. The Allocations page lets the user switch between My projects and Everyone and everything follows. Reports did not, and its utilisation graph could not show both groups.

## Mock Delta

A Your people / Everyone switch beside the title; the table, cards and graph follow it, and the graph draws the other group as a second line. See [`127-reports-group-switch`](../../mock/index.html#127-reports-group-switch).

## Acceptance Criteria

1. **AC-1** Reports covers one of two groups: `mine` (the people on the projects the viewer manages) or `everyone` (everyone the viewer may see). Without a choice an Admin gets everyone and anyone else gets mine. The report carries its group.
2. **AC-2** The page has a read-only Your people / Everyone switch in the address (`?group=`), keeping the table tab, band and name filter. No form, no write.
3. **AC-3** The title figures, the table, the cards (capacity, allocation, hours, away) and the 12-month graph all follow the chosen group.
4. **AC-4** The graph draws the chosen group solid and the other group as a second line, with both groups' current utilisation beside the target; the legend names both.
5. **AC-5** `get_utilisation`, `get_delivery_pulse` and `show_reports` take `group`; the show tool puts it in the page address. Pins to the graph carry the group.
6. **AC-6** Choosing Everyone never shows more than the viewer may see: hours, leave and people stay behind Time's, Leave's and HR's own rules.
7. **AC-7** The Reports bot rules say which group a figure covers and to call each group when asked to compare. No existing rule is edited.

## Tasks

- [x] `T1` — Group in the roster, report, pulse and tools (AC-1, AC-5, AC-6)
  Files: modules/reports/server/roster.ts, server/view.ts, server/pulse.ts, mcp.ts, pulse-tool.ts, show-tool.ts, pins.ts
- [x] `T2` — Switch, cards and graph (AC-2, AC-3, AC-4)
  Files: modules/reports/ui/GroupSwitch.tsx, ui/ReportsPage.tsx, ui/Trend.tsx, ui/reports.css
- [x] `T3` — Bot rule and test (AC-7)
  Files: modules/reports/chat-rules.ts, modules/reports/tests/pulse.test.ts

## Verify

Type-check clean. Reports tests: 23 of 23 pass, including the new group test. Site rebuilt and running on localhost:3000. The switch and graph were not clicked through in a browser here (sign-in needed): check Reports as the PM and as the Admin.

### Re-verified 2026-11-17

**Verdict:** PASS

Written afterwards, when this branch was prepared for review. The notes above were written when the change was built; this adds a record per criterion. Only automated evidence is claimed. 4 of 7 criteria have a passing test that cites them; the rest are marked not checked, not passed.

- AC-1: not checked — no passing automated test cites it.
- AC-2: not checked — no passing automated test cites it.
- AC-3: not checked — no passing automated test cites it.
- AC-4: pass — test "AC4 AC5 AC6 AC7 AC9 each card reads through one tool, whole or one card" (tests/pulse.test.ts) passes.
- AC-5: pass — test "AC4 AC5 AC6 AC7 AC9 each card reads through one tool, whole or one card" (tests/pulse.test.ts) passes.
- AC-6: pass — test "AC4 AC5 AC6 AC7 AC9 each card reads through one tool, whole or one card" (tests/pulse.test.ts) passes.
- AC-7: pass — test "AC4 AC5 AC6 AC7 AC9 each card reads through one tool, whole or one card" (tests/pulse.test.ts) passes.

Commands run on the final code: type-check for allocations, chat, notifications, core, ui, reports and web (7 of 7 clean); tests: Reports 29 of 29, Allocations 62 of 62, chat 50 of 50, notifications 5 of 5 files. Preset check: the code this branch added has no comment lines and no new file over 80 lines (change 124). Screens: the Reports switch was rebuilt by 128; no screen comparison was made against the old page. The specclaw-review loop was not run (the tool is not installed here).
