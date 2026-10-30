# Time consumers stay in sync: Finance, Notifications, Reports, and weekly utilisation

**Change:** 072-time-consumers-sync · **Created:** 2026-10-22 · **Updated:** 2026-10-24 · **Builds on:** 070, 071
(branch `specclaw/072-time-consumers-sync`, stacked on `specclaw/071-time-access-and-integrity`)

## Problem

Finance recomputes billable hours only when a week is approved. Reopening a week or changing a locked entry leaves
`finance.billable` at the old figure (TIM-B04). Submission notifications go to the person's managers, or else every
Admin, but never to the project approvers who can actually approve (TIM-B05). Reports counts draft, submitted and
rejected hours in utilisation (REP-B04). Evidence is in
[`../070-time-entry-corrections/audit.md`](../070-time-entry-corrections/audit.md).

**Update, 2026-10-24.** Rebased on 070 and 071 as built.
- **Locked changes still happen.** 070's change requests can apply a correction to an approved week, and an Admin's
  `log_time` into an approved week is unchanged from 009. Both emit `lockedChange: true`, so Finance must follow them.
- **Change-request notices aren't scoped.** They use the same `approvers` recipient as submissions, so like those they
  skip project approvers and ignore legal entity. 071 left this here.
- **Migration numbers.** 071 took `0005`, so this change uses `0006`.

Also from the Time page requirements:
- There's no weekly utilisation: logged hours against a person's 40 h target, flagged above 100%, with the missing
  days. There's no per-person target for part-time staff (FR-2.7, FR-2.10). The only utilisation today is Reports'
  monthly billable ÷ available.
- Chat can't answer "What is Nimal's utilisation this week?" or "Who is below 80%?", and "What did I log this week?"
  gives no utilisation (FR-2.8, FR-2.9, FR-5.16).
- Approval and rejection notices go to the bell and, by 030's defaults, to email. Nothing tests that end to end
  (FR-3.4, FR-4.7).

## Mock Delta

What changes on screen, and where to see it: [`072-time-consumers-sync`](../../mock/index.html#072-time-consumers-sync)

- **Bell (PM of Fleet Tracker):** "Kasun Dias submitted 2026-W42, 12 h on Fleet Tracker to approve", and "Kasun Dias
  asked to change Fleet Tracker, Thu Oct 15", though the PM isn't Kasun's manager.
- **Reports:** the lede says which hours it counts (per D1), e.g. "Utilisation from submitted and approved time".
- **Chat (PM):** "Who is below 80% this week?" gets one line per person, lowest first: hours, target, %, missing days.
  Above 100% is shown as is and marked overtime. With leave, the leave-adjusted figure sits beside it.
- **Chat (Engineer):** "What did I log this week?" ends with "32.5 h of 40 h, 81%"; a colleague's figure is declined
  and their own offered (071).
- **Chat (Admin):** "Set Dinesh's weekly target to 24 h" gives a confirm card "Weekly target for Dinesh Wickrama:
  40 h → 24 h".
- **Unchanged on screen:** Finance and the email itself; their figures and deliveries are just correct. Team time's
  Utilisation column is 073's.

## Acceptance Criteria

**Finance (TIM-B04)**

1. **AC-1** Finance recomputes the T&M billable hours for the month(s) a week touches on:
   - `time.week.approved` and `time.week.reopened`;
   - `time.entry.logged`, `time.entry.corrected` or `time.entry.deleted` with `lockedChange: true` (Admin `log_time`
     into an approved week; a change request applied to an approved week, 070 AC-34).

   One shared recompute is idempotent: it upserts the billable figure per contract and period, so a retried or
   repeated event changes nothing. An already-invoiced period isn't rewritten; the difference shows as an open draft
   (the existing `draftFor` behaviour), which a test checks.
2. **AC-2** TIM-T07, through the outbox:
   - Approve a week (billable = H), reopen it (billable drops to the approved hours without it), approve again (back
     to H).
   - A change request applied to an approved week moves billable by the changed hours.
   - Delivering each event twice gives the same figures.

**Notifications (TIM-B05)**

3. **AC-3** The `approvers` recipient gains two optional fields:
   - `projects: "<payload field>"` — adds everyone who holds `time:approve` on one of the payload's projects, in the
     owner's legal entity.
   - `entity: "<payload field>"` — limits managers and the Admin fallback to people whose scope reaches the owner's
     legal entity.

   Recipients become the owner's managers who could approve, plus those project approvers. Admins hear only when
   nobody else would. The owner and the actor are left out. Rules without these fields behave exactly as today
   (`NotificationRecipient` in `packages/core`).

   `WeekSubmitted` and `ChangeRequested` gain `projectIds` and `legalEntityId` (declared). Time's rules
   `time.week-submitted`, `time.change-requested` and `time.change-answered` use both fields.
4. **AC-4** TIM-T06: Kasun submits a week with Fleet Tracker hours.
   - Its PM, who isn't Kasun's manager, gets "Kasun Dias submitted 2026-W42", linking to `/time/w/2026-W42`.
   - A PM of an unrelated project gets nothing, and neither does an Admin scoped to another legal entity.
   - The manager still gets theirs.
   - The same holds for Kasun's change request on that week.
5. **AC-5** Email (FR-3.4, FR-4.7). With default preferences, an approved, rejected or reopened week reaches its owner
   in the bell **and** through the email adapter (a fake wire in tests). The rejection notice carries the comment.
   Quiet hours and the daily digest still apply as 030 defines. Nothing changes in the notifications module for this:
   it's a test of the existing rules and defaults.

**Reports (REP-B04)**

6. **AC-6** Reports counts hours by week status as decided in **D1**.
   - It never counts a rejected week's hours.
   - A reopened week drops out until it's submitted again.
   - A week's hours move in or out when its status changes (submitted, approved, rejected, reopened).
   - Tested per status.
   - The lede says which statuses count.

**Weekly utilisation (FR-2.7 to FR-2.10, FR-5.16)**

7. **AC-7** Per-person weekly target.
   - `time.target` (migration `0006_weekly_target.sql`): one row per person, 1–60 h, absent means 40 h.
   - `set_weekly_target` (write, `time:admin`, in the person's legal entity) takes a person and hours, or `null` to go
     back to 40 h. Its confirm card reads "Weekly target for {person}: 40 h → 24 h". Audited.
   - The target is read wherever weekly utilisation is.
8. **AC-8** `get_week_utilisation` (read): for an ISO week, the people the viewer may see (071's week scope; an Engineer
   gets only themself). For each person:
   - **Hours, target and %:** hours logged (live entries, any status but rejected), their target, and utilisation =
     hours ÷ target × 100, rounded to a whole %.
   - **Overtime:** `overtime: true` above 100%, with the figure as is (e.g. 112%).
   - **Missing days:** the working days up to the person's local today with no hours.
   - **Leave:** when Leave is installed and the viewer may see the person's leave, the target less approved leave days
     (target ÷ 5 a day, half a day as half) and the leave-adjusted %.

   Rows come lowest first. An optional `below` (e.g. 80) keeps only those under it.

   Example: 8, 8, 6, 8, 4 h against 40 h gives 34 h, 85%.
9. **AC-9** Chat (FR-2.8, FR-2.9, FR-5.16).
   - "What is Nimal's utilisation this week?" and "Who is below 80% this week?" are answered from
     `get_week_utilisation` with person, week, hours, % and missing days.
   - `get_my_week` gains `target` and `utilisation` (additive), so "What did I log this week?" ends with
     "{hours} h of {target} h, {n}%".
   - A Team Member asking for a colleague gets their own figure instead, and is told why.
   - On Team time, the page suggestions (070 AC-42) gain "Who is below 80% this week?" for approvers.

**Tests and docs**

10. **AC-10** Tests (DB-backed, none skipped):
    - Consumer tests with events delivered through the outbox (`runDueJobs`), including a retried event.
    - TIM-T06 and TIM-T07; the email test.
    - Reports per status.
    - Targets (set, reset, out of entity refused).
    - Utilisation: 34 h → 85%; 44.8 h → 112% with overtime; missing days; leave-adjusted; lowest first; `below`;
      an Engineer sees only themself.
11. **AC-11** A live run with the real model:
    - a PM asks who is below 80%;
    - an Engineer asks what they logged and for a colleague's figure;
    - an Admin sets a part-time target.

    README and tool descriptions updated. `check:graph` passes. The finance, notifications, reports and time suites
    pass with DB tests running. Every existing test passes unmodified, except where D1 or D5 intentionally changes a
    figure or a recipient (listed under Verify).

## Scope

- **In `modules/time/`:**
  - `contracts.ts` and `module.ts`: payload fields, rules, the target table's retention, the D1 contract read if
    option B.
  - `server/submit.ts`, `server/request.ts`, a new `server/utilisation.ts` and `server/targets.ts`.
  - `mcp.ts`, `chat-suggestions.ts`, migration `0006_weekly_target.sql`, tests, README.
- **Outside (necessary):**
  - `modules/finance/suggestions.ts`, `modules/finance/module.ts`: the handlers in AC-1, sharing one recompute.
  - `modules/notifications/server/recipients.ts` and `packages/core/src/module.ts`: `NotificationRecipient` gains
    `projects?` and `entity?`. This is a generic, additive change to a shared-package type.
  - `modules/reports/`: D1.
  - Leave is read through `@amax/leave/contracts` only.
- **Not here:** Team time's Utilisation column, colours and filters (073); overtime classification (TIM-N02); outbox
  dead letter (PLT-B02/B03).
- **Migration numbers:** 073's migration becomes `0007`.

## Decisions

Approved by the product owner, 2026-10-24 ("approve"): the recommended option of each. D1: count submitted and approved weeks; option B was approved first, then changed to **option A** during the build (2026-10-24, product owner: "Option A instead") because Time's fixtures hold only week 42 and B would empty Reports' 12-month demo; D2: no action; D3: both figures, named apart; D4: every live entry except a rejected week's; D5: accepted as fixes, listed under Verify; D6: Time's own per-person target.

- **D1 What Reports' utilisation counts, and who owns the status.** Utilisation is billable ÷ available (027).
  - **Product:** count (a) approved only, (b) submitted and approved, or (c) every logged hour except rejected?
    Approved-only undercounts the current month until weeks are approved. *Recommended:* **(b)**.
  - **Option A, Reports tracks status:** a `reports.week_status` table fed by submitted, approved, rejected and
    reopened events. This keeps 027's read model, but adds event handlers and a second copy of status.
  - **Option B, a Time contract read:** `loggedHours(tx, viewer, { from, to, statuses })`, and Reports drops
    `logged_hours` and its handlers. Time owns status, nothing goes stale, and 070's Reports handlers retire. Reports
    already asks Time who it may see (071's `hoursVisibleTo`).
  - *Recommended:* **B**.
- **D2 The "HR link" in TIM-B05** couldn't be found: the rule links to `/time/w/{week}`. *Recommended:* no action unless
  you can point to it.
- **D3 Two utilisation figures.** The requirements' weekly figure is hours logged ÷ target (FR-2.7). Reports' monthly
  figure is billable ÷ available (027).
  - *Recommended:* keep both and name them apart: "Weekly utilisation" (Time: logged vs target, for chasing hours and
    workload) and "Billable utilisation" (Reports: for the business).
  - Chat answers "utilisation this week" from Time, and "this month" or "billable" from Reports.
- **D4 Which hours count in the weekly figure.** *Recommended:* every live entry except a rejected week's, so the
  current week shows progress before submission. Approved-only would read near 0% until Friday.
- **D5 Behaviour that changes** (the product owner's "no existing feature altered", as in 071 D5):
  - PMs start getting submission and change-request notices for their projects.
  - Entity-scoped Admins stop getting another entity's.
  - Reports' figures change with D1.

  *Recommended:* accept these as the fixes they are, listed under Verify. Every new capability (targets, weekly
  utilisation) is additive.
- **D6 Target source.** *Recommended:* Time's own per-person target, default 40 h, set by an Admin (FR-2.10).
  *Alternative:* derive it from hr's FTE, which would make hr a hard dependency of the figure.

## Tasks

<!-- UI first, then backend, then integration. D1 option A (changed from B during the build): Reports keeps its copy
     of the hours, adds each entry's week and a week-status table fed by Time's week events, and counts submitted and
     approved weeks. Seeded demo rows have no week and keep counting, so the demo is unchanged. -->

- [x] `T1` — Screens: Reports' lede names the hours it counts ("Utilisation from submitted and approved time"); Team time's chat suggestion "Who is below 80% this week?" for approvers (AC-6 UI, AC-9 UI)
  Files: modules/reports/server/lede.ts, modules/time/chat-suggestions.ts, modules/time/tests/suggestions.test.ts
- [x] `T2` — Finance: one idempotent recompute per contract and month on week approved and reopened, and on logged, corrected or deleted with `lockedChange: true`; invoiced periods leave the difference as a draft (AC-1, AC-2)
  Files: modules/finance/suggestions.ts, modules/finance/module.ts, modules/finance/tests/time-sync.test.ts
  Depends: T1
- [x] `T3` — Notifications: `projects` and `entity` on the `approvers` recipient; `projectIds` and `legalEntityId` on `WeekSubmitted` and `ChangeRequested`; Time's three rules use them; TIM-T06 and the email test (AC-3–AC-5)
  Files: packages/core/src/module.ts, modules/notifications/server/recipients.ts, modules/time/contracts.ts, modules/time/module.ts, modules/time/server/submit.ts, modules/time/server/request.ts, modules/notifications/tests/project-approvers.test.ts, modules/notifications/tests/decision-email.test.ts
  Depends: T1
- [x] `T4` — Reports by week status (D1 option A): migration `reports/0003_week_status.sql` (`week_id` on `logged_hours`, `reports.week_status`); entry handlers keep the week; week events set its status (submitted, approved, rejected, reopened → draft); utilisation counts hours whose week is submitted or approved, and seeded rows without a week (AC-6)
  Files: modules/reports/db/migrations/0003_week_status.sql, modules/reports/server/hours.ts, modules/reports/server/status.ts, modules/reports/server/inputs.ts, modules/reports/module.ts, modules/reports/tests/status.test.ts
  Depends: T1
- [x] `T5` — Weekly utilisation: migration `0006_weekly_target.sql`; `set_weekly_target` (card, entity-scoped, audited); `get_week_utilisation` (scope, %, overtime, missing days, leave-adjusted, lowest first, `below`); `get_my_week` gains `target` and `utilisation` (AC-7–AC-9)
  Files: modules/time/db/migrations/0006_weekly_target.sql, modules/time/server/targets.ts, modules/time/server/utilisation.ts, modules/time/server/my.ts, modules/time/mcp-utilisation.ts, modules/time/mcp.ts, modules/time/module.ts, modules/time/tests/utilisation.test.ts
  Depends: T1
- [x] `T6` — Integration: outbox consumer tests with a retried event; full suites; live run with the real model (PM below 80%, Engineer read-back and colleague, Admin part-time target); READMEs and tool descriptions; intended figure and recipient changes listed under Verify (AC-10, AC-11)
  Files: modules/time/tests/consumers.test.ts, modules/time/README.md, modules/reports/README.md, modules/finance/README.md, modules/notifications/README.md
  Depends: T2, T3, T4, T5

## Verify

**Verdict:** PASS

**Review loop (specclaw-review, cap of 5 passes), 2026-10-27.** Reviewed against the 071 branch tip (`4643cd69`) after the stack rebase, so only 072's own code; rounds ran on the working tree with a local, read-only copy of the reviewer (git is read-only for the agent).

- Round 1 (7 majors): week status for weeks submitted before 072; My week and weekly utilisation computed twice; hidden leave read as no leave; notification routing reached a manager through a non-approving role; Leave not treated as optional; target retention deleted other people's targets; stale READMEs. Fixed: shared `weekFigures`; Leave's own rule exported as `leaveVisibleTo` (Reports' copy replaced); auth's `canEverIn` shared by Time and notifications; `time.target` anonymises `updated_by` and keeps the hours.
- Round 2 (6 majors): unknown week status looked up through Time's contract `weekStatuses` (the backfill migration that read Time's table was removed); the no-Leave test now disables Leave the way the app does (payroll depends on Leave, so it goes too); one exact-hours query.
- Round 3 **escalated** (exit 4). Product owner's decisions: (1) people with no timesheet in weekly utilisation are **resolved by 073** (next PR in the stack, commit 6c85afd5), recorded in `follow-ups.md`; (2) **build `hasModule`**: `packages/core/src/installed.ts`, set at boot from the app registry (AMAX_MODULES_DISABLED already out), true only when installed and its tables exist; used for Leave in Time and for Time and Leave in Reports, tested with Leave's tables present but the module off. The other table-only checks are a follow-up. Also: Reports marks a person `hoursIncomplete` when no source gives a week's status, `weekStatuses` reads as the viewer.
- Round 4 escalated again on the same 073 item only; fixed: the team figure counts `leaveHidden` and `statusUnknown` apart, each said in the notes and the CSV; a table-driven test over Time switched off and an orphan week.
- **Final pass (round 5, pass 5 of 5): OPEN, 0 blockers, 3 majors, 2 minors. The loop stopped at the cap.** Recorded here and in `follow-ups.md`:
  - Major: `hoursUnknown` covers the 12 months the report loads for its trend, so one unknown week anywhere in the year marks the person incomplete in the current month (and adds a row with no hours in the month). Caused by round 3's fix: key it by person and day, and count it only inside the range.
  - Major: week-status ordering uses `core.event.created_at` (transaction start), so a transaction that started first but committed last can lose to a stale status. Order by a per-week sequence from Time, with a two-session test.
  - Major: `below` and the sort use utilisation before leave, so "Who is below 80%?" lists people whose only shortfall is approved leave. Use `adjustedUtilisation ?? utilisation`, or say so in the tool's contract.
  - Minors: `weekStatuses` needs its own contract test and a line in Time's README; the status handler invents `now()` when the event's time can't be read (fail and retry instead).
- Environment notes (this Windows host): `notifications/tests/time-routing.test.ts` can't settle here (fixture events fail on uninstalled suggestion kinds, and two workflow runs sleep until 01:30), with the old routing code as with the new; the routing rule is covered by `packages/auth/tests/can-ever-in.test.ts`. Run it in CI.
- The final pass ran on the uncommitted working tree, so it records `head fe4f5b22`; once committed, `specclaw-review verdict` reports "code changed after the final pass". The reviewed diff is what was committed.

Verified 2026-10-24 at `7917527` plus the Finance split below (branch `specclaw/072-time-consumers-sync`, stacked on 071's `98fdabf`), Windows 11, `DATABASE_MIGRATE_URL=postgres://amax:amax@127.0.0.1:5440/amax`. Every AC passes. The specclaw gates don't run clean on this host (see Gates); the product owner chose, on 2026-10-24, to record PASS with them noted, as for 070 and 071.

- AC-1: pass — `modules/finance/server/time-sync.ts`: one `recompute` (upsert per contract and period, through `draftFromTime`) on `time.week.approved`, `time.week.reopened`, and logged/corrected/deleted with `lockedChange: true`; invoiced periods keep the existing `draftFor` behaviour (`drafts.test.ts`, unchanged, passes).
- AC-2: pass — `modules/finance/tests/time-sync.test.ts` (TIM-T07, through the outbox): approve → H, reopen → back to the figure before, resubmit and approve → H; a change request applied to the approved week → H − 1; the approval handler delivered twice more → still H − 1.
- AC-3: pass — `packages/core/src/module.ts` (`projects?`, `entity?` on `approvers`) and `modules/notifications/server/recipients.ts`; Time's `time.week-submitted`, `time.change-requested`, `time.change-answered` use them; `modules/time/tests/consumers.test.ts`: the submit and request events carry `projectIds` and `legalEntityId`. Rules without the fields are unchanged (the other notifications tests pass). Admins, who approve every project, stay the fallback only.
- AC-4: pass — `modules/notifications/tests/time-routing.test.ts` AC3/AC4 (TIM-T06): Kasun's submission reaches Nimal (PM of Fleet Tracker, not his manager) and Maya (manager), not Ayesha (PM of an unrelated project); his change request reaches Nimal; with Nimal's grant scoped to another entity, the next submission reaches Maya and not Nimal. `rules.test.ts`: Tharushi's submission reaches Maya and Nimal.
- AC-5: pass — time-routing AC5: approved, rejected and reopened weeks reach the owner in the bell and through the email adapter (Graph `sendMail` on a fake wire); the rejection mail carries "Split Tuesday by project". No notifications code changed for this.
- AC-6: pass — `modules/reports/tests/status.test.ts`: through Time's tools and the outbox, a draft entry doesn't count, submitted counts, rejected doesn't, resubmitted counts, approved counts, reopened doesn't; the lede reads "Billable hours from submitted and approved time ÷ available hours…". `consumers.test.ts`: a redelivered approval leaves the status approved. Demo figures unchanged: 84%, the 12-month trend (`shots/app.png`, `app-dark.png`).
- AC-7: pass — `modules/time/tests/utilisation.test.ts` AC7: an Engineer can't set a target; Sahan sets Dinesh to 24 h (audited `time.target.set`), his row and `get_my_week` use it (8 h → 33%), `null` returns him to 40 h. Migration `0006_weekly_target.sql`. Live: card "Weekly target for Dinesh Wickrama · Target 40 h → 24 h", confirmed (`shots/live-target-card.png`).
- AC-8: pass — utilisation AC8: 8, 8, 6, 8, 4 h → 34 h, 85%; 44.8 h → 112%, `overtime: true`; Dinesh's Monday-only week lists Tue–Fri as missing; rows lowest first; `below: 80` keeps only Dinesh; Kasun sees only himself; W42 Ayesha 23.5 h, 59%, one leave day, 32 h, 73%.
- AC-9: pass — utilisation AC9: `get_my_week` returns `target` and `utilisation`; "Who is below 80% this week?" is offered to Maya and not to Kasun. Live: Maya's question → `get_week_utilisation`, four people lowest first with missing days and Ayesha's leave-adjusted figure (`shots/live-below-80.png`); Kasun's "What did I log this week?" → "32.5 hours … 40-hour target (81%)", and his colleague question → his own 81% offered (`shots/live-my-week.png`).
- AC-10: pass — the tests above, all DB-backed, none skipped, events delivered through the outbox with a retried event.
- AC-11: pass — the live run (build notes); time, finance, notifications and reports READMEs updated; tool descriptions for the two new tools. Existing tests changed only as listed in the build notes (D5).

Commands:
- `vitest run --config ../../vitest.config.ts --dir .`: `modules/time` 114/114 (27 files), `modules/finance` 9/9, `modules/notifications` 9/9, `modules/reports` 9/9, `modules/payroll` 10/10, `modules/allocations` 38/38, `packages/chat` 30/30, `packages/mcp` 20/20; `apps/web` tool-schemas, page-context, pin-refs, routes 9/9. `packages/core` 157/158: `ac5-adapters` fails on Windows path separators, as in 070's verify.
- `pnpm lint` exit 0; `node scripts/check-graph.mjs --root <repo>`: only the known R7 fixture; `pnpm turbo run build --filter=./apps/web` exit 0.
- After verify started, Finance's time handlers moved from `suggestions.ts` to `server/time-sync.ts` (88 → 71 lines; no behaviour change); finance 9/9, lint and build re-run after it.

Gates:
- `specclaw-preset-check .` exit 1: repo-wide `comment` and `max_lines` hits. 072's new files are all under 80 lines; already-long files grew slightly: `time/contracts.ts` 116 → 118, `time/module.ts` 99 → 100, `packages/core/src/module.ts` 296 → 301; `finance/suggestions.ts` is now under the limit (71).
- `specclaw-quality-scan`: not_run (its jq step on this host). Review: specclaw-review not installed.

Screenshots: `shots/app.png`, `app-dark.png` (Reports, October, the new lede), `shots/mock.png` (`#072-time-consumers-sync`), `live-below-80.png`, `live-my-week.png`, `live-target-card.png`. Compared against the mock: the bell routing, Reports lede, chat answers and target card match. One difference: the model answered "below 80%" as a markdown table, which the chat panel shows as plain `|` text (the panel doesn't render tables; not from 072). Follow-up: render tables in chat, or ask tools' descriptions for one line per person.

Build notes (2026-10-24, for verify):
- D1 changed from option B to option A during the build (product owner, 2026-10-24), because Time's fixtures hold only week 42 and B would empty Reports' 12-month demo. Reports' demo figures are unchanged (84% team utilisation, the trend).
- Ordering: the outbox claims events in batches with no order guarantee, so `reports.week_status` keeps the newest status by the event's `created_at` (`as_of`); found by the consumer test, where a batch applied "submitted" after "approved".
- Intended changes to existing tests (D5): `notifications/tests/rules.test.ts` (a submission also reaches Nimal, PM of Fleet Tracker; the redelivery check counts per event and reads Maya's deliveries); `reports/tests/utilisation.test.ts` and `tests/e2e/reports.spec.ts` (the lede names the hours; a draft entry no longer counts); `reports/tests/hours-sync.test.ts` (070's: the weeks are marked submitted in Reports' copy so its correction and tombstone checks still run); `time/tests/suggestions.test.ts` (070's: Maya's full suggestion list gains "Who is below 80% this week?"; the panel still shows her first three).
- Not from 072: `packages/core` `ac5-adapters` fails on Windows path separators (as in 070's verify).
- Quality: not_run (`specclaw-quality-scan`'s jq step on this host).
- Live run (Claude via `ANTHROPIC_API_KEY`, `pnpm dev`, local demo data; Dinesh's target reset afterwards): Maya "Who is below 80% utilisation this week?" → `get_week_utilisation`: Ayesha 59% (73% with Friday's leave, 32 h target), Dinesh 63%, Tharushi 73%, Nimal 79%, lowest first with missing days; Kasun "What did I log this week?" → "32.5 hours … against a 40-hour target (81%)"; "And what is Nimal's utilisation?" → only his own, 81%, offered; Sahan "Set Dinesh Wickrama's weekly target to 24 hours" → card "Weekly target for Dinesh Wickrama · Target 40 h → 24 h", confirmed. Screenshots `shots/live-*.png`.
