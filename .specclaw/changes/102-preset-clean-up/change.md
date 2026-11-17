# Code this branch added follows specclaw's base preset

**Change:** 102-preset-clean-up · **Created:** 2026-11-17

## Problem

Specclaw's base preset says no comments in code files and at most 80 lines per file. The project already breaks it widely (3,269 violations in old code, for example `packages/chat/src/engine.ts` at 501 lines), and the branch added more: 117 comment lines and ten files over 80 lines. The PRs must pass specclaw's checks for what they add, without rewriting old code.

## Mock Delta

No screen changes. This is a behaviour-neutral clean-up of code the branch added.

## Acceptance Criteria

1. **AC-1** No comment lines are left in the lines this branch added (tool pragmas are kept).
2. **AC-2** No file that is new in this branch, or that grew past 80 lines, is over 80 lines: the Allocations Board, MCP views and suggestions, and the Reports export data, trend card, attention strip, page view, data builder, PDF writer and export tests are split by responsibility.
3. **AC-3** Behaviour is unchanged: the Reports (29), Allocations (62) and chat (50) test files pass as before, and the type-check passes for allocations, chat, notifications, core, ui, reports and web.
4. **AC-4** Files that were already over 80 lines on main are left as they are.

## Tasks

- [x] `T1` — Remove the added comments and split the files over 80 lines (AC-1, AC-2, AC-3, AC-4)
  Files: modules/allocations/ui/Board.tsx, ui/useBoardRows.ts, ui/BoardKeys.tsx, mcp-views.ts, mcp-over.ts, mcp-context.ts, suggestions.ts, suggestions-set.ts, modules/reports/server/export-data.ts, export-types.ts, export-scope.ts, export-plan.ts, export-pdf.ts, export-pdf-core.ts, export-pdf-table.ts, modules/reports/ui/TrendCard.tsx, TrendPlot.tsx, TrendBox.tsx, trendMath.ts, useTrendSpot.ts, Attention.tsx, AttentionRow.tsx, attentionItems.ts, ReportsView.tsx, Lede.tsx, data.ts, comingItems.ts, modules/reports/tests/export.test.ts, export-people.test.ts, and 46 files with a comment removed

## Verify

**Verdict:** PASS

- AC-1: pass — before: 117 comment lines in 46 files were flagged on lines this branch added; after: the preset check flags none on added lines. Tool pragmas were not touched.
- AC-2: pass — before: ten files were new or had crossed 80 lines (export-data 145, TrendCard 137, Board 116, Attention 113, export tests 107, mcp-views 100, export-pdf 97, ReportsView 97, data 85, suggestions 84); after: none is over 80 (the largest of the new pieces is 63 lines).
- AC-3: pass — type-check clean for allocations, chat, notifications, core, ui, reports and web (7 of 7); tests: Reports 29 of 29, Allocations 62 of 62, chat 50 of 50. No browser check was made.
- AC-4: pass — files already over 80 lines on main (engine.ts, Chat.tsx, module.ts, actions/chat.ts, services.ts, BellMenu.tsx, status.test.ts) were not split.

The preset check still reports 3,000-odd violations in old code, which this change does not touch. Quality scan (duplication and complexity) was not run in this change.

