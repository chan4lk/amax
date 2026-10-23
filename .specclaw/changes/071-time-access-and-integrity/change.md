# Time access and integrity: Payroll totals, legal-entity scope, no duplicate hours

**Change:** 071-time-access-and-integrity · **Created:** 2026-10-22

## Problem

A Payroll drafter sees only their own timesheet, so overtime comes out as zero while the run says "Approved timesheets,
N weeks" (TIM-B03). An Admin or Finance user scoped to one legal entity can see, approve and reopen another entity's
weeks, because Time never passes `legalEntityId` to `can()` (TIM-B11). The same commit pushed again can log its hours
twice (TIM-B08/DEL-B02), and so can a retried external `log_time` (TIM-B09). Evidence is in
[`../070-time-entry-corrections/audit.md`](../070-time-entry-corrections/audit.md).

## Mock Delta

What changes on screen, and where to see it: [`071-time-access-and-integrity`](../../mock/index.html#071-time-access-and-integrity)

A payroll run's **Sources** line shows how complete the time read was, e.g. "Approved timesheets, 4 weeks, 12 people",
or "Timesheets: 2 of 14 people unreadable, overtime incomplete" as a warning chip. Team time shows only the weeks in the
viewer's entities. No other screen changes.

## Acceptance Criteria

1. **AC-1** Time adds a permission, `time:totals`, granted to Payroll and to nobody else new. A new contract read,
   `approvedWeekHours(tx, reader, { from, to, userIds? })`, returns per person and ISO week only `{ userId, week, hours }`
   for **approved** weeks: no projects, days, notes or comments. It applies the reader's legal-entity scope and reports
   `unreadable: userId[]` for asked-for people outside it.
2. **AC-2** Payroll overtime uses `approvedWeekHours`. A person asked for but unreadable is flagged on their slip
   (`overtime-unknown`). The Sources line says how many people were unreadable, and never says "complete" when any
   were. A system draft (no viewer) still says timesheets weren't read.
3. **AC-3** TIM-T02: a Payroll-role user drafting a group with a 46 h approved week gets 6 h of overtime. A 46 h
   *submitted* week gives 0 h. An Employee calling `approvedWeekHours` is refused (`ForbiddenError`). A Payroll user
   still can't open another person's week through `get_timesheet` or Team time.
4. **AC-4** Every Time permission check about another person's week passes the owner's legal entity
   (`auth.user.legal_entity_id`): the approval chain, `seesWeek`, `reopen_week`, the locked-change guard, and the
   contract reads' `visible()`. For an entity-scoped viewer, an owner with **no** entity is out of scope (fails closed,
   inside Time only; `can.ts` is untouched, PLT-B05).
5. **AC-5** An Admin scoped to entity A can't approve, reject, remind, reopen or change a locked entry of a person in
   entity B. They get the same error as for a missing week (070 AC-10). Entity B's weeks aren't on their Team time or in
   their `weekTotals`/`projectHours`. Unscoped Admins are unchanged. Tested per write tool.
6. **AC-6** `time.entry` gets `source_ref text`, unique on `(tenant_id, user_id, source_ref)` where set. An accepted
   commit draft stores `git:<sha>`. Accepting a second suggestion for the same commit logs nothing and resolves the
   suggestion as "already logged". The commit handler doesn't draft a suggestion when an entry already has that ref.
7. **AC-7** Delivery's GitHub push parser skips commits with `distinct: false` (already pushed on another ref), so
   neither tasks nor time are drafted twice from one push.
8. **AC-8** `log_time` accepts an optional `clientRef` (1–100 chars), stored as `mcp:<clientRef>` in `source_ref`.
   Retried with the same input, it returns the first entry's id with `replayed: true`, and writes no second entry,
   audit row or event. Reused with different input (project, day, hours, billable), it's refused with "clientRef
   already used for a different entry". Two concurrent calls with the same ref create one entry (the unique index
   decides; the loser reads the winner's row).
9. **AC-9** Regression tests (DB-backed, none skipped): TIM-T02; a cross-entity refusal for each write and the reads;
   the same commit processed twice (sequentially and concurrently) gives one entry; `clientRef` retry, concurrency and
   conflict; payroll incomplete flag.
10. **AC-10** README and tool descriptions updated. `check:graph` passes; the time, payroll and delivery suites pass with
    DB tests running.

## Scope

- **In `modules/time/`:** `module.ts` (permission, grant), `contracts.ts` (`approvedWeekHours`, entity-aware
  `visible`), `server/chain.ts`, `server/weeks.ts`, `server/team.ts`, `server/reopen.ts`, `server/log.ts`,
  `suggestions.ts`, `mcp.ts`, migration `0003_entry_source_ref.sql`, tests, README.
- **Outside (necessary):**
  - `modules/payroll/server/draft.ts`: switch to `approvedWeekHours` and report what couldn't be read (AC-2).
  - `modules/delivery/server/ingest.ts`: skip non-distinct commits (AC-7). This is defence in depth; AC-6 alone
    prevents duplicate entries.
- **Not touched:** `packages/auth/src/can.ts` (PLT-B05), `packages/mcp` (no gateway-wide idempotency, see D3), hr.

## Decisions needed

- **D1 Payroll access.** Proposed: the narrow `time:totals` read above. The alternative, granting Payroll `time:team`,
  would expose every timesheet's projects, days, notes and reject comments, which is more than overtime needs.
- **D2 Owner's entity source.** Proposed: `auth.user.legal_entity_id`, which needs no hr dependency and is already read
  by Time and Delivery. The alternative, hr's `getPerson`, is entity-per-employment and dated, but makes hr a hard
  dependency for approvals.
- **D3 Idempotency boundary.** Proposed: a per-tool `clientRef` on `log_time`, enforced by Time's unique index, with
  conflict detection. The alternative, a gateway-wide `Idempotency-Key` using core's `withIdempotency`, covers every
  MCP write but stores only the resource id (no input conflict check) and changes a shared package. If you prefer that,
  it would be its own platform change.
- **D4 Dismissed commit suggestions.** A commit whose suggestion was *dismissed* is suggested again on a re-push today.
  Proposed: leave that as is (only logged entries are deduplicated). Say if a dismissal should stick too.

## Tasks

<!-- Draft for review; /specclaw:plan confirms after approval. -->

- [ ] `T1` — Entity scope: owner entity in chain, `seesWeek`, reopen, lock guard and contract reads, fail-closed for an unknown entity (AC-4, AC-5)
  Files: modules/time/server/chain.ts, modules/time/server/weeks.ts, modules/time/server/team.ts, modules/time/server/reopen.ts, modules/time/server/log.ts, modules/time/contracts.ts, modules/time/tests/entity-scope.test.ts
- [ ] `T2` — `time:totals` and `approvedWeekHours`; Payroll uses it and flags incomplete reads (AC-1–AC-3)
  Files: modules/time/module.ts, modules/time/contracts.ts, modules/payroll/server/draft.ts, modules/payroll/tests/overtime-time.test.ts, modules/time/tests/totals.test.ts
  Depends: T1
- [ ] `T3` — `source_ref` migration; commit dedup in apply and in the handler; Delivery skips non-distinct commits (AC-6, AC-7)
  Files: modules/time/db/migrations/0003_entry_source_ref.sql, modules/time/server/log.ts, modules/time/suggestions.ts, modules/delivery/server/ingest.ts, modules/time/tests/commit-dedup.test.ts, modules/delivery/tests/ingest-distinct.test.ts
- [ ] `T4` — `log_time` `clientRef`: replay, conflict, concurrency (AC-8)
  Files: modules/time/mcp.ts, modules/time/server/log.ts, modules/time/tests/idempotency.test.ts
  Depends: T3
- [ ] `T5` — Integration and docs (AC-9, AC-10)
  Files: modules/time/README.md
  Depends: T2, T4

## Verify

<!-- Filled by verify. -->
