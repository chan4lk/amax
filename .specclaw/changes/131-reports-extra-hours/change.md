# Reports: say when someone logged more than their available hours

**Change:** 131-reports-extra-hours · **Created:** 2026-11-16

## Problem

Nimal Silva has 96 available hours and logged 98.5 in October, but nowhere in Reports does it say he worked 2.5 hours extra: the numbers sit side by side with no comparison. Utilisation counts only billable hours, so the extra hours do not show in the percentage either. The product owner wants the report and the bot to say it.

## Mock Delta

A line in the report's Findings and in the person's Note ("2.5 h more than available"), and the same note on the Reports page's table and People race. See [`131-reports-extra-hours`](../../mock/index.html#131-reports-extra-hours).

## Acceptance Criteria

1. **AC-1** A person whose logged hours exceed their available hours by at least 0.1 h has, in the exported utilisation report, a finding "<Name> logged 98.5 h, 2.5 h more than the 96 h available." and a Note "2.5 h more than available" on their table row.
2. **AC-2** The Reports page says the same on that person's table row ("Logged 2.5 h more than available") and People race row ("2.5 h over available"), added beside any leave note.
3. **AC-3** Utilisation itself is unchanged: it stays billable divided by available. A person with no available hours, or whose logged hours do not exceed them, gets no note.
4. **AC-4** The Reports bot rules say to state it as "logged X h, Y h more than the Z h available", apart from utilisation, whenever it gives such a person's hours, in chat and in a report. No existing rule is edited.

## Tasks

- [x] `T1` — The comparison, in the report and on the page (AC-1, AC-2, AC-3)
  Files: modules/reports/server/overtime.ts, server/sections-people.ts, ui/UtilisationTable.tsx, ui/data.ts, tests/export.test.ts
- [x] `T2` — The bot says it (AC-4)
  Files: modules/reports/chat-rules.ts

## Verify

**Verdict:** PASS

- AC-1: pass — on the real database, Nimal Silva's October report has the finding "Nimal Silva logged 98.5 h, 2.5 h more than the 96 h available." and the table Note "2.5 h more than available"; the export test checks both.
- AC-2: pass in code — the page's table and People race notes use the same comparison. Not looked at in a browser; the Reports page compiled and /signin answered 200.
- AC-3: pass — utilisation was not touched (Nimal still 92%); the helper returns nothing below 0.1 h or without available hours. Kasun's test row ("80 h 2 days medical 78.0 h 70.0 h 88%") is unchanged.
- AC-4: pass — one rule added before the examples; none edited. Not tried with the real bot.

Type-check clean. Reports tests: 25 of 25 pass. The Reports browser spec was not run.

