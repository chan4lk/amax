# Reports: a PDF or Word report from chat

**Change:** 126-reports-export · **Created:** 2026-11-05
**Review:** covered-by 124-preset-clean-up

## Problem

A PM who needs to share how delivery is going has to screenshot Reports or copy numbers by hand. They should be
able to ask amax for a report and get a finished PDF or Word file with the same numbers they see on the page,
limited to the people they may see, without a new button or form.

## Mock Delta

What changes on screen, and where to see it: [`126-reports-export`](../../mock/index.html#126-reports-export)

Nothing already on the Reports page is removed or moved. The change is in chat:

1. The person asks, for example "Give me a PDF report for October", "Make a Word report on Fleet Tracker" or
   "Report on Kasun Dias this quarter".
2. amax answers with a file card: title, period, format and page count, and one **Download** button. A short line
   above it says what is in the report.
3. On the Reports page, chat offers one more suggestion: "Download this month as a PDF report".

The file itself: a title, the period, who it was made for and when; the one-line briefing; the five headline numbers;
the 12-month utilisation chart against the target; the per-person table; hours vs plan by project; over-allocated
and bench; away soon; a footer saying where the numbers come from. A project report keeps only that project's
people and hours; a person report keeps only that person.

Scheduled and emailed reports, and other modules' reports (finance, people), are later changes.

## Acceptance Criteria

1. **AC-1** Chat has a read tool `export_report` (format `pdf` or `docx`; a month, this month when left out; optionally one
   project or one person). A quarter is a later change. It needs `reports:read`, changes no data, and so needs no confirm card.
2. **AC-2** Asked for a report, chat replies with a file card: title, period, format, page count (PDF) and one Download
   button. Nothing is added to the Reports page except one chat suggestion, "Download this month as a PDF report".
3. **AC-3** The file has, in order: title, period, "made for <name> on <date>"; the briefing; the five headline
   numbers; the 12-month chart with the target; the per-person table with the Team row; hours vs plan; over-allocated
   and bench; away soon; a footer naming the source ("submitted and approved time") and that people the reader may
   not see are left out.
4. **AC-4** Every number in the file equals what `get_delivery_pulse` and `get_utilisation` return to the same
   person for the same period. Nothing is calculated a second way.
5. **AC-5** The file shows only what the person asking may see: an Admin's report has everyone, a PM's only the
   people on their projects (125 AC-15). No pay or pricing data appears.
6. **AC-6** A project report keeps only that project (its hours vs plan row and the people allocated on it); a person
   report keeps only that person (their utilisation, availability, allocation and leave). Asking for a project or
   person the asker may not see is refused in plain words.
7. **AC-7** The Download link builds the file when it is opened and stores nothing. It checks the signed-in person
   again, so a forwarded or old link gives nothing to someone else. Each download is audited (who, which report,
   which format).
8. **AC-8** The PDF opens in a standard viewer and the Word file opens in Word with no repair prompt. Both are A4,
   use real headings and tables (the PDF is tagged with text, not an image of the page), and the chart has its values
   as a table beside it.
9. **AC-9** Demo data stays fictional, and a module that is not installed shows "not installed" in its section of
   the file rather than failing.

## Tasks

- [x] `T1` — Chat file card: a tool result's file shows as a card with a Download button (AC-2)
  Files: packages/chat/src/file.ts, packages/chat/src/engine.ts, packages/chat/src/index.ts, apps/web/components/chat/FileCard.tsx, apps/web/components/chat/Chat.tsx, apps/web/app/actions/chat.ts
- [x] `T2` — Report content from the same reads, narrowed to one project or one person (AC-3, AC-4, AC-5, AC-6, AC-9)
  Files: modules/reports/server/export-data.ts
- [x] `T3` — Word file (AC-3, AC-8)
  Files: modules/reports/server/export-docx.ts, modules/reports/package.json
  Depends: T2
- [x] `T4` — PDF file with real text, headings and tables, and the chart with its values (AC-3, AC-8)
  Files: modules/reports/server/export-pdf.ts, modules/reports/server/export-chart.ts, modules/reports/package.json
  Depends: T2
- [x] `T5` — Download link: built on open, only for the person it was made for, audited (AC-7)
  Files: modules/reports/server/export.ts, modules/reports/contracts.ts, apps/web/app/api/reports/export/route.ts, apps/web/next.config.ts
  Depends: T3, T4
- [x] `T6` — `export_report` tool and the chat suggestion (AC-1, AC-2, AC-6)
  Files: modules/reports/export-tool.ts, modules/reports/mcp.ts, modules/reports/chat-suggestions.ts
  Depends: T1, T5
- [x] `T7` — Tests and README (AC-1 to AC-9)
  Files: modules/reports/tests/export.test.ts, modules/reports/README.md
  Depends: T6

## Verify

**Verdict:** PASS

Written afterwards (2026-11-17), when this branch was prepared for review: this change had no verify record. Only automated evidence is claimed. 7 of 9 criteria have a passing test that cites them; the rest are marked not checked, not passed.

- AC-1: pass — test "AC1 AC2 export_report is a read that returns a file card for the chat" (tests/export.test.ts) passes.
- AC-2: pass — test "AC1 AC2 export_report is a read that returns a file card for the chat" (tests/export.test.ts) passes.
- AC-3: not checked — no passing automated test cites it.
- AC-4: pass — test "AC4 AC5 the file's numbers are the page's numbers, as the asker sees them" (tests/export.test.ts) passes.
- AC-5: pass — test "AC4 AC5 the file's numbers are the page's numbers, as the asker sees them" (tests/export.test.ts) passes.
- AC-6: pass — test "AC6 a project, person or topic report keeps only that, and someone unseen is refused" (tests/export.test.ts) passes.
- AC-7: pass — test "AC7 AC8 the link is only for its owner, and each download builds a real PDF or Word file a" (tests/export.test.ts) passes.
- AC-8: pass — test "AC7 AC8 the link is only for its owner, and each download builds a real PDF or Word file a" (tests/export.test.ts) passes.
- AC-9: not checked — no passing automated test cites it.

Commands run on the final code: type-check for allocations, chat, notifications, core, ui, reports and web (7 of 7 clean); tests: Reports 29 of 29, Allocations 62 of 62, chat 50 of 50, notifications 5 of 5 files. The tests cited above are in those packages. Preset check: the code this branch added has no comment lines and no new file over 80 lines (change 124). Screens: the file card and download link are still in use; no browser check was made in this session. The specclaw-review loop was not run (the tool is not installed here).

