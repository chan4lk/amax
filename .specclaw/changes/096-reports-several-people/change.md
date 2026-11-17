# Reports: one report for several named people

**Change:** 096-reports-several-people · **Created:** 2026-11-16

## Problem

A report could cover the team, one project or one person, but not two or three named people in one file: the export tool's `person` input holds one name, so a request for "Nimal, Kasun and Ayesha" gave separate reports or a refusal. The limit is in the tool's input definition, which the model is bound by, not in the bot's rule text.

## Mock Delta

In chat, one request for several people gives one file whose table has a row per person and a team line for just them. See [`096-reports-several-people`](../../mock/index.html#096-reports-several-people).

## Acceptance Criteria

1. **AC-1** `export_report` takes `people`, a list of two to ten names, next to the existing `person`. The tool's description says to use it for several people in one report instead of one call each.
2. **AC-2** Each name must match exactly one person the reader may see, by id, full name or first name. If any name does not, nothing is made and the message names it: `You can't see a report for "Nobody Here" in October.`
3. **AC-3** The report has a row per chosen person, totals for just them, and a title that names them ("Nimal Silva, Kasun Dias and Ayesha Rahman", or "N people" past three). Every section, including `plan`, works on those people.
4. **AC-4** The download link carries the list (separated by `|`) and the download route reads it back, so the file the link opens is the same report; the audit entry records the names.
5. **AC-5** The Reports bot rules say a report for named people is one call with `people`, and to say which name was not found. `person`, `project` and the team report work as before.

## Tasks

- [x] `T1` — The list in the tool, the lookup, the link and the title (AC-1, AC-2, AC-3, AC-4)
  Files: modules/reports/server/export.ts, server/export-data.ts, export-tool.ts, tests/export.test.ts
- [x] `T2` — The bot knows to use it (AC-5)
  Files: modules/reports/chat-rules.ts

## Verify

**Verdict:** PASS

- AC-1: pass — `people` is in the tool's input (two to ten names) with a description telling the model to use it; the export test calls the tool with it.
- AC-2: pass — on the real database, "Nimal + Nobody Here" is refused with: You can't see a report for "Nobody Here" in October. Nothing was made.
- AC-3: pass — on the real database, Nimal, Kasun and Ayesha give one PDF titled "Utilisation report: Nimal Silva, Kasun Dias and Ayesha Rahman, October 2026" (2 pages), and the Markdown table has a row each. The `plan` section was asked for in the same call and built.
- AC-4: pass — the file card's link carries `people=Nimal%7CKasun` and `ExportQuery` reads it back as ["Nimal", "Kasun"] (test, and on the real database). The route needed no change. The audit input now takes the names.
- AC-5: pass — one rule added before the examples; none edited. Not tried with the real bot. The single-person, project and team reports are covered by the existing tests, which pass.

Type-check clean. Reports tests: 26 of 26 pass. The download itself was not opened in a browser.

