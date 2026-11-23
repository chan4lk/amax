# Reports export: read only the people and months the report is about

**Change:** 133-reports-load-only-what-is-asked · **Created:** 2026-11-16

## Problem

A report for one person built the whole group's report first (hours, leave and FTE for everyone, twelve months back, plus the delivery pulse) and then threw everyone but that person away. That wastes work (about 140 times too much at 140 people), loads other people's hours for nothing, and gave a person's report the team's 12-month trend instead of their own. Twelve months of data is needed only for the 12-month graph.

## Mock Delta

No new screen. A report about named people shows their own 12-month trend, and a report that does not ask for the trend does not read twelve months. See [`133-reports-load-only-what-is-asked`](../../mock/index.html#133-reports-load-only-what-is-asked).

## Acceptance Criteria

1. **AC-1** For a report about named people, only those people's hours, leave and FTE are read from the database. The names are settled first among the people HR lets the reader see, each to exactly one person, or the report is refused naming the name, as before.
2. **AC-2** A project report reads only the people the project has planned that month.
3. **AC-3** Only the data the report's sections need is built: twelve months of hours only with the `trend` section, the rest-of-month availability only with `availability`, the delivery pulse only with `projects`, `allocation`, `capacity` or `leave`. A report of `utilisation` alone reads only that month.
4. **AC-4** The numbers for a person are the page's numbers: available, logged, billable and utilisation equal the Reports page's row for them. The team report is unchanged.
5. **AC-5** A report about named people has their own trend ("utilisation of Nimal Silva"), and for several people their combined trend, not the team's.
6. **AC-6** The Reports page itself loads everything as before.

## Tasks

- [x] `T1` — The loader and the report builder take a list of people and the parts to build (AC-1, AC-3, AC-6)
  Files: modules/reports/server/inputs.ts, server/view.ts
- [x] `T2` — The export settles the names first and asks only for what its sections need (AC-1, AC-2, AC-3, AC-4, AC-5)
  Files: modules/reports/server/export-data.ts, server/sections-people.ts, tests/export.test.ts

## Verify

**Verdict:** PASS

- AC-1: pass — `loadInputs` takes a set of person ids and `hoursIn` filters the SQL to their users; the export resolves names against HR's list first. On the real database: "Nimal + Nobody Here" is still refused naming "Nobody Here"; the existing refusal tests pass.
- AC-2: pass in code and by the existing project test (Fleet Tracker report keeps only that project's people and hours).
- AC-3: pass — a test shows a `utilisation`-only report has no trend, availability or pulse data; on the real database it built in 124 ms against 311 ms with the trend. The real database has only 4 people, so the saving at 140 people was not measured.
- AC-4: pass — a test compares Nimal's available, logged, billable and utilisation with the page's row, and the old team-numbers test still passes.
- AC-5: pass — on the real database Nimal's trend runs 72% to 92% ("utilisation of Nimal Silva"), Nimal and Kasun together 72% to 90%, and the team report is unchanged (72% to 84%). A test checks the last point equals his utilisation.
- AC-6: pass — `getReport` defaults to all parts, so the page is unchanged; its tests pass.

Type-check clean. Reports tests: 27 of 27 pass (two older checks were changed to pass the sections they use, as the real report does). Not run: the browser spec. A project's logged hours per person remain unavailable, as Time returns them as a total per project. Behaviour change: a name that matches two people HR lets the reader see is now refused as ambiguous even if only one has hours.

