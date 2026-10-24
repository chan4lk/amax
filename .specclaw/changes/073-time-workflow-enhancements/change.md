# Time workflow: weekend hours, daily and scheduled reminders, ThisWeek capacity, approval checks

**Change:** 073-time-workflow-enhancements · **Created:** 2026-10-22 · **Updated:** 2026-10-24 · **Builds on:** 070, 071, 072
(branch `specclaw/073-time-workflow-enhancements`, stacked on `specclaw/072-time-consumers-sync`)

## Problem

Only Monday to Friday can be logged, so weekend work and its overtime have no record (TIM-E02). Weekend commits become
suggestions that can never be accepted (TIM-B07). Reminders only happen when an approver presses Remind (TIM-E03). The
ThisWeek card assumes 40 h per person and has no pins on its project rows (TIM-B13). Evidence is in
[`../070-time-entry-corrections/audit.md`](../070-time-entry-corrections/audit.md).

**Update, 2026-10-24.** Rebased on 070 to 072 as built.
- **Migration number:** this change uses `0007`.
- **Reminder scope:** reminders follow 071's entity scope.
- **Reuse:** missing days and each person's local date come from 072's weekly utilisation.

The product owner moved the Team grid (FR-1) to its own change, 074. From the Time page requirements, 073 adds:
- **Reminders:**
  - Reminders are per week only, so nobody can be chased for a single missing day (FR-3.2).
  - A reminder carries no message (FR-3.3) and doesn't point to the day (FR-3.5).
  - Nothing runs on a daily schedule (FR-3.6).
  - Nobody sees who was last reminded, so the same person can be reminded again minutes later (FR-3.7).
- **Approvals:**
  - Submitting a week with missing working days gives no warning (FR-4.1).
  - "Approve all" also approves weeks that need a closer look: over 60 h, a day over 14 h, or missing days (FR-4.4).

**Amendment 1, 2026-10-24** (product owner: "add it in 073"; the Team grid was going to be change 074). From the
requirements' FR-1: Team time's table shows hours but not whether a day is missing, low, on target or over. It has no
summary of the team's week, no utilisation column, no filters or sorting, and no daily totals row. A day's project
breakdown and a member's own timesheet take a chat question. There's no way to jump to a date's week, and people
with no timesheet that week don't appear at all. AC-13 to AC-24 cover these.

## Mock Delta

What changes on screen, and where to see it: [`073-time-workflow-enhancements`](../../mock/index.html#073-time-workflow-enhancements)

- **My timesheet and Team time:**
  - **Sat** and **Sun** columns appear only for a week with weekend hours, marked "weekend".
  - A link from a day reminder marks that day's column ("Missing: Tue Oct 20").
- **ThisWeek:** reads "118.5 h of 176 h allocated" (from Allocations), and each project row has a pin. With no
  allocation data: "118.5 h logged · allocation unknown".
- **Team time rows:** show the last reminder ("Reminded 2 h ago by Maya Fernando").
- **Chat (approver), "Remind everyone who hasn't logged today":**
  - One card: "Remind 3 people to log Tue Oct 20", one line per person, and the message (default "Please update your
    hours for today.").
  - Anyone reminded in the last 4 hours is marked "reminded 1 h ago".
  - People on approved leave that day are left out.
- **Bell:**
  - "Log your hours for Tue Oct 20", with the message, linking to that day.
  - On Monday morning, local time: "Reminder: submit your timesheet for 2026-W42".
- **Chat (Admin):** "Remind people at 16:00 on working days who haven't logged" gives a settings card. A PM can switch
  it off for a project they manage.
- **Chat, submit:** the card warns "Missing: Fri Oct 16" and still submits.
- **Chat, approve all:** "Approve 3 timesheets (2 skipped: Kasun Dias, a day over 14 h; Dinesh Wickrama, missing
  Fri Oct 16)".

Amendment 1 ([`#073-amendment-1`](../../mock/index.html#073-amendment-1)), Team time:
- **Summary strip:** above the grid, four pinnable stats: "141.5 h logged", "59% average utilisation", "5 people
  with missing days", "3 timesheets to approve".
- **Toolbar:** project, team and status filters, a date picker beside the week arrows, and sortable column headers.
- **Grid:** each day cell is coloured and labelled: ✕ Missing, ▲ Low, ✓ On target, ● Over, or "–" Not yet. Hovering,
  focusing or tapping a cell lists its hours by project.
- **New columns and rows:** a Utilisation column with a progress bar, a footer row of daily team totals, and rows
  for people with no timesheet yet ("Not started").
- **Member's timesheet:** a name opens that person's week as a read-only screen.

## Acceptance Criteria

**Weekend hours (TIM-E02, TIM-B07)**

1. **AC-1** `log_time` takes Saturday or Sunday only with `weekend: true`. Without it, the error says to confirm weekend
   work.
   - Weekend entries belong to the same ISO week, so they count everywhere the week's hours do: `weekTotals` (and so
     Payroll overtime), `projectHours`, approvals, the submit payload, Reports' hours, and 072's weekly utilisation.
   - They show as weekend days on My timesheet and Team time.
   - Validation, permissions, audit and events are the same as for weekday entries, and so are 071's rules.
   - Weekend days are never "missing".
2. **AC-2** A weekend commit drafts a suggestion that says "weekend". Accepting it logs with `weekend: true` (TIM-B07).

**Reminders (TIM-E03, FR-3)**

3. **AC-3** `remind_missing` (Team time, approvers; FR-3.2, FR-3.3, FR-3.5): for one working day (today or an earlier
   weekday), everyone the viewer is responsible for (D2) who has no live hours that day.
   - **Who's skipped:** anyone on approved leave that day, and anyone who has already logged.
   - **The card:** one card, "Remind {n} people to log {Tue Oct 20}", one line per person, and an optional message
     (default "Please update your hours for today.").
   - **On confirm:** each person gets `time.day.reminded`, and a result per person: `sent`, `skipped` (logged since,
     on leave, out of scope) or `failed`.
   - **The bell:** "Log your hours for {Tue Oct 20}", with the message as the body, linking to `/time/my/{week}?day={day}`.
     My timesheet marks that day's column.
   - **`remind_week`:** gains the same optional message (additive).
4. **AC-4** Every reminder is recorded and visible (FR-3.7, FR-3.10).
   - **What's stored:** each reminder (week or day, manual or automatic) in `time.reminder` (migration `0007`):
     sender, recipient, kind, week or day, message and time. Its delivery result is notifications' existing delivery
     record.
   - **Team time:** each row shows the last reminder ("Reminded 2 h ago by Maya Fernando").
   - **Repeat warning:** a reminder card for someone reminded in the last 4 hours adds "reminded {1 h} ago by {name}".
     The card is the confirmation; nothing is refused.
5. **AC-5** Automatic daily reminder (FR-3.6), off by default.
   - **Setting it:** an Admin sets `dailyReminderAt` (HH:MM) through 071's settings tools.
   - **What runs:** a schedule (workflows, `timezone: "entity"`) at that local time, Monday to Friday, reminds everyone
     in the entity with no hours that day and not on approved leave. Each reminder comes from
     `system:time.reminders` and is recorded as in AC-4.
   - **PM switch:** a PM can switch it off or on for a project they manage (`set_project_reminders`). Someone whose
     recent projects (time or allocation in the last 4 weeks) are all switched off isn't reminded.
   - **Retry-safe:** one automatic reminder per person and day (unique in `time.reminder`), so a retried slot sends
     nothing twice.
6. **AC-6** Weekly reminder (the original AC-3 to AC-5).
   - **What runs:** a schedule `time.draft-reminders` (Monday 09:00, entity local) reminds everyone whose previous ISO
     week is still draft or rejected with hours logged.
   - **Retry-safe:** one per week and slot, and a manual `remind_week` still works alongside it.
   - **Fails closed:** an entity with no time zone isn't reminded.
   - **TIM-T03:** `Asia/Colombo` and `Australia/Perth` each fire at their own 09:00.
7. **AC-7** No weekend reminders (FR-3.8). `remind_missing` refuses Saturday and Sunday, both schedules run Monday to
   Friday only, and approved leave is always skipped. Public holidays: see D5.

**ThisWeek (TIM-B13)**

8. **AC-8** ThisWeek's capacity and pins.
   - **Pins:** each project row has a `PinButton` that resolves through `get_team_week` to that project's hours.
   - **Capacity:** taken from Allocations' `personMonthTotals`: percent × each person's weekly target (072; 40 h unless
     set) × the week's working days ÷ 5, for each person on the card.
   - **No allocation data:** with Allocations not installed or not readable, the card says "allocation unknown"
     rather than assuming 40 h.

**Approval checks (FR-4.1, FR-4.4)**

9. **AC-9** Submitting with missing working days (FR-4.1).
   - **The card:** `submit_week`'s card adds "Missing: {Fri Oct 16}" for working days up to the person's local today
     (or the whole week, once it's over) that have no hours and no approved leave.
   - **The result:** submitting still works, and the result lists the missing days.
   - **Unchanged:** a week with no entries is still refused.
10. **AC-10** Anomalies stay out of "approve all" (FR-4.4).
    - **What's flagged:** a submitted week with over 60 h, a day over 14 h, or missing working days.
    - **`approve_weeks`:** skips it ("needs individual review: a day over 14 h").
    - **`approve_week`:** its card shows the same flag, and approving one at a time still works.
    - **`get_team_week`:** rows gain `anomalies` (additive).

**Tests and docs**

11. **AC-11** Tests (DB-backed, none skipped):
    - weekend logging and the weekend commit draft;
    - `remind_missing`: scope, leave and already-logged skips, the message, the 4-hour warning;
    - the reminder record and Team time's last-reminder line;
    - the automatic daily slot: on and off, a PM's project switch, retry-safe;
    - the weekly slot in two zones (TIM-T03);
    - no weekend reminders;
    - ThisWeek with and without Allocations;
    - the submit warning;
    - anomaly skips in `approve_weeks`;
    - axe on the weekend columns, light and dark.
12. **AC-12** A live run with the real model:
    - an approver reminds everyone who hasn't logged today;
    - an Admin turns on the 16:00 reminder;
    - Kasun submits a week with a missing day;
    - Maya approves all, with an anomaly skipped.

    README updated. `check:graph` passes, and the time e2e passes. Every existing test passes unmodified, except where
    D6 lists an intended change.

**Amendment 1, 2026-10-24: the Team grid (FR-1).** Read-only controls only (filters, sort, the date picker); every
stat and row keeps a pin (AGENTS.md rules 1 and 2). It changes Team time's table as listed under D11 and adds to it;
nothing else changes.

13. **AC-13** Cell states (FR-1, NFR usability). Each day cell on Team time shows its hours and one state:

    | State | Rule | Colour |
    |---|---|---|
    | Missing | A working day before the person's local today, with no hours and no approved leave | red |
    | Low | A working day, below 75% of the person's daily target | amber |
    | On target | 75% to 112.5% of the daily target | green |
    | Over | Above 112.5% of the daily target | purple |
    | Not yet | A day still to come, a weekend day without hours, or approved leave | grey |

    The daily target is the person's weekly target (072) ÷ 5, so a 40 h week gives exactly the requirements' 6 h and
    9 h. Every cell has a visible icon and an accessible name, e.g. "Tue Oct 13: 3.0 h, low". Colour is never the only
    signal, and contrast meets WCAG AA in light and dark.
14. **AC-14** Summary strip (FR-1.2): four stats above the grid, each pinnable (resolving through `get_team_week`):
    - total team hours;
    - average weekly utilisation % (072);
    - how many people have missing days;
    - how many timesheets are waiting for the viewer's approval.
15. **AC-15** Utilisation column (FR-1.3): each row shows 072's weekly utilisation % against the person's target,
    with a progress bar. Above 100% is shown as is and marked overtime.
16. **AC-16** Filters (FR-1.4):
    - project;
    - team (the HR department, shown only when HR is installed);
    - status: Not submitted (draft or not started), Submitted, Approved, Rejected.

    They're URL query parameters set by read-only controls. A project filter recalculates every figure from that
    project's hours alone: cells, totals, utilisation, the summary strip and the footer. Who appears is still 071's
    scope.
17. **AC-17** Day breakdown (FR-1.5): hovering, focusing or tapping a day cell shows that person's hours by project
    for that day. It works by keyboard and touch, and screen readers announce it.
18. **AC-18** Member's timesheet (FR-1.6): a person's name links to `/time/w/{week}/p/{weekId}`.
    - It's a read-only screen of that week: hours by project and day, the status, and the decision and comment.
    - It has the same scope as `get_timesheet`, its rows are pinnable, and chat suggestions do the actions.
    - A week the viewer can't see gives the same "not found" as a missing one.
19. **AC-19** Footer row (FR-1.7): daily team totals under the grid, and the week's total.
20. **AC-20** Sort (FR-1.8): column headers sort by name, total or utilisation, ascending or descending, through
    links. One click brings the lowest loggers to the top.
21. **AC-21** Week picker (FR-1.1): beside the week arrows, a date input opens the week containing the chosen date.
    It's navigation only.
22. **AC-22** People with no timesheet yet (D9): people the viewer is responsible for (073's D2 helper) who have no
    week that week appear as "Not started" rows. Their past working days show Missing, and they show under the "Not
    submitted" filter. Nobody outside the viewer's scope appears.
23. **AC-23** Performance (FR-1.9): Team time's data for 100 people, each with a week of entries, loads in under 2
    seconds on the server. Reads are batched rather than run per person. A test seeds 100 people and times it.
24. **AC-24** Tests:
    - DB-backed: cell states at 40 h and 24 h targets, leave, future days, weekends; summary figures; filters,
      including a project filter's recalculation; sort; "Not started" rows; the member screen's scope; performance.
    - e2e: the grid and the member screen, with axe in light and dark and at phone width.
    - The 009 AC3 mock comparison still passes.
    - A live run on the dev server; the README.

## Scope

- **In `modules/time/`:**
  - Server: `server/log.ts` (`weekend`), `week.ts`, `server/my.ts`, `server/team.ts`, a new `server/reminders.ts` and
    `server/schedules.ts`, `server/decide.ts` (message), `server/bulk.ts` and `bulk-card.ts` (anomalies),
    `server/submit.ts` and `week-card.ts` (missing days), `server/settings.ts` (`dailyReminderAt`).
  - Manifest and wiring: `suggestions.ts`, `mcp.ts`, `chat.ts`, `chat-suggestions.ts`, `module.ts` (schedules,
    rules, payloads).
  - UI: `ui/*` (weekend columns, marked day, last reminder, ThisWeek).
  - Migration `0007_reminders.sql`, tests, README.
- **Outside:** none. Allocations and Leave are read through their contracts; notifications delivers the new rule as it
  does the others.
- **Not here:**
  - The Team grid (FR-1: cell colours, summary strip, Utilisation column, filters, sort, day breakdown, totals row,
    week picker) is change **074**.
  - Slack or Teams reminders, and holiday awareness (D5).

- **Amendment 1:**
  - In `modules/time/`: `ui/Timesheets.tsx` (the grid), new `ui/Summary.tsx`, `ui/Filters.tsx`, `ui/DayCell.tsx`
    (client) and `ui/SheetPage.tsx`, `ui/TeamPage.tsx`, `ui/parts.tsx`, `ui/time.css`; `server/team.ts` (states,
    filters, sort, batching), `server/utilisation.ts`, `module.ts` (the member route), tests.
  - Outside: HR is read through `@amax/hr/contracts` (`listPeople` for departments).

## Decisions

Approved by the product owner, 2026-10-24 ("approve"): the recommended option of each, D1–D6. The Team grid (FR-1) is change 074.

- **D1 Weekend semantics.** *Recommended:* weekend hours are ordinary hours in the same ISO week. They count toward the
  40 h overtime threshold, utilisation and billing. Overtime *classification* (a weekend rate) stays out (TIM-N02).
- **D2 Who is expected to log**, for "remind all missing" and the daily reminder. People with no hours that day have no
  week row, so Time needs a list of who to expect. *Recommended:* active people who can log time and are, for the
  viewer:
  - their reports;
  - people with time or an allocation on a project they manage in the last 4 weeks;
  - for Admins and `time:team`, everyone in their legal entities.

  The daily schedule uses everyone in the entity with time or an allocation in the last 4 weeks.
- **D3 Capacity formula.** *Recommended:* percent × the person's weekly target × the week's working days ÷ 5.
- **D4 Times.** *Recommended:* the weekly reminder at Monday 09:00 for the week before, and the daily reminder off until
  an Admin sets a time.
- **D5 Public holidays.** Time can't see the holiday calendar; it's Reports' own table. *Recommended:* skip weekends
  and approved leave now, and add holidays when the calendar is shared through a contract (a small follow-up).
- **D6 Behaviour that changes** (the product owner's "no existing feature altered", as in 071 and 072):
  - `log_time`'s weekend refusal message now offers `weekend: true`.
  - `approve_weeks` (070) skips anomalous weeks.

  Everything else is additive: messages, records, schedules off by default, card warnings, `anomalies`.
  *Recommended:* accept both, listed under Verify.

**Amendment 1, approved by the product owner 2026-10-24 ("approve"): the recommended option of each, D7–D11.**

- **D7 Team.** The HR department as of the week's Monday. Without HR, there's no team filter.
- **D8 Cell thresholds.** Scale with the person's target: daily target = weekly target ÷ 5; Low below 75%, Over
  above 112.5%. That's 6 h and 9 h at 40 h, as the requirements say, and fair to part-time staff.
- **D9 People with no timesheet.** Show them as "Not started" rows (073's D2 decides who), so gaps show without a
  drill-down. This changes which rows Team time shows.
- **D10 Member screen.** A new read-only route, `/time/w/{week}/p/{weekId}`. Its actions are chat suggestions, not
  buttons.
- **D11 What changes on Team time:**
  - The Timesheets table is restyled: coloured cells, a Utilisation column, a footer row.
  - Rows sort by name by default (today they follow creation order).
  - "Not started" rows appear (D9).

  The chart, ThisWeek, change requests, row actions and pins stay. Listed under Verify.

## Tasks

<!-- UI first, then backend, then integration. Reminders go through one service per kind (week, day), each recorded in
     time.reminder; schedules follow compliance's pattern (`schedules` in the manifest, `timezone: "entity"`). Who is
     expected to log (D2) is one helper used by remind_missing and the daily slot. -->

- [x] `T1` — Screens: Sat and Sun columns only for a week with weekend hours; the day a reminder links to marked "Missing"; the last-reminder line on Team time rows; ThisWeek capacity from Allocations and targets, with row pins (AC-1 UI, AC-3 UI, AC-4 UI, AC-8)
  Files: modules/time/ui/MyPage.tsx, modules/time/ui/Timesheets.tsx, modules/time/ui/ThisWeek.tsx, modules/time/ui/parts.tsx, modules/time/ui/time.css, modules/time/server/my.ts, modules/time/server/team.ts, modules/time/server/capacity.ts, modules/time/tests/screens-073.test.ts
- [x] `T2` — Weekend hours: `weekend: true` through `log_time`, its card and chat; weekend days in `workDays`-based reads where hours exist; weekend commit drafts (AC-1, AC-2)
  Files: modules/time/server/guards.ts, modules/time/server/log.ts, modules/time/week.ts, modules/time/server/entry-card.ts, modules/time/mcp.ts, modules/time/chat.ts, modules/time/suggestions.ts, modules/time/tests/weekend.test.ts
  Depends: T1
- [x] `T3` — Migration `0007_reminders.sql` (`time.reminder`, `daily_reminder_at`, `time.project_reminder`); `remind_missing` with the expected-people helper (D2), leave and logged skips, message, `time.day.reminded` and its rule; `remind_week` message; the reminder record; the 4-hour line on cards; weekends refused (AC-3, AC-4, AC-7)
  Files: modules/time/db/migrations/0007_reminders.sql, modules/time/server/expected.ts, modules/time/server/reminders.ts, modules/time/server/decide.ts, modules/time/server/bulk-card.ts, modules/time/mcp-reminders.ts, modules/time/mcp.ts, modules/time/contracts.ts, modules/time/module.ts, modules/time/tests/reminders.test.ts
  Depends: T1
- [x] `T4` — Schedules: the daily reminder (`dailyReminderAt` in settings, PM `set_project_reminders`, one per person and day) and the weekly Monday reminder, both entity-zoned, weekdays only, retry-safe (AC-5, AC-6, AC-7)
  Files: modules/time/server/schedules.ts, modules/time/server/settings.ts, modules/time/server/rules.ts, modules/time/mcp-settings.ts, modules/time/module.ts, modules/time/tests/schedules.test.ts
  Depends: T3
- [x] `T5` — Approval checks: missing days on the submit card and result; anomalies (over 60 h, a day over 14 h, missing days) on `get_team_week` rows, the approve card, and skipped by `approve_weeks` (AC-9, AC-10)
  Files: modules/time/server/anomalies.ts, modules/time/server/submit.ts, modules/time/server/week-card.ts, modules/time/server/bulk.ts, modules/time/server/bulk-card.ts, modules/time/server/team.ts, modules/time/tests/approval-checks.test.ts
  Depends: T1
- [x] `T6` — Integration: full suites, time e2e with axe on the weekend columns (light and dark), live run with the real model, README, intended changes listed under Verify (AC-11, AC-12)
  Files: modules/time/tests/e2e/time.spec.ts, modules/time/README.md
  Depends: T2, T3, T4, T5

<!-- Amendment 1 (AC-13–AC-24): UI first, then the data behind it, then integration. Team time's data is computed once
     per request in batches (no per-person queries); the grid, summary and filters read from that one shape. -->

- [x] `T7` — Screens: the grid's coloured and labelled cells with the day breakdown (client cell), the summary strip, the Utilisation column, the footer row, filters, sortable headers and the date picker; the member's timesheet screen and its route (AC-13 UI, AC-14, AC-15, AC-16 UI, AC-17, AC-18 UI, AC-19, AC-20 UI, AC-21)
  Files: modules/time/ui/Timesheets.tsx, modules/time/ui/DayCell.tsx, modules/time/ui/Summary.tsx, modules/time/ui/Filters.tsx, modules/time/ui/SheetPage.tsx, modules/time/ui/TeamPage.tsx, modules/time/ui/parts.tsx, modules/time/ui/time.css, modules/time/module.ts, modules/time/tests/grid-ui.test.ts
- [x] `T8` — Data: per-cell state (daily target from 072, leave, local today), per-day project breakdown, weekly utilisation and summary on `teamWeek`; filters (project recalculating every figure, HR department, status), sort, "Not started" rows for expected people; the member sheet read; batched reads (AC-13, AC-16, AC-18, AC-20, AC-22)
  Files: modules/time/server/team.ts, modules/time/server/grid.ts, modules/time/server/sheet.ts, modules/time/server/utilisation.ts, modules/time/mcp.ts, modules/time/tests/grid.test.ts
  Depends: T7
- [x] `T9` — Performance: 100 people with a week of entries in under 2 s on the server; batch whatever the timing shows (AC-23)
  Files: modules/time/server/team.ts, modules/time/server/grid.ts, modules/time/server/capacity.ts, modules/time/tests/grid-perf.test.ts
  Depends: T8
- [x] `T10` — Integration: e2e for the grid and the member screen with axe (light, dark, phone width), the 009 AC3 mock comparison, live check on the dev server, README (AC-24)
  Files: modules/time/tests/e2e/time.spec.ts, modules/time/README.md
  Depends: T8, T9

## Verify

**Verdict:** PASS

Verified 2026-10-24 at `9b6411f` plus the chart fix below (branch `specclaw/073-time-workflow-enhancements`, stacked on 072's `75d420b`), Windows 11, `DATABASE_MIGRATE_URL=postgres://amax:amax@127.0.0.1:5440/amax`. Every AC passes. The specclaw gates don't run clean on this host (see Gates); the product owner chose, on 2026-10-24, to record PASS with them noted, as for 070 to 072.

- AC-1: pass — `modules/time/tests/weekend.test.ts` AC1: a Saturday without `weekend` is refused "is a weekend; to log weekend work, confirm it (weekend: true)", with it logs; the week shows 7 days, totals 12 h in `get_my_week` and `weekTotals`, submits 12 h; weekend days never in `missingDays`. `screens-073.test.ts` AC1: 5 days until a weekend entry, then 7. Live: card "Log 3 h to Fleet Tracker, Sat Oct 24 (weekend)"; My timesheet headers "Sat weekend", "Sun weekend" (`shots/app.png`, `app-dark.png`), axe clean.
- AC-2: pass — weekend.test AC2: a Sunday commit's suggestion "Add 2 h on CON for 2026-10-25 (weekend)" with "weekend work" in the detail; accepting it logs 2 h on that Sunday.
- AC-3: pass — `reminders.test.ts` AC3: Maya's card lists Nimal, Tharushi and Dinesh, leaves out Kasun (logged) and Ravi (never logs time), skips Ayesha "on approved leave", carries the default message; confirming for Dinesh and Kasun gives sent / skipped "already logged"; the event has "Fri Oct 16", 2026-W42 and the message; the rule `time.day-reminded` links to `/time/my/{week}?day={day}`. My timesheet marks that column "Missing" (`shots/app.png`). Live: "Remind 5 people to log Fri Oct 23" (`shots/live-remind-missing.png`).
- AC-4: pass — reminders.test AC4: the reminder recorded (kind, day, message, sender "Maya Fernando"); the next card marks Dinesh "reminded {n} min ago by Maya Fernando"; `remind_week` with a message is recorded and its card has the Note line. `screens-073.test.ts` AC4: a Team time row carries the latest reminder. Live: rows "Reminded 11 min ago by Maya Fernando" (`shots/app-team.png`).
- AC-5: pass — `schedules.test.ts` AC5: off by default; at 16:00 Colombo time it waits before and sends after, once (a later run sends 0), never on a Saturday; a PM can't switch a project they don't manage; with Dinesh's projects switched off he isn't reminded; switched back off, nothing. Live: card "Daily reminder · off → 16:00 on working days, for people with no hours that day", confirmed (`shots/live-daily-setting.png`), reset afterwards.
- AC-6: pass — schedules.test AC6: Monday 2026-10-26 reminds last week's (2026-W43) drafts in Lumen Labs Lanka and in the Australian entity separately (Tharushi, Liam), once (a second run 0); both schedules are entity-zoned (`*/15 * * * 1-5` and `0 9 * * 1`). An entity with no zone isn't fired (workflows' rule, unchanged).
- AC-7: pass — reminders.test AC7: Saturday and Sunday refused by the card check and the service, a future day refused; schedules weekdays only (AC-5, AC-6); approved leave skipped (AC-3).
- AC-8: pass — `screens-073.test.ts` AC8: ThisWeek capacity 200 h for week 42 (five people 100% allocated at 40 h, the mock's "200 h allocated"), 184 h with Dinesh on 24 h, null ("allocation unknown") once someone has no HR record; a project row's pin resolves through `get_team_week` with `project`. Time e2e 009 AC3 (Team week vs mock ≤ 2 %) passes.
- AC-9: pass — `approval-checks.test.ts` AC9: Kasun's card "Submit your timesheet for 2026-W43 (32 h)" with "Missing · Fri Oct 23. You can still submit.", and the result lists `missingDays`. Live: the same with five missing days, confirmed (`shots/live-submit-missing.png`).
- AC-10: pass — approval-checks AC10: `get_team_week` anomalies "a day over 14 h (Mon Oct 19)", "over 60 h (65 h)", "missing Fri Oct 23", none for a clean week; `approve_weeks` approves 1 and skips 3 "needs individual review: …"; approve-all over only flagged weeks makes no card; approving one at a time still works. Live: no bulk card; Kasun's single approval card with "Check · missing …" (`shots/live-approve-all.png`).
- AC-11: pass — the tests above (DB-backed, none skipped) and axe on the weekend columns in light and dark (My timesheet and Team time, no violations).
- AC-12: pass — the live run (build notes); README updated; `check-graph --root` only the known R7 fixture; time e2e 4/4. Existing tests changed only as listed in the build notes (D6).

Amendment 1 (Team grid) verified 2026-10-24 on the working tree over `c65587a`, same host and database. Every amendment AC passes; the product owner chose, on 2026-10-24, PASS with the gates noted.

- AC-13: pass — `grid.test.ts` AC13: `stateOf` gives missing, low (5.9 h), on target (6 h and 9 h), over (9.1 h), not yet, leave and weekend at 40 h; Kasun Mon–Thu on target and Fri 1.0 h low, Ayesha Wed missing and Fri leave; with a 24 h target Dinesh is over then low. e2e: the Fri cell is labelled "Kasun Dias, …: 1.0 h, low. Fleet Tracker 1.0 h" and shows ▲. Live: ✕ missing, ▲ low, "leave" and weekend cells (`shots/grid-light.png`).
- AC-14: pass — grid.test AC14: summary 141.5 h and 3 awaiting; the missing-people count equals the rows with a missing day. e2e: four stats, each with its pin to `get_team_week`. Live: 7.0 h, 4%, 5, 1.
- AC-15: pass — grid.test AC15: Kasun 32.5 h of 40 h, 81%, no overtime; Utilisation column with a bar (e2e and live).
- AC-16: pass — grid.test AC16: with the Fleet Tracker filter the summary equals that project's hours and every row and cell is Fleet Tracker only; status submitted, and not_submitted (draft + not started); team filter by HR department. e2e: the select only changes the URL (`?project=Fleet+Tracker`) and the caption says "Fleet Tracker only".
- AC-17: pass — e2e: focusing a cell shows a tooltip "Fleet Tracker: 1.0 h"; hover and click open it too (`DayCell`); the button changes nothing.
- AC-18: pass — grid.test AC18: route `w/:week/p/:weekId`; Dinesh can't reach Kasun's week. e2e: the name opens `/time/w/2026-W42/p/{id}`, h1 "Kasun Dias", no form or dialog, "Ask amax about this week", axe clean. Live: `shots/grid-member.png`.
- AC-19: pass — grid.test AC19: footer = per-day sums of the rows; e2e: tfoot "Team" row.
- AC-20: pass — grid.test AC20: total ascending, utilisation descending, name by default; e2e: the Total header link sets aria-sort "ascending" and the column is in order.
- AC-21: pass — e2e: the date 2026-11-04 beside the week arrows opens `/time/w/2026-W45`.
- AC-22: pass — grid.test AC22: Ravi (allocated on CON, no timesheet) is "not_started" with no week id, 0 h and five missing days. Live: Ayesha, Dinesh and Nimal "Not started" with Remind.
- AC-23: pass — `grid-perf.test.ts`: 100 people with a submitted 5 × 8 h week, `teamGrid` 891 ms after a warm-up (limit 2 s).
- AC-24: pass — the DB tests above (none skipped); e2e `grid.time.spec.ts` 5/5 with axe in light, dark and at 390 px (no horizontal page scroll); 009 AC3 mock comparison passes; live run and README (build notes).

Amendment 1 commands:
- `vitest run --config ../../vitest.config.ts --dir .` in `modules/time` with `DATABASE_MIGRATE_URL`: 131/131, exit 0.
- `pnpm lint` exit 0 (35/35). `node scripts/check-graph.mjs --root .`: only the known R7 fixture (plain `check:graph` scans 0 modules on this host).
- `pnpm turbo run build --filter=./apps/web` exit 0; time e2e (scratch config for Windows paths) 9/9, including 070's session test.
- Gates: `specclaw-preset-check .` exit 1 (repo-wide comment rule, 2710 hits; no new file over 80 lines; `time/module.ts` 108 → 111); `specclaw-quality-scan . --gate` not_run (jq "Argument list too long"). Review: specclaw-review not installed.

Amendment 1 screenshots: `shots/grid-light.png`, `grid-dark.png`, `grid-phone.png`, `grid-member.png` (live, W43) and `shots/mock-grid.png` (`#073-amendment-1`). Compared against the mock: summary strip, filters, state cells with icon and hours, utilisation bars, status, footer row and the read-only member week match. Intended differences: the date picker sits beside the week arrows (AC-21), and the existing From agents and actions columns stay.

Found in verify and fixed: on a week with weekend hours, the "Hours per day" chart wrapped Sat and Sun onto a second row (the grid had five columns). It now has one column per shown day (`--days`); checked on the running app: one row of 7 labels, axe clean, light and dark (`shots/app-team.png`, `app-team-dark.png`).

Commands:
- `vitest run --config ../../vitest.config.ts --dir .`: `modules/time` 126/126 (32 files, in parallel), `modules/finance` 9/9, `modules/notifications` 9/9, `modules/reports` 9/9, `modules/payroll` 10/10, `modules/allocations` 38/38, `packages/chat` 30/30, `packages/mcp` 20/20; `apps/web` tool-schemas, page-context, pin-refs, routes 9/9. Not from 073: delivery `releases` and `sync-import`, workflows `kill.test` (Windows).
- `pnpm lint` exit 0; `pnpm turbo run build --filter=./apps/web` exit 0 (after the chart fix); time e2e (scratch config for Windows paths) 4/4 twice, after one run where 070's session test failed once (not a 073 file).

Gates:
- `specclaw-preset-check .` exit 1: repo-wide hits. 073's new files are all under 80 lines; already-long files grew: `time/contracts.ts` 118 → 121, `time/module.ts` 100 → 108 (rules, workflows, schedules).
- `specclaw-quality-scan`: not_run (its jq step on this host). Review: specclaw-review not installed.

Screenshots: `shots/app.png`, `app-dark.png` (My timesheet W43: Fri Missing, Sat and Sun weekend), `app-team.png`, `app-team-dark.png` (Team time W43: 7-day chart, weekend columns, last-reminder lines, ThisWeek "of 80.0 h allocated"), `shots/mock.png` (`#073-time-workflow-enhancements`), `live-remind-missing.png`, `live-daily-setting.png`, `live-weekend-card.png`, `live-submit-missing.png`, `live-approve-all.png`. Compared against the mock: the weekend columns, the marked day, the reminder card with its 4-hour lines, the settings card, the submit warning and the approve-all skip match.

Build notes (2026-10-24, for verify):
- Found in the live run and fixed: (1) D2's Admin branch reminded everyone in the entity, including people who never log time (IT, sales); it now also needs time or an allocation in the last 4 weeks, as the daily schedule already did. (2) Approve-all over only flagged weeks made a card "Approve 0 timesheets"; it now makes no card and says each week needs individual review. Both have test lines.
- The daily schedule runs every 15 minutes on weekdays and sends once the Admin's local time has passed (schedules are fixed crons; the time is a setting). One per person a day (`time.reminder` slot), so later runs and retries send nothing.
- Performance: Team time works out anomalies only for submitted weeks (all rows made the parallel suite time out).
- Intended changes to existing tests (D6 and additions): `time/tests/cards.test.ts` (070: Nimal's approve card gains "Check: missing Fri Oct 16"); `time/tests/bulk.test.ts` (070: the two weeks' gaps are filled so it still tests one failed approval among clean ones; title 87.5 h → 103.5 h); `time/tests/settings.test.ts` (071: the settings object gains `dailyReminderAt: null`). Other changes in behaviour: `log_time`'s weekend refusal now offers `weekend: true`; the week reminder's bell body is the message ("" when none, was null); `submit_week` has a card ("Submit your timesheet for 2026-W43 (32 h)") instead of the shared default.
- Not from 073: delivery `releases` and `sync-import`, workflows `kill.test` (POSIX signals) fail on this host, as in 070–072.
- Quality: not_run (`specclaw-quality-scan`'s jq step on this host).
- Live run (Claude via `ANTHROPIC_API_KEY`, `pnpm dev`, local demo data; `dailyReminderAt` reset to off afterwards; today was Saturday Oct 24, so the day reminder used Fri Oct 23): Maya "Remind everyone who hasn't logged any hours on Friday Oct 23" → card "Remind 5 people to log Fri Oct 23", each marked "reminded 3 min ago by Maya Fernando" on the second ask; Sahan "Turn on the automatic reminder at 16:00…" → card "Daily reminder · off → 16:00 on working days…", confirmed; Kasun "Log 3 hours on Fleet Tracker for Saturday Oct 24…" → card "Log 3 h to Fleet Tracker, Sat Oct 24 (weekend)", confirmed; "Submit my timesheet" → card "Missing · Mon Oct 19 … Fri Oct 23. You can still submit.", confirmed; Maya "Approve all the submitted timesheets for 2026-W43" → no bulk card, Kasun's single approval card with "Check · missing …". My timesheet W43 with `?day=2026-10-23`: headers Mon–Thu, "Fri Missing", "Sat weekend", "Sun weekend"; axe clean in light and dark. Screenshots `shots/live-*.png`, `app.png`, `app-dark.png`.

Build notes, amendment 1 (Team grid, T7–T10; 2026-10-24, for verify):
- Tests: `modules/time` 131/131 against Postgres (adds `grid.test.ts` 4, `grid-perf.test.ts` 1); `tsc --noEmit` clean. Time e2e (scratch config for Windows paths): `grid.time.spec.ts` 5/5 (cells, summary, focus breakdown, footer; week picker; project filter and sort; member screen; axe in light, dark and at 390 px with no page-level horizontal scroll) and `time.spec.ts` 3/3, including 009 AC3 (Team week vs mock ≤ 2 %). `session.time.spec.ts` (070 AC51–54) failed at its last step while `pnpm dev` was running beside it; with the dev server stopped it passes (verify, 9/9).
- Performance (AC-23): 100 people, each with a submitted week of 5 × 8 h, `teamGrid` in 891 ms after a warm-up (limit 2 s). Reads are batched: one `teamWeek`, one entries query, one not-started query, then targets, entities, one zone per entity, leave and HR people once each.
- Intended changes to Team time (D11): rows sort by name by default; the Timesheets table is restyled (state cells, a Utilisation column, a footer row, tighter column padding on desktop); "Not started" rows appear with a Remind suggestion. A summary strip and a filter bar are added above and in the card. The chart, ThisWeek, change requests, row actions and pins are unchanged. The e2e helpers `signIn` and `axe` moved from `time.spec.ts` into `tests/e2e/helpers.ts` (same code).
- Found in the live run and fixed: (1) the name links failed colour contrast in dark mode (default link colour); they now use `--ink` with an underline. (2) The cell's icon and hours stacked into two lines because the shared stylesheet's global `.cell` (inline-grid, 72 × 36) and `.ico` classes applied; the icon class is now `glyph` and the cell lays out in one row. (3) With weekend columns the table overflowed at 1440 px and hid Status and actions; desktop column padding is now 8 px.
- `grid.ts` was split (`grid-rows.ts`) to stay under 80 lines. Already-long files grew only by the route: `time/module.ts` 108 → 111.
- `check:graph` printed "ok (0 modules, 0 packages)" here, so it didn't scan anything on this host; not counted as a pass.
- Live run (`pnpm dev`, local demo data, week 2026-W43, Saturday Oct 24): Team time as Maya shows 7.0 h, 4%, 5 people with missing days, 1 waiting; Ayesha's leave days say "leave", past weekdays with nothing say Missing, Tharushi's Tue 4.0 h is Low, Kasun's Sat 3.0 h is a weekend cell; Not started rows for Ayesha, Dinesh and Nimal; Kasun's name opens `/time/w/2026-W43/p/{id}` with his Fleet Tracker hours and the missing-days check. No page errors. Screenshots `shots/grid-light.png`, `grid-dark.png`, `grid-phone.png`, `grid-member.png`.

Found in the product owner's demo and changed (2026-10-24, AC-21): the week picker's native date box was empty ("dd-----yyyy"), couldn't follow the app's light and dark themes, and couldn't show a week. The product owner asked for a themed picker that highlights the week. It is now a button showing the shown week ("Oct 19 – Oct 25, 2026") that opens a calendar (`ui/WeekPicker.tsx`, `ui/WeekCalendar.tsx`, `ui/week-picker.css`): weeks run Monday to Sunday with ISO week numbers, the shown week is a highlighted range, the week under the pointer or focus is shaded, today is ringed, and "This week" jumps back. Keyboard: arrows (day, week), Page Up/Down (month), Home/End, Enter, Escape (focus returns to the button). Still navigation only. The AC-21 e2e checks the label, the 7 highlighted days, focus, axe with the calendar open in light and dark, Escape, and picking Nov 4 → 2026-W45 ("Nov 2 – Nov 8, 2026"). Time e2e 9/9; `tsc` clean; web build exit 0. Checked by eye in light, dark and at 390 px.

UI consistency pass over 070–073 (2026-10-24, product owner's request; screenshots of Team time W42/W43, My timesheet draft and submitted, and the member week, light, dark and 390 px). Fixed:
- The week button's range now ends on the last day the page shows (Fri, or Sun with weekend hours), so it reads like the lede ("Oct 19 – Oct 23, 2026"); the calendar still highlights the ISO week.
- The member week's project rows had no pin (AGENTS.md rule 2). Each row now pins `get_timesheet {weekId, project}`, which resolves to that row only (person, project, per-day hours, total; entry ids only for approvers and Admins). `grid.test.ts` AC18 checks it; the AC-18 e2e checks the pin.
- Team time's row Approve was a borderless ghost button next to bordered Remind buttons; both are now the same `btn sm`.
- `.chip.bad` was hard-coded to light colours in `time.css` (from 009), so "Not started" (and "Rejected") showed a bright pink pill in dark mode. The override is removed; the shared tokens apply (light #FDE7E4/#A8321F, about the same as before).
Time 131/131; `tsc` clean; web build exit 0; time e2e 8/9 (070's two-tab session test fails only while a dev server runs beside it, as found in verify; the demo server was running).

Polish, second pass (2026-10-24, product owner: "polished end to end"):
- My timesheet now marks days as Team time does: past working days with nothing logged and no leave say **Missing**, and approved leave days say **On leave** (`server/my-days.ts`, `ui/MyPage.tsx`, `DayHead`). The phone layout carries the mark in each day's label ("Fri · Missing"), since column heads are hidden there. A reminder link's `?day=` still marks its day. `tests/my-days.test.ts`: Ayesha's W42 gives Wed missing and Fri on leave; Kasun's gives none.
- Missing is red everywhere (it was amber in My timesheet's column head and red on Team time).
- Phone: a stacked row's actions (pin, Remind, Approve) sit in its top-right corner instead of on a line of their own.
Time 132/132; `tsc` clean; `pnpm lint` exit 0; `check-graph --root` only the known R7 fixture; web build exit 0; time e2e 9/9. Checked by eye: Ayesha and Tharushi W43 (light, dark), My timesheet and Team time at 390 px.

Product owner, 2026-10-24: "Missing label is not needed". My timesheet no longer marks every empty past day Missing; it marks approved leave days "On leave", and only the day a reminder links to (`?day=`, AC-3) says Missing, as before the polish pass. `server/my-days.ts` is now `myLeaveDays`; `tests/my-days.test.ts` checks Ayesha's W42 leave (Fri) and none for Kasun. Missing stays red where it shows.
