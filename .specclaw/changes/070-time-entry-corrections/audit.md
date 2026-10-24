# Time end-to-end audit (re-verified 2026-10-22 at `b257a6d`)

The static audit's findings, each checked against the current code. This file backs proposals 070–073.

**Statuses:** Confirmed (code read and execution path traced) · Already fixed · Not reproducible · Needs further
verification. "Static" means proven by reading the code path; nothing here was proven by a failing test yet. Each
change adds the regression test that fails first.

## Baseline

- Time today: 10 MCP tools, not 8. Reads: `get_team_week`, `get_hours_trend`, `get_my_week`, `get_timesheet`.
  Writes: `log_time`, `submit_week`, `approve_week`, `reject_week`, `remind_week`, `reopen_week`. One chat intent, `time.log`.
  Statuses are `draft → submitted → approved | rejected`, and `reopen` takes approved back to draft.
- Tests (`modules/time`, `DATABASE_MIGRATE_URL=postgres://amax:amax@127.0.0.1:5440/amax`, the `amax-dev-postgres`
  container): **72 passed, 0 failed, 0 skipped** on the second run. The first run hit 60 s `beforeAll` timeouts while the
  migration template was built once. The audit's "37 of 72 skipped" came from a run with no database.
- Consumers: Reports (`reports.hours` ← `time.entry.logged`), Finance (`finance.time-agent` ← `time.week.approved`,
  `projectHours(approvedOnly)` as `billingReader`), Payroll (`weekTotals` as the drafting viewer, over 40 h),
  Insights (`projectHours`, risk), Notifications (4 rules in time's manifest), and Overview (068, `weeklyHours`, `weekTotals`,
  `projectHours`). No other module imports `@amax/time`.

## Findings

| ID | Status | Evidence | Confidence |
|---|---|---|---|
| TIM-B01 | Confirmed | `mcp.ts` has no correct or delete tool. `time.entry` has no update or delete path, `hours > 0`. A rejected week can only gain hours, never lose them. | High |
| TIM-B02 | Confirmed | `suggestions.ts:24-28`: `undo` deletes the row and returns no `events`. `packages/agents/src/decide.ts:31` `auditWrite` emits whatever `events` the kind returns, so returning one is enough (no agents change). `reports.logged_hours` keeps the row. The existing test (`commit-draft-008.test.ts:29`) checks only `time.entry`. | High |
| TIM-B03 | Confirmed | `module.ts:30` `Payroll: OWN` (no `time:team`). `payroll/server/draft.ts:51` `weekTotals(tx, viewer, w)` filters to visible weeks, so a Payroll drafter sees only their own week. The source line still says "Approved timesheets, N weeks": **zero overtime, reported as complete**. | High |
| TIM-B04 | Confirmed | `finance/suggestions.ts:64-77` recomputes only on `time.week.approved`. `time.week.reopened` and `time.entry.logged{lockedChange:true}` have no Finance handler, so `finance.billable` stays at the old approved hours until another week in that month is approved. | High |
| TIM-B05 | Confirmed | `notifications/server/recipients.ts:23-28`: approvers = managers holding the permission, else **all Admins**. The project chain (`can(v,"time:approve",{projectId})`) is never consulted, and `WeekSubmitted` has no `projectIds`. The "HR link" part of the audit could not be located: the rule's `href` is `/time/w/{week}`. That part is **Needs further verification**. | High / Low |
| TIM-B06 | Confirmed | `server/reopen.ts` has no `week.user_id === viewer.userId` check and isn't `scoped`. An Admin can reopen their own approved week, then change it as a draft without the locked-change rule. | High |
| TIM-B07 | Confirmed | `suggestions.ts:31-42` turns weekend commits into suggestions; `apply → logEntry → workDay` throws "is a weekend". The person gets a suggestion that can never be accepted. | High |
| TIM-B08 / DEL-B02 | Confirmed | `delivery/server/ingest.ts:20-23` ignores GitHub's `distinct` flag. `createSuggestion` (`packages/agents/src/store.ts:51`) dedups only while a suggestion is open, queried or approved. After it's accepted, the same commit pushed again (another branch, or a force-push) drafts a new suggestion, and accepting it logs the hours twice. `time.entry` has no commit column. | High |
| TIM-B09 | Confirmed | `log_time` has no key. The external MCP gateway (`packages/mcp`) never uses `withIdempotency` (only chat does, `packages/chat/src/engine.ts:289`). A retried call inserts again. | High |
| TIM-B10 | Confirmed | `server/weeks.ts:12-16` `weekOrNow` → `isoWeekOf(new Date())` (UTC). `submit_week` with no week, and `approve/reject/remind/reopen` with `person` but no week, act on the **UTC** current week. The tool text says "the latest week if left out", which isn't what writes do. | High |
| TIM-B11 | Confirmed | `server/chain.ts:6`: `can(v,"time:approve")` with no `legalEntityId`. `packages/auth/src/can.ts:35` `inScope` passes when the attribute is missing, and Admin passes everything in scope. So an Admin or Finance user scoped to entity A gets the `admin` chain or `time:team` sight over entity B's weeks. The same applies to `reopenWeek` and the contract reads' `visible()`. `auth.user.legal_entity_id` exists (`packages/db/migrations/0004_auth.sql:45`). | High |
| TIM-B12 | Confirmed (in-tenant only) | `server/weeks.ts:29-45`: `findWeek` runs `select … for update` and throws "no such timesheet" / "no timesheet for X in W" **before** the chain check. That distinguishes "doesn't exist" from "not yours", and locks rows the caller can't act on. The namesake error lists emails (009 follow-up B8). RLS stops cross-tenant leaks. | High |
| TIM-B13 | Confirmed | `ui/ThisWeek.tsx:9` `allocated = rows.length * 40`. Project rows (`:18-20`) have no `PinButton`, which breaks R3 rule 2. Allocations publishes `personMonthTotals` (percent per person-month), not hours. | High |
| TIM-E02 | Confirmed | `server/log.ts:31-36` refuses Saturday and Sunday. `workDays` is Mon–Fri; the screens and the submit payload count five days. | High |
| TIM-E03 | Confirmed | `module.ts:47` `jobs: []`, no `schedules`. Reminders are only `remind_week`. There is **no tenant time zone**: zones are per legal entity (`workflows.entity_zone`, `ENTITY_ZONES`), and `schedules` with `timezone: "entity"` fire per entity, keyed by slot. | High |
| REP-B04 | Confirmed (semantics need a decision) | `reports.logged_hours` copies every entry on `time.entry.logged` with no week status (`reports/server/inputs.ts:24`). Utilisation counts draft, submitted and rejected hours. 027 defines utilisation as billable ÷ available and never says "approved". | High (code) / product decision |

### Regression tests asked for (TIM-T01…T07)

| Test | Exists? | Notes |
|---|---|---|
| T01 undo → no stale Reports row | No | 070 |
| T02 Payroll-role overtime | No | 071 |
| T03 scheduled reminders | No | 073 |
| T04 24 h/day and 0.05 h steps | Partly | Zod `multipleOf(0.05)` checked by probe (0.15, 2.55, 7.45 pass; 0.07 fails). No test in the suite. 070 adds it. |
| T05 `isoWeekOf(2025-12-29) = 2026-W01` | No (behaviour correct) | Probe returns `2026-W01`. 070 adds the test. |
| T06 PM approver notified | No | 072 |
| T07 Finance after reopen | No | 072 |

### Also found

- **Event order isn't guaranteed.** `packages/core/src/jobs.ts:88-104` retries each event with its own backoff. A
  `time.entry.logged` that fails once can arrive *after* the `time.entry.deleted` for the same entry. Reports must be
  order-safe (070 uses a per-entry revision and a tombstone).
- **`remind_week` result:** 009 follow-up B3 is already fixed (`recorded: true`, no `delivered` claim).

## Out of scope (recorded, not built)

TIM-N01 leave and holidays on the timesheet · TIM-N02 overtime classification and approval · PLT-B02/B03 outbox dead
letter and replay · PLT-B05 `can()` fail-open default (unchanged; Time passes `legalEntityId` itself).
