# Reports: a person's projects and allocation percentages in the report

**Change:** 094-reports-person-plan · **Created:** 2026-11-16

## Problem

Asked for "Ayesha's projects and allocation percentages in the October report", the bot said it could not. The report builder reads Allocations, but only in summed-up forms (over 100%, the bench, planned hours per project, a person's total). No report section printed a person's percent on each project, and the bot can only ask for sections that exist.

## Mock Delta

A report for one person can carry a table "Planned allocation by project": the person, each project and its percent for the report's month, and a total. See [`094-reports-person-plan`](../../mock/index.html#094-reports-person-plan).

## Acceptance Criteria

1. **AC-1** A new report section `plan` lists, for the people in the report, each project (or other work) and the percent Allocations has planned for the report's month, with a total per person. Project names come from Delivery.
2. **AC-2** The section is included only when asked for (`sections` contains `plan`). The tool's description names it, so the bot can ask for it with a person, as in "Ayesha's projects and percentages".
3. **AC-3** A person planned over 100% is named in the report's findings. If Allocations is not installed, or the reader may see no allocations for them, the section says so and shows no numbers.
4. **AC-4** The section is labelled as planned allocation, not hours worked, in the table caption and in the method notes. The Reports bot rules say so too.
5. **AC-5** The allocation rows are read as the reader, so only people and projects the reader may see appear. No existing section changes.

## Tasks

- [x] `T1` — Load the plan lines and add the `plan` section (AC-1, AC-2, AC-3, AC-4, AC-5)
  Files: modules/reports/server/export-data.ts, server/export.ts, server/export-compose.ts, server/sections-plan.ts, tests/export.test.ts
- [x] `T2` — The bot knows to ask for it (AC-2, AC-4)
  Files: modules/reports/chat-rules.ts

## Verify

**Verdict:** PASS

- AC-1: pass — on the real database, "Utilisation report: Ayesha Rahman, October 2026" with sections [utilisation, plan] lists Fleet Tracker 50%, Contoso Portal 30%, HR Insights 30% and a total of 110%, in Markdown and PDF (2 pages). The export test checks the lines, the heading and a project name.
- AC-2: pass — the section only appears when asked for; the same person without `plan` has no plan data (tested). The sections description in the tool names `plan`.
- AC-3: pass — the report's findings say "Ayesha Rahman is planned at 110% in October 2026". The "Allocations isn't installed" and "none you can see" messages are in the section code; not exercised by a test.
- AC-4: pass — the table caption says "Planned allocation", the method note says it is not hours worked, and the bot rule says so.
- AC-5: pass — rows are read as the reader through listAllocations; existing sections unchanged; the other 23 Reports tests pass.

Type-check clean. Reports tests: 24 of 24 pass. Only the report's own month is shown (no other months), and logged hours per project per person are not included. The real bot was not asked: try "put Ayesha's projects and percentages in her October report".

