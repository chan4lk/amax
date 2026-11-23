# Time opens your own week first

**Change:** 085-time-my-week-first · **Created:** 2026-11-05 · **Review:** covered-by 081-proposals-end-to-end

## Problem

Opening Time (`/time`) always shows **Team time**. An engineer has no one's time to review, so they land on an empty
team page ("No timesheets come to you this week") and need a second click to reach their own timesheet. That's the page
they open Time for.

**Decided by the product owner, 2026-11-05:** anyone with nobody to review lands on My timesheet for the current week.
The alternative, engineers only by role, was not chosen.

## Mock Delta

What changes on screen, and where to see it: [`085-time-my-week-first`](../../mock/index.html#085-time-my-week-first)

No new screen. `/time` goes straight to My timesheet, this week, for people with nobody to review. Team time is
unchanged for those who review time.

## Acceptance Criteria

1. **AC-1** Opening `/time` sends a person to **My timesheet for the current week** (`/time/my`, their own local week)
   when they review nobody's time. That means all of these hold:
   - they don't have Time's team view (`time:team`: Leadership, Finance);
   - they can't approve time tenant-wide (Admin);
   - they manage no project whose time they may approve;
   - they have no reports whose time they may approve.
   - **The current week, not the latest with a timesheet** (found by the product owner, 2026-11-05). An engineer landed on
     a timesheet two weeks old: with no week asked for, My timesheet opened the person's latest week that has a
     timesheet. It now opens their current week in their legal entity's time zone, the day Time logs by.
2. **AC-2** Everyone who reviews time still opens **Team time** at `/time`: a PM managing projects, a manager with
   reports, Leadership, Finance and Admin.
   - **Same rule for everyone:** an engineer who manages a project (FLT's manager in the demo data) also opens Team time.
   - **Linked weeks are untouched:** a week link (`/time/w/<week>`) and the Team time tab always open Team time.
3. **AC-3** Tests:
   - **Units:** the rule for an engineer, a PM, Leadership and Admin.
   - **Redirect:** `/time` redirects an engineer and doesn't redirect a PM.
   - The Time suites stay green.

## Tasks

- [x] `T1` — `/time` sends people with nobody to review to My timesheet, this week; reviewers keep Team time (AC-1 to AC-3)
  Files: modules/time/ui/TeamPage.tsx, modules/time/ui/parts.tsx, modules/time/server/landing.ts, modules/time/server/my.ts, modules/time/tests/landing-085.test.ts

## Verify

**Windows host, local Postgres** (2026-11-05):
- **New tests:** `landing-085`, 3 of 3, including the current week.
- **Time suite:** 49 files, 227 tests, all pass before the current-week fix. After it, a full parallel run had files fail
  on the shared test Postgres. Each passes alone, and `grid-perf` (the known 2 s timing test) only misses under load.
- **Type check:** `@amax/time` passes.

The Team tab links to `/time?view=team` when it has no week, so from Requests it still opens Team time for someone
whose Time opens on their own week.

Not yet run in the Linux CI replica. Review loop: not run.

**Review (2026-11-07):** covered by 081-proposals-end-to-end's loop over the whole stack against `upstream/main`. Its final
pass (round 6) ran at `0bbdd63c`, after this change's commits, with 0 blockers. It stopped at the five-pass cap with two
081 majors open; none is in this change's files. See 081's `## Verify`. **Linux replica of CI** over `0bbdd63c`: every
step passes (35/35 packages, e2e 9, e2e:auth 95).
