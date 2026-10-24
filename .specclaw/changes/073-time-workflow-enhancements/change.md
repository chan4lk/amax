# Time workflow: weekend hours, scheduled reminders, ThisWeek capacity and pins

**Change:** 073-time-workflow-enhancements · **Created:** 2026-10-22 · **Depends on:** 071 (entity scope, used by reminders)

## Problem

Only Monday to Friday can be logged, so weekend work and its overtime have no record (TIM-E02). Weekend commits become
suggestions that can never be accepted (TIM-B07). Reminders only happen when an approver presses Remind (TIM-E03). The
ThisWeek card assumes 40 h per person and has no pins on its project rows (TIM-B13). Evidence is in
[`../070-time-entry-corrections/audit.md`](../070-time-entry-corrections/audit.md).

## Mock Delta

What changes on screen, and where to see it: [`073-time-workflow-enhancements`](../../mock/index.html#073-time-workflow-enhancements)

My timesheet and Team time show **Sat** and **Sun** columns only for a week that has weekend hours, marked "weekend".
ThisWeek reads "118.5 h of 176 h allocated" (from Allocations), and each project row has a pin. With no allocation data
it reads "118.5 h logged · allocation unknown". The bell shows "Reminder: submit your timesheet for 2026-W42"
on Monday morning, local time.

## Acceptance Criteria

1. **AC-1** `log_time` takes Saturday or Sunday only with `weekend: true`. Without it, the error says to confirm weekend
   work. Weekend entries belong to the same ISO week, so they count in `weekTotals` (and so in Payroll overtime),
   `projectHours`, approvals, the submit payload and Reports' logged hours, and they show as weekend days on both screens.
   Validation, permissions, audit and events are the same as weekday entries.
2. **AC-2** A weekend commit drafts a suggestion that says "weekend". Accepting it logs with `weekend: true` (TIM-B07).
3. **AC-3** A schedule `time.draft-reminders` (workflows, `timezone: "entity"`, Monday 09:00 local) reminds every person
   whose **previous** ISO week, in their entity's zone, is still `draft` or `rejected` with hours logged. It emits
   `time.week.reminded` with `by: "system:time.reminders"`, which the existing rule delivers.
4. **AC-4** Reminders are retry-safe: `time.reminder (tenant_id, week_id, slot)` is unique, so a re-run or retried slot
   doesn't remind twice. A manual `remind_week` still works and isn't blocked by it. Each reminder is audited as
   `time.week.remind` with the system actor.
5. **AC-5** TIM-T03: an entity in `Asia/Colombo` and one in `Australia/Perth` fire at their own 09:00. A week that's
   submitted, approved or has no hours isn't reminded. An entity with no zone isn't reminded (fail closed, as in 029).
   Running the slot twice sends one reminder.
6. **AC-6** ThisWeek: each project row has a `PinButton` resolving through `get_team_week` to that project's hours.
   Capacity comes from Allocations' `personMonthTotals` (percent × 40 h × the week's working days ÷ 5, per person on
   the card). With Allocations not installed or not readable, the card says "allocation unknown" rather than assuming
   40 h. Time gains `integratesWith: ["allocations"]`.
7. **AC-7** Tests (DB-backed, none skipped) for AC-1–AC-6, plus axe on the weekend columns in light and dark. The time
   e2e passes. README updated; `check:graph` passes.

## Scope

- **In `modules/time/`:** `server/log.ts` (`weekend` flag), `week.ts` (`weekDays` with weekend), `server/my.ts`,
  `server/team.ts`, `ui/*` (weekend columns, ThisWeek), `suggestions.ts`, `server/reminders.ts` (new workflow and
  schedule), `module.ts` (`schedules`, `integratesWith`), migration `0004_reminder.sql`, `mcp.ts`, `chat.ts`, tests,
  README.
- **Outside:** none. Allocations is read through `@amax/allocations/contracts`; Notifications already has the reminded
  rule.

## Decisions needed

- **D1 Weekend semantics.** Proposed: weekend hours are ordinary hours in the same ISO week, so they count toward the
  40 h overtime threshold, utilisation and billing. Overtime *classification* (weekend rate) stays out (TIM-N02).
- **D2 Who gets reminded.** Proposed: only people with a draft or rejected week **with hours**. People who logged
  nothing at all have no week row; reminding them would mean reading hr's roster, which is a separate decision.
- **D3 Capacity formula.** Allocations gives percent per person-month, not hours. Proposed: percent × 40 h per
  full-time week, pro-rated for the days in the month. Say if FTE (hr) should scale it too.
- **D4 Reminder time.** Proposed: Monday 09:00 in the entity's zone, for the week before.

## Tasks

<!-- Draft for review; /specclaw:plan confirms after approval. -->

- [ ] `T1` — Weekend columns on My timesheet and Team time, and ThisWeek capacity and row pins (AC-1 UI, AC-6)
  Files: modules/time/ui/MyPage.tsx, modules/time/ui/TeamPage.tsx, modules/time/ui/Timesheets.tsx, modules/time/ui/ThisWeek.tsx, modules/time/ui/parts.tsx, modules/time/server/team.ts, modules/time/server/my.ts
- [ ] `T2` — `weekend` flag through log, MCP, chat and the commit draft (AC-1, AC-2)
  Files: modules/time/server/log.ts, modules/time/week.ts, modules/time/mcp.ts, modules/time/chat.ts, modules/time/suggestions.ts, modules/time/tests/weekend.test.ts
- [ ] `T3` — Reminder schedule, `time.reminder` table, slot dedup, audit (AC-3–AC-5)
  Files: modules/time/db/migrations/0004_reminder.sql, modules/time/server/reminders.ts, modules/time/module.ts, modules/time/tests/reminders.test.ts
- [ ] `T4` — Integration: e2e and axe for weekend columns, README (AC-7)
  Files: modules/time/tests/e2e/time.spec.ts, modules/time/README.md
  Depends: T1, T2, T3

## Verify

<!-- Filled by verify. -->
