# Reports export: a month after Reports' own month is explained, not a failure

**Change:** 093-reports-export-month · **Created:** 2026-11-16

## Problem

Asked for "the utilisation report for this month", the bot made a Reports export for November 2026 and it failed twice with only a reference. Reports' own "today" is October 16, so November "hasn't started yet", but the export tool only turned "you can't see that" into a message; any other error became a generic failure the bot could not explain or fix. The bot knows the calendar date, not Reports' date, so it asked for the wrong month.

## Mock Delta

In chat, asking for a report for a month after Reports' latest month now answers with the reason and the month to use, then the file for that month. See [`093-reports-export-month`](../../mock/index.html#093-reports-export-month).

## Acceptance Criteria

1. **AC-1** `export_report` for a month that hasn't started in Reports is refused with a plain message: "<Month> hasn't started yet. Reports' latest month is <Month Year>: ask for that month, or leave the month out." It is not a failure with only a reference.
2. **AC-2** Left without a month, the export covers the month Reports is on, in PDF, Word and Markdown, as before.
3. **AC-3** The Reports bot rules say "this month" means the month Reports is on: leave the month out unless the user names one, and when a tool says a month hasn't started, say which month Reports is on and offer it. No existing rule is edited.
4. **AC-4** Refusals about people and projects the viewer cannot see are unchanged.

## Tasks

- [x] `T1` — A later month is a clear refusal (AC-1, AC-2, AC-4)
  Files: modules/reports/server/export-data.ts, tests/export.test.ts
- [x] `T2` — The bot says what "this month" means (AC-3)
  Files: modules/reports/chat-rules.ts

## Verify

**Verdict:** PASS

- AC-1: pass — reproduced the failure against the real database (references 88daf7a7… and 4f842efd…): the cause was "November 2026 hasn't started yet" as a plain error. Now the same request answers "November 2026 hasn't started yet. Reports' latest month is October 2026: ask for that month, or leave the month out." (checked in a script as the same user, and in the export test).
- AC-2: pass — with no month, PDF and Word both build on the real database: "Utilisation report, October 2026 · Oct 1–16 · PDF · 2 pages · 3 people".
- AC-3: pass — one rule added to the Reports bot rules before the examples; none edited. Not tried with the real bot.
- AC-4: pass — the existing test for "Nobody Here" still passes.

Type-check clean. Reports tests: 23 of 23 pass. The real bot was not run: ask "create the utilisation report for this month" on localhost:3000 to see it leave the month out, or say November and see the explanation.

