# Time consumers stay in sync: Finance, Notifications, Reports

**Change:** 072-time-consumers-sync · **Created:** 2026-10-22 · **Depends on:** 070 (entry events and revision)

## Problem

Finance recomputes billable hours only when a week is approved. Reopening a week or changing a locked entry leaves
`finance.billable` at the old figure (TIM-B04). Submission notifications go to the person's managers, or else every
Admin, but never to the project approvers who can actually approve (TIM-B05). Reports counts draft, submitted and
rejected hours in utilisation (REP-B04). Evidence is in
[`../070-time-entry-corrections/audit.md`](../070-time-entry-corrections/audit.md).

## Mock Delta

What changes on screen, and where to see it: [`072-time-consumers-sync`](../../mock/index.html#072-time-consumers-sync)

A PM's bell shows "Kasun Dias submitted 2026-W42, 12 h on Fleet Tracker to approve". The Reports lede says which hours it
counts (per D1, e.g. "Utilisation from submitted and approved time"). Finance is unchanged on screen; its figures are
just correct.

## Acceptance Criteria

1. **AC-1** Finance recomputes the T&M billable hours for the month(s) a week touches on `time.week.approved`,
   `time.week.reopened`, and on `time.entry.logged`, `time.entry.corrected` or `time.entry.deleted` with
   `lockedChange: true`. One shared recompute is idempotent: it upserts `finance.billable` per contract and period, so
   a retried or repeated event changes nothing. An already-invoiced period isn't rewritten; the difference shows as an
   open draft (the existing `draftFor` behaviour), which a test checks.
2. **AC-2** TIM-T07: approve a week (billable = H), reopen it (billable drops to the approved hours without it), approve
   again (back to H). A locked change by another Admin moves billable by the changed hours. Delivering each event twice
   gives the same figures.
3. **AC-3** `WeekSubmitted` gains `projectIds: string[]` (declared). The notifications recipient rule
   `{ approvers: "userId" }` gains an optional `projects: "projectIds"`. Recipients become the owner's managers who
   could approve, **plus** everyone for whom `can(viewer, "time:approve", { projectId, legalEntityId })` holds for one of
   the projects. Admins hear only when nobody else would. The owner and the actor are left out.
4. **AC-4** TIM-T06: Kasun submits a week with Fleet Tracker hours. Its PM (not Kasun's manager) gets "Kasun Dias
   submitted 2026-W42" linking to `/time/w/2026-W42`. A PM of an unrelated project, and a PM in another legal entity,
   get nothing. The manager still gets theirs.
5. **AC-5** Reports counts hours by week status as decided in **D1**. It never counts a rejected week's hours. A
   reopened week drops out until it's submitted again, and a week's hours move in or out when its status changes
   (submitted, approved, rejected, reopened). Tested per status.
6. **AC-6** Consumer tests run against Postgres with events delivered through the outbox (`runDueJobs`), including a
   retried event. `check:graph` passes. The finance, notifications, reports and time suites pass with DB tests running.

## Scope

- **In `modules/time/`:** `contracts.ts` and `module.ts` (`projectIds` on `WeekSubmitted`, plus the D1 contract read if
  option B), `server/submit.ts`, the notification rule, tests.
- **Outside (necessary):**
  - `modules/finance/suggestions.ts`, `modules/finance/module.ts`: the handlers listed in AC-1, sharing one recompute.
  - `modules/notifications/server/recipients.ts` and `packages/core/src/module.ts` (`NotificationRecipient` type gains
    `projects?`): generic, so any module's rule can name its project field. It's a shared-package type change.
  - `modules/reports/`: D1.
- **Not here:** overtime classification (TIM-N02), outbox dead letter (PLT-B02/B03).

## Decisions needed

- **D1 What Reports' utilisation counts, and who owns the status.** Utilisation is billable ÷ available (027).
  - **Product:** count (a) approved only, (b) submitted and approved, or (c) every logged hour except rejected?
    Approved-only undercounts the current month until weeks are approved. Proposed: **(b)**.
  - **Option A, Reports tracks status:** a `reports.week_status` table fed by submitted, approved, rejected and reopened
    events. `logged_hours` already has the week through `weekId`. This keeps 027's read model; it means more event
    handlers and a second copy of status.
  - **Option B, a Time contract read (WI-09):** `loggedHours(tx, viewer, { from, to, statuses })`, and Reports drops
    `logged_hours` and its handlers. Time owns status, nothing goes stale, and 070's Reports handlers retire. Reports'
    visibility becomes Time's week-level scope, which is stricter than Reports' `seesHours` today.
  - **Proposed: B**, because data ownership is clearer and there's no stale-copy class of bug. Choose A if Reports'
    current visibility must stay.
- **D2 The "HR link" in TIM-B05** couldn't be found: the rule links to `/time/w/{week}`. Proposed: no action unless you
  can point to it.

## Tasks

<!-- Draft for review; /specclaw:plan confirms after approval, and T4 depends on D1. -->

- [ ] `T1` — Finance: one idempotent recompute for approved, reopened and locked-change events (AC-1, AC-2)
  Files: modules/finance/suggestions.ts, modules/finance/module.ts, modules/finance/tests/time-sync.test.ts
- [ ] `T2` — `WeekSubmitted.projectIds` and the generic `projects` recipient in notifications (AC-3)
  Files: modules/time/contracts.ts, modules/time/module.ts, modules/time/server/submit.ts, packages/core/src/module.ts, modules/notifications/server/recipients.ts
- [ ] `T3` — TIM-T06 recipients test, entity and unrelated-PM negatives (AC-4)
  Files: modules/notifications/tests/project-approvers.test.ts
  Depends: T2
- [ ] `T4` — Reports by week status per D1 (AC-5)
  Files: decided by D1 (option B: modules/time/contracts.ts, modules/reports/server/inputs.ts, modules/reports/server/hours.ts, modules/reports/module.ts)
- [ ] `T5` — Outbox-driven consumer tests with retries; README notes (AC-6)
  Files: modules/time/tests/consumers.test.ts, modules/time/README.md
  Depends: T1, T3, T4

## Verify

<!-- Filled by verify. -->
