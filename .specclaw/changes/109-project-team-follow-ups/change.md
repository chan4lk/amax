# Project team follow-ups: standing allocations end cleanly, keep hand removals, and a month or range stays one

**Change:** 109-project-team-follow-ups · **Created:** 2026-11-15 · **Review:** change

**Builds on:** 107-project-team (its four majors open at the pass-5 cap, in its `follow-ups.md`, round 5).

## Problem

107's review stopped at the five-pass cap with four majors open. A standing allocation the monthly job ends (the person
left, or the project closed) keeps the months it already wrote, up to a year ahead. The Add to project card turns a
request for one month or a range into "until further notice" on an internal project, and can't keep a range at all.
Re-setting a standing allocation brings back months removed by hand. And add_person decides a new person's join date
in the entity's time zone but their status in UTC, so near midnight UTC they can be stored as joining and missing from
the card's picks.

## Mock Delta

What changes on screen, and where to see it: [`109-project-team-follow-ups`](../../mock/index.html#109-project-team-follow-ups)

On the Add to project card: a request for "March to May" shows a **Through** field (May) and **This month** preselected,
so the button reads "Add Dinesh to NWP, Mar–May"; a request naming one month preselects **This month** even on an
internal project. Nothing else on screen changes.

## Acceptance Criteria

1. **AC-1** When the monthly job ends a standing allocation because its person is no longer active or joining, or its
   project is no longer active, it removes the month rows that allocation wrote from the end month on, as ending it by
   hand does (one rule, `setStanding` with percent 0). Rows set by hand stay.
2. **AC-2** Re-setting a standing allocation (a new percent or start month) keeps every month removed by hand from the
   new start on: the old row's removals carry into the new one, and its months are not written again.
3. **AC-3** The Add to project card preselects **Until further notice** on an internal project only when the request
   named no month and no end month; a request with one month preselects **This month**.
4. **AC-4** A request with a range (`month` and `through`) keeps it: the card shows a **Through** field filled with the
   end month, the button names the range, and confirming allocates those months. "Until further notice" with a Through
   month is refused next to the field.
5. **AC-5** add_person decides both the default join date and the joining/active status from one date: today in the
   entity's own time zone. Someone added today, at any hour, is active, and the card's picks show them at once.

## Tasks

- [x] `T1` — The Add to project card keeps a month or a range: Until further notice is preselected on an internal project
  only when no month and no end month were named; a range shows a Through field and the button names it ("…, Mar–May");
  Until further notice with a Through month is refused next to Through (AC-3, AC-4)
  Files: modules/allocations/server/add-card.ts, modules/allocations/server/services.ts,
  modules/allocations/tests/add-card-109.test.ts
- [x] `T2` — One way to end a standing allocation: the monthly job ends one whose person or project stopped through
  `setStanding` (percent 0), removing the months it wrote from then on; a re-set carries the old row's hand removals
  (`skip`, from the new start on) into the new row, and `fill` leaves them out (AC-1, AC-2)
  Files: modules/allocations/server/standing.ts, modules/allocations/server/standing-jobs.ts,
  modules/allocations/tests/standing-109.test.ts
- [x] `T3` — One today for add_person: the default join date and the joining/active status both come from today in the
  entity's time zone, decided in addPerson (AC-5)
  Files: modules/hr/server/services.ts, modules/hr/server/add-person-card.ts, modules/hr/mcp.ts,
  modules/hr/tests/add-person-today-109.test.ts
- [x] `T4` — End to end: "add Dinesh to TMT from March to May" shows the Through field and This month, and confirms
  those months (AC-4)
  Files: apps/web/tests/e2e/project-team.spec.ts, packages/ai/src/scripted-writes.ts
  Depends: T1

## Verify

<!-- Filled by verify: a **Verdict:** PASS|FAIL line, then one `- AC-n: pass|fail — evidence`
     line per criterion, quality before → after, preset check, and screenshot paths
     (or "compared by eye: <who>"). -->

**Verdict:** PASS — every AC passes below. The review stopped at the five-pass cap (AGENTS.md) with 0 blockers and 2
majors open, both for 110 (HR's one today beyond add_person, leavers and the status job).

- AC-1: pass — `standing-109.test.ts` AC1 table (a leaver, a closed project: the months the job wrote from next month go,
  a month set by hand stays); the end-path table (the monthly job and the real `hr.person.left` handler) keeps the removed
  rows and ended standing in the audit and sends the hand end's `allocations.allocation.set` (no months, 0 %, standing).
- AC-2: pass — `standing-109.test.ts` AC2 table (a new percent from the same start, a later start: hand removals stay).
- AC-3: pass — `add-card-109.test.ts` AC3 table (no month: Until further notice; one month or a range: This month).
- AC-4: pass — `add-card-109.test.ts` AC4 (Through shown, button `Add {person} to INT, {through}`, Until further notice
  with Through refused on `through`, the three months written) and the done-line table (an edited Through or Percent; a
  range into the next year names both years); `apps/web/tests/card-month-109.test.ts` (the button follows Through: Mar–May,
  Mar 2027–Jan 2028, 13 months, a day given, half typed, cleared); e2e `project-team.spec.ts` (Through, This month, the
  button following an edit, March to May written); screenshots.
- AC-5: pass — `add-person-today-109.test.ts`: Sri Lanka and Sydney at 20:00 UTC join on their own today and are active;
  an explicit join date on the entity's today is active, its tomorrow joining; leavers and the hourly status job decide by
  the entity's today; an entity with no zone is refused (card note, add_person) and left unmoved by the job.

Commands: hr (69), allocations (78), notifications (15), web unit (360 with the database) suites pass; type checks
(`tsc --noEmit`, the repo's lint) exit 0 for core, testing, workflows, hr, allocations, web; `check:graph` exit 0. This
host's known failures only: time `grid-perf` (passes alone), delivery `releases` (backslash paths), testing `ac7-config`
(symlinks), workflows `kill` (`spawn npx`). e2e on `next dev` with the e2e database: `project-team`, `set-up-project*`,
`notifications`, `retention` pass (the bell test passed alone after a first-compile timeout). `specclaw-verify size`:
71 production lines against 107's head (`ebcd841d`), cap 400, exit 0. `specclaw-preset-check .`: exit 0. Screenshots:
`shots/app.png`, `shots/app-range-card.png` (Through edited to 2028-01: "Mar 2027–Jan 2028"), `shots/app-range-card-dark.png`,
`shots/mock.png`.

Quality: not_run (specclaw-quality-scan: jq "Argument list too long" on this Windows host)

Review: OPEN — 5 rounds, final pass missing, models opus/opus; last round 0/1/5 b/M/m; fix proof not proven: no
review.test_command configured. Stopped at the five-pass cap: rounds 1–3 and two final passes (rounds 4 and 5); round 4
escalated on HR's second today and the product owner chose to fix the year-crossing range here and move that class to 110.
Open majors, for 110: `change_person`'s default effective date and its same-day check, and HR's in-force reads, still use
UTC's today (pre-existing); the hourly status job reports success while an entity with no zone is skipped (only in its
audit). Open minors in `follow-ups.md`: the end's `by` loses whom the standing was set for; a Through before the start
reads as a forward range until the field check; `zoneNote` catches more than the entity lookup's refusals; `linkNote`'s
comment; the done-line test calls the card, not the confirm path.
