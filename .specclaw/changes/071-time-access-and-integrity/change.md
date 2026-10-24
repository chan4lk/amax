# Time access and integrity: Payroll totals, legal-entity scope, allocated projects, no duplicate hours

**Change:** 071-time-access-and-integrity · **Created:** 2026-10-22 · **Updated:** 2026-10-24 · **Builds on:** 070
(branch `specclaw/071-time-access-and-integrity`, stacked on `specclaw/070-time-entry-corrections`)

## Problem

A Payroll drafter sees only their own timesheet, so overtime comes out as zero while the run says "Approved timesheets,
N weeks" (TIM-B03). An Admin or Finance user scoped to one legal entity can see, approve and reopen another entity's
weeks, because Time never passes `legalEntityId` to `can()` (TIM-B11). The same commit pushed again can log its hours
twice (TIM-B08/DEL-B02), and so can a retried external `log_time` (TIM-B09). Evidence is in
[`../070-time-entry-corrections/audit.md`](../070-time-entry-corrections/audit.md).

**Update, 2026-10-24.** Rebased on 070 as built. 070 added paths that check access to another person's week: fixing
someone's entry (`mayFix`), the change-request reviewer chain, `remind_weeks` and `approve_weeks`, the card and
suggestion checks. These need the same entity scope. 070's soft delete means a totals read has to skip deleted entries.
070 took migrations `0003` and `0004`, so this change uses `0005`. Also from the Time page requirements:
- Anyone can log to any project (FR-5.2, FR-5.12).
- Any past or future date is accepted (FR-5.3).
- A second identical entry isn't noticed (validation rules).
- Reports' utilisation scope leaves out a PM's project members and ignores legal entity (FR-2.4, FR-2.9).

## Mock Delta

What changes on screen, and where to see it: [`071-time-access-and-integrity`](../../mock/index.html#071-time-access-and-integrity)

- **Payroll run:** the **Sources** line shows how complete the time read was, e.g. "Approved timesheets, 4 weeks,
  12 people". If some people couldn't be read, it shows a warning chip: "Timesheets: 2 of 14 people unreadable,
  overtime incomplete".
- **Team time:** shows only the weeks in the viewer's legal entities.
- **Chat, with allocation required:** asked to log to a project the person isn't allocated to that month, chat makes no
  card. It lists the projects they can log to ("You're allocated to Fleet Tracker and Contoso Portal in October")
  and asks which.
- **Chat, possible duplicate:** a `log_time` card that matches an existing entry adds the line "Already logged: Fleet
  Tracker, Wed Oct 14, 2 h, same note". It's a warning; the person can still confirm.
- **Chat, date outside the window:** a date before the back-dating limit, or in the future, gets a reply saying why,
  and no card.
- **Chat, utilisation:** an Engineer asking for a colleague's utilisation gets a reply that they can only see their
  own, with their own figure.

## Acceptance Criteria

**Payroll totals (TIM-B03)**

1. **AC-1** Time adds a permission, `time:totals`, granted to Payroll and to nobody else new. A new contract read,
   `approvedWeekHours(tx, reader, { from, to, userIds? })`, returns per person and ISO week only
   `{ userId, week, hours }`.
   - Approved weeks only, and never a soft-deleted entry (070 AC-16).
   - No projects, days, notes, comments or change requests.
   - It applies the reader's legal-entity scope and reports `unreadable: userId[]` for asked-for people outside it.
2. **AC-2** Payroll overtime uses `approvedWeekHours`.
   - A person asked for but unreadable is flagged on their slip (`overtime-unknown`).
   - The Sources line says how many people were unreadable, and never says "complete" when any were.
   - A system draft (no viewer) still says timesheets weren't read.
3. **AC-3** TIM-T02 tests:
   - A Payroll-role user drafting a group with a 46 h approved week gets 6 h of overtime.
   - A 46 h *submitted* week gives 0 h, and so does a deleted entry.
   - An Employee calling `approvedWeekHours` is refused (`ForbiddenError`).
   - A Payroll user still can't open another person's week through `get_timesheet`, Team time or
     `get_change_requests`.

**Legal-entity scope (TIM-B11)**

4. **AC-4** Every Time permission check about another person's week passes the owner's legal entity
   (`auth.user.legal_entity_id`). That covers 009's paths, and the paths 070 added:
   - **009:** the approval chain, `seesWeek`, `reopen_week`, the locked-change guard, and the contract reads' `visible()`.
   - **Corrections:** `mayFix` (fixing someone's entry), and `get_timesheet`'s entry ids.
   - **Change requests:** the reviewer chain, `get_change_requests`, `decide_change_request`.
   - **Bulk actions:** `remind_weeks` and `approve_weeks` (out-of-scope weeks are `skipped`).
   - **Chat:** the card `propose` checks, and the `chatSuggestions` checks.

   For an entity-scoped viewer, an owner with **no** entity is out of scope (fails closed, inside Time only;
   `can.ts` is untouched, PLT-B05).
5. **AC-5** An Admin scoped to entity A can't act on a person in entity B. This holds for every write tool:
   - approve, reject and remind, one person or in bulk;
   - reopen;
   - change a locked entry;
   - fix an entry;
   - decide a change request.

   They get the same error as for a missing week (070 AC-10). Entity B's weeks and requests aren't on their Team time,
   in their chat suggestions, or in their `weekTotals`/`projectHours`. Unscoped Admins are unchanged.

**No duplicate hours (TIM-B08, TIM-B09)**

6. **AC-6** Commit drafts can't log the same commit twice.
   - `time.entry` gets `source_ref text` (migration `0005_entry_source_ref.sql`), unique on
     `(tenant_id, user_id, source_ref)` where set and the entry isn't deleted.
   - An accepted commit draft stores `git:<sha>`.
   - Accepting a second suggestion for the same commit logs nothing and resolves the suggestion as "already logged".
   - The commit handler doesn't draft a suggestion when a live entry already has that ref.
7. **AC-7** Delivery's GitHub push parser skips commits with `distinct: false` (already pushed on another ref), so
   neither tasks nor time are drafted twice from one push.
8. **AC-8** `log_time` accepts an optional `clientRef` (1–100 characters), stored as `mcp:<clientRef>` in `source_ref`.
   - **Retried with the same input:** returns the first entry's id with `replayed: true`, and writes no second entry,
     audit row or event.
   - **Reused with different input** (project, day, hours, billable): refused with "clientRef already used for a
     different entry".
   - **Two concurrent calls with the same ref:** create one entry. The unique index decides; the loser reads the
     winner's row.

**Entry rules from the requirements (opt-in settings)**

9. **AC-9** Time settings (FR-5.3, Settings):
   - A per-tenant `time.setting` row (in migration `0005`) holds:
     - `requireAllocation` (default `false`)
     - `backdateWeeks` (default none)
     - `allowFuture` (default `true`)
   - `get_time_settings` (read) and `set_time_settings` (write, `time:admin`, confirm card) manage it, audited.
   - Every default reproduces today's behaviour.
10. **AC-10** Allocated projects only (FR-5.2, FR-5.12). With `requireAllocation` on, `log_time`, accepting a commit
    draft, and a correction that changes the project are refused for a project the person isn't allocated to in that
    day's month.
    - The check reads Allocations' `listAllocations` for the person (hr `personIdsForUser`).
    - The refusal names the projects they are allocated to that month.
    - The chat card check makes no card for that case, so chat asks the person to choose.
    - A PM or Admin fixing someone's entry, or applying a change request, follows the same rule for the new project.
    - With the setting off, nothing changes.
11. **AC-11** Date window (FR-5.3).
    - **Back-dating:** with `backdateWeeks` = N, a person's own `log_time`, correction, delete or change request on a
      day more than N ISO weeks before their current week (in their entity's time zone) is refused, saying the limit.
      PM and Admin fixes with a reason, and applied change requests, are exempt.
    - **Future dates:** with `allowFuture` off, a day after the person's local today is refused.
    - The chat card checks make no card for either.
12. **AC-12** Possible duplicates are flagged, not blocked (validation rules).
    - **What counts:** a `log_time` for the same person, project, day and note as a live entry.
    - **Chat:** the card gets the line "Already logged: {project}, {Wed Oct 14}, {hours} h, same note".
    - **MCP:** the result gains `possibleDuplicateOf: entryId` (an additive field).
    - The entry is still created. A `clientRef` replay (AC-8) is not a duplicate.

**Utilisation scope (FR-2.4, FR-2.9)**

13. **AC-13** Reports' hours scope (`seesHours`) matches Time's week scope:
    - **Owner:** always sees their own.
    - **Managers:** see their reports.
    - **PMs:** see people with hours on a project they manage. Today PMs see none of them unless they're also the
      person's manager.
    - **`time:team`:** sees people within the viewer's legal entities. Today the entity is ignored.

    `get_utilisation` and `get_person_utilisation` therefore never report a person the asker may not see. The
    `get_person_utilisation` description tells the model to say so and offer the asker's own figure. Reports' other
    reads keep their rules.

**Tests and docs**

14. **AC-14** Regression tests (DB-backed, none skipped):
    - TIM-T02 (AC-3).
    - A cross-entity refusal for each write and read in AC-4, including 070's.
    - The same commit processed twice (sequentially and concurrently) gives one entry.
    - `clientRef` retry, concurrency and conflict; the payroll incomplete flag.
    - With each setting on and off: allocation, back-dating, future dates.
    - A duplicate flagged and still logged.
    - Utilisation: a PM sees a project member and an entity-scoped Finance user doesn't see entity B.
    - A live run with the real model: an unallocated project, a duplicate, a colleague's utilisation.
15. **AC-15** README and tool descriptions updated. `check:graph` passes. The time, payroll, reports and delivery suites
    pass with DB tests running. Every existing test passes unmodified, except where AC-4, AC-5 or AC-13 intentionally
    narrow or correct access (listed under Verify).

## Scope

- **In `modules/time/`:**
  - Server: `server/chain.ts`, `server/weeks.ts`, `server/team.ts`, `server/reopen.ts`, `server/log.ts`,
    `server/entry.ts`, `server/correct.ts`, `server/request.ts`, `server/decide-request.ts`, `server/requests-read.ts`,
    `server/bulk.ts`, `server/sheet.ts`, the card files, and a new `server/settings.ts`.
  - Manifest and wiring: `module.ts` (permission, grant, `integratesWith: ["allocations"]`), `contracts.ts`
    (`approvedWeekHours`, entity-aware `visible`), `chat-suggestions.ts`, `suggestions.ts`, `mcp.ts`, `mcp-bulk.ts`.
  - Migration `0005_entry_source_ref.sql`, tests and README.
- **Outside (necessary):**
  - `modules/payroll/server/draft.ts`: switch to `approvedWeekHours` and report what couldn't be read (AC-2).
  - `modules/delivery/server/ingest.ts`: skip non-distinct commits (AC-7). This is defence in depth; AC-6 alone
    prevents duplicate entries.
  - `modules/reports/server/reach.ts`: `seesHours` uses Time's week scope (AC-13), through a Time contract read.
  - Allocations and hr are read through their `contracts.ts` only.
- **Not touched:** `packages/auth/src/can.ts` (PLT-B05), `packages/mcp` (no gateway-wide idempotency, see D3).
- **Migration numbers:** 073's migration becomes `0006`.

## Decisions

Approved by the product owner, 2026-10-24 ("approve"): the recommended option of each, D1–D8.

- **D1 Payroll access.** *Recommended:* the narrow `time:totals` read above. *Alternative:* granting Payroll
  `time:team`, which would expose every timesheet's projects, days, notes and reject comments. That's more than
  overtime needs.
- **D2 Owner's entity source.** *Recommended:* `auth.user.legal_entity_id`. It needs no hr dependency and Time and
  Delivery already read it. *Alternative:* hr's `getPerson`, which is per employment and dated, but makes hr a hard
  dependency for approvals.
- **D3 Idempotency boundary.** *Recommended:* a per-tool `clientRef` on `log_time`, enforced by Time's unique index,
  with conflict detection. *Alternative:* a gateway-wide `Idempotency-Key`. It would cover every MCP write, but it
  changes a shared package and stores no input to check for conflicts.
- **D4 Dismissed commit suggestions.** *Recommended:* leave it as it is: only logged entries are deduplicated. Today a
  commit whose suggestion was dismissed is suggested again on a re-push. Say if a dismissal should stick too.
- **D5 "No existing feature altered."** The product owner asked that 070 alter no existing feature. Parts of 071 can't
  meet that, because closing the access gaps is their purpose:
  - AC-4 and AC-5: entity-scoped Admins lose another entity's weeks.
  - AC-7: Delivery skips repeated commits.
  - AC-13: PMs gain their project members in Reports; entity-scoped `time:team` viewers lose other entities.

  *Recommended:* accept these as fixes, listed under Verify, and keep every *new* rule (AC-9 to AC-12) opt-in with
  today's behaviour as the default. *Alternative:* ship the new rules only, and move AC-4, AC-5 and AC-13 to their
  own change.
- **D6 Allocation granularity.** Allocations are per person per month. *Recommended:* "allocated on that date" means
  allocated to the project in that day's month.
- **D7 No allocation data.** With `requireAllocation` on, a person with no hr record or no allocations is refused,
  which fails closed. *Recommended:* the setting can only be switched on when Allocations is installed, and the
  refusal says to ask a PM or Admin for an allocation.
- **D8 Back-dating rule.** The requirements say "up to the end of the previous approved week". *Recommended:* a
  plain N-weeks limit, because it's predictable and doesn't depend on approval timing. PM and Admin fixes with a
  reason are exempt.

## Tasks

<!-- UI first, then backend, then integration. Entity scope goes into the shared checks (chainFor, seesWeek,
     mayFix, visible) with the owner's legal entity, so 009's and 070's callers inherit it. Every new rule is a
     setting that defaults to today's behaviour. -->

- [x] `T1` — Screens: the payroll run's Sources line shows "Approved timesheets, N weeks, M people" or the "X of Y people unreadable" warning chip; the `log_time` card's "Already logged" warning line (AC-2 UI, AC-12 UI)
  Files: modules/payroll/ui/PayrollPage.tsx, modules/time/server/entry-card.ts, modules/time/tests/cards.test.ts
- [x] `T2` — Entity scope: the owner's `legal_entity_id` passed to `chainFor`, `seesWeek`, `mayFix` and the contract reads' `visible()`; reopen, the locked-change guard, change requests (read, decide, reviewers), `remind_weeks`/`approve_weeks`, card and suggestion checks, `get_timesheet` entry ids; an owner with no entity fails closed for a scoped viewer (AC-4, AC-5)
  Files: modules/time/server/chain.ts, modules/time/server/entry.ts, modules/time/server/weeks.ts, modules/time/server/team.ts, modules/time/server/reopen.ts, modules/time/server/guards.ts, modules/time/server/decide.ts, modules/time/server/decide-request.ts, modules/time/server/requests-read.ts, modules/time/server/request.ts, modules/time/server/bulk.ts, modules/time/server/sheet.ts, modules/time/server/card.ts, modules/time/chat-suggestions.ts, modules/time/contracts.ts, modules/time/tests/entity-scope.test.ts
  Depends: T1
- [x] `T3` — `time:totals` and `approvedWeekHours` (approved weeks, live entries, entity scope, `unreadable`); Payroll overtime uses it, flags `overtime-unknown` slips and says how many people were unreadable (AC-1–AC-3)
  Files: modules/time/module.ts, modules/time/contracts.ts, modules/payroll/server/draft.ts, modules/payroll/tests/overtime-time.test.ts, modules/time/tests/totals.test.ts
  Depends: T2
- [x] `T4` — Migration `0005_entry_source_ref.sql` (`source_ref` with its partial unique index, `time.setting`); commit dedup on accept and in the handler; Delivery's push parser skips `distinct: false` commits (AC-6, AC-7)
  Files: modules/time/db/migrations/0005_entry_source_ref.sql, modules/time/server/log.ts, modules/time/suggestions.ts, modules/delivery/server/push.ts, modules/time/tests/commit-dedup.test.ts, modules/delivery/tests/ingest-distinct.test.ts
- [x] `T5` — `log_time` `clientRef` (replay, conflict, concurrency) and the possible-duplicate result field (AC-8, AC-12)
  Files: modules/time/mcp.ts, modules/time/server/log.ts, modules/time/tests/idempotency.test.ts
  Depends: T4
- [x] `T6` — Settings: `get_time_settings`/`set_time_settings` (Admin, confirm card, audited); the allocation check (Allocations by month, hr person) and the date window in log, correct, delete, request and commit accept, with matching card checks; `integratesWith: ["allocations"]` (AC-9–AC-11)
  Files: modules/time/server/settings.ts, modules/time/server/rules.ts, modules/time/server/log.ts, modules/time/server/correct.ts, modules/time/server/request.ts, modules/time/server/card.ts, modules/time/suggestions.ts, modules/time/mcp.ts, modules/time/module.ts, modules/time/tests/settings.test.ts
  Depends: T4
- [x] `T7` — Reports: `seesHours` uses Time's week scope through a contract read (PMs see their project members; `time:team` stays within the viewer's entities); `get_person_utilisation`'s description says to decline and offer the asker's own figure (AC-13)
  Files: modules/time/contracts.ts, modules/reports/server/reach.ts, modules/reports/server/inputs.ts, modules/reports/mcp.ts, modules/reports/tests/utilisation-scope.test.ts
  Depends: T2
- [x] `T8` — Integration: the full time, payroll, reports and delivery suites; live run with the real model (unallocated project, duplicate, colleague's utilisation); README and tool descriptions; list the intended access changes under Verify (AC-14, AC-15)
  Files: modules/time/README.md, modules/reports/README.md, modules/payroll/README.md
  Depends: T3, T5, T6, T7

## Verify

**Verdict:** PASS

Verified 2026-10-24 at `82e50ea` (branch `specclaw/071-time-access-and-integrity`, stacked on 070's `625be24`), Windows 11, `DATABASE_MIGRATE_URL=postgres://amax:amax@127.0.0.1:5440/amax`. Every AC passes. The two specclaw gates don't run clean on this host (see Gates); the product owner chose, on 2026-10-24, to record PASS with them noted, as for 070.

- AC-1: pass — `modules/payroll/tests/overtime-time.test.ts` AC3 and `server/totals.ts`: `approvedWeekHours` returns approved weeks only, live entries only (`deleted_at is null`), `{ userId, week, hours }` and nothing else; `time:totals` declared and granted to Payroll only (`module.ts`).
- AC-2: pass — overtime-time AC2: with Kasun outside a scoped Payroll drafter's entity, his slip carries `overtime-unknown`, Sources reads "Timesheets: 1 of N people unreadable, overtime incomplete" with `timeIncomplete: true`; the system-draft and no-time messages are unchanged (`standard.test.ts`, packs test). Screen: the Sources line shows that text as a warning chip (`shots/app-sources.png`, `app-sources-dark.png`).
- AC-3: pass — overtime-time AC3 (TIM-T02): a Payroll-role drafter gets "Overtime, 6 h" for Kasun's 46 h approved week; Nimal's 46 h submitted week and Tharushi's week brought under 40 h by deletes give none; Sources reads "Approved timesheets, N weeks, M people"; Kasun calling `approvedWeekHours` gets `time:totals` forbidden; the Payroll drafter gets null from `get_timesheet` and `[]` from `get_change_requests`.
- AC-4: pass — `modules/time/tests/entity-scope.test.ts`: Sahan's Admin scoped to another entity is refused approve, reject and remind with exactly the missing-week error, refused a fix (`mayFix`) and a change-request decision, `approve_weeks` skips the week, Team time and `weekTotals` are empty; an owner with no entity is out of a scoped Admin's reach and in an unscoped one's. The shared checks (`chainFor`, `seesWeek`, `mayFix`, `adminOver`, contract `visible()`) take the owner's entity, so 009's and 070's callers (reopen, lock rule, cards, suggestions, bulk, requests) inherit it.
- AC-5: pass — same test: scoped Admin refused across the write tools, the same error as a missing week; unscoped Admin then approves and reopens Kasun's week as before.
- AC-6: pass — `commit-dedup.test.ts`: two suggestions for one commit → one entry (`source_ref git:<sha>`), the second resolves `alreadyLogged` and its undo keeps the entry; a re-push drafts nothing; two accepts at once → one entry. Migration `0005_entry_source_ref.sql` (partial unique index on live entries).
- AC-7: pass — `modules/delivery/tests/ingest-distinct.test.ts`: GitHub commits with `distinct: false` are dropped, the rest kept; the existing ingest tests pass.
- AC-8: pass — `idempotency.test.ts`: a retry with the same `clientRef` returns the first id with `replayed: true` and entry, audit and event counts don't move; other hours or project → "clientRef already used for a different entry"; two concurrent calls → one entry, same id.
- AC-9: pass — `settings.test.ts`: `get_time_settings` defaults `{ requireAllocation: false, backdateWeeks: null, allowFuture: true }`; an Engineer can't set them; Sahan can, audited (`time.settings.set`); with defaults logging is as before. Live: Sahan's chat card "Change the timesheet rules · Allocated projects only".
- AC-10: pass — settings AC9/AC10: with allocation required, Tharushi's HR Insights log is refused "not allocated to HR Insights in October; allocated to Fleet Tracker and Contoso Portal that month", chat makes no card, moving an entry to HR Insights is refused; switched off, the move works. Live: no card, and chat named her two allocated projects (`shots/live-unallocated.png`).
- AC-11: pass — settings AC11: with 4 weeks back and no future dates, her own log beyond the limit and a future day are refused with the reason, and no card; Sahan logging for her on the early day is exempt; reset, it logs.
- AC-12: pass — `duplicates.test.ts`: the card adds "Already logged: Fleet Tracker, Mon Oct 26, 2 h, same note", the MCP result has `possibleDuplicateOf`, a different note doesn't. Live: `shots/live-duplicate-card.png`. The shared card shows it as a labelled line, not the mock's amber chip (card lines have no warning style).
- AC-13: pass — `modules/reports/tests/utilisation-scope.test.ts`: Sahan as PM sees none, then, as Fleet Tracker's manager, exactly the people with October Fleet Tracker hours; an Admin scoped to another entity sees nobody, unscoped sees everyone Maya does; Kasun asking for Nimal's figure gets nothing. Reports' existing tests, including the no-Time install, pass. Live: Kasun was told he can see only his own and offered it (`shots/live-colleague-utilisation.png`).
- AC-14: pass — the tests above, all DB-backed and none skipped, plus the live run (build notes below).
- AC-15: pass — time, reports and payroll READMEs updated; tool descriptions for `log_time` (`clientRef`), the settings tools and `get_person_utilisation`. `check-graph --root`: only the known R7 fixture. Existing tests unmodified except the one intended `integratesWith` assertion in `time/tests/contracts.test.ts` (`git diff 625be24 HEAD` over the four modules' tests).

Commands:
- `vitest run --config ../../vitest.config.ts --dir .`: `modules/time` 111/111 (25 files), `modules/payroll` 10/10, `modules/reports` 8/8, `modules/notifications` 7/7, `modules/finance` 8/8, `modules/allocations` 38/38, `packages/chat` 30/30, `packages/mcp` 20/20; `apps/web` tool-schemas, page-context, pin-refs, routes 9/9.
- `modules/delivery` 254/256: `releases.test.ts` and `sync-import.test.ts` fail, and fail the same with 071's `ingest.ts` swapped for 070's (pre-existing, Windows/working-tree dependent); `create-project-surfaces.test.ts` failed once under parallel load and passes alone.
- `pnpm lint` exit 0; `pnpm turbo run build --filter=./apps/web` exit 0.

Gates:
- `specclaw-preset-check .` exit 1: about 2,610 repo-wide `comment` and `max_lines` hits. 071's new files are all under 80 lines; three files already over grew: `time/contracts.ts` 112 → 116, `time/module.ts` 98 → 99, `payroll/server/draft.ts` 103 → 112.
- `specclaw-quality-scan`: not_run ("Argument list too long" in its jq step). Quality: not_run. Review: specclaw-review not installed.

Screenshots: `shots/app.png`, `app-dark.png` (Payroll run, October; the run's sources were set to the incomplete case in local demo data for the shot, then restored), `app-sources.png`, `app-sources-dark.png`, `shots/mock.png` (`#071-time-access-and-integrity`), `live-settings-card.png`, `live-unallocated.png`, `live-duplicate-card.png`, `live-colleague-utilisation.png`. Compared against the mock: the Sources chip and the chat replies match; the duplicate warning is a plain card line (above).

Build notes (2026-10-24, for verify):
- Quality: not_run (`specclaw-quality-scan`: "Argument list too long" in its jq step on this Windows host).
- Intended changes to existing behaviour (D5): entity-scoped Admins and approvers lose other entities' weeks, requests and bulk rows (AC-4, AC-5); Delivery skips `distinct: false` commits (AC-7); Reports shows a PM their project members and keeps `time:team` within its entities (AC-13). One existing assertion changed: `contracts.test.ts` now expects `integratesWith: ["hr", "leave", "allocations"]` (graph rule R4 requires it for the allocation check).
- Not here: the `approvers` notification recipient for change requests is still entity-blind (a notifications-module rule; 072 scopes that recipient).
- Pre-existing failures, not from 071 (they fail on 070's code with 071's `ingest.ts` swapped out): delivery `releases.test.ts` (assignProposals call sites) and `sync-import.test.ts` (self-sync of the working tree's `.specclaw`).
- Live run (Claude via `ANTHROPIC_API_KEY`, `pnpm dev`, local demo data with Tharushi given October allocations to Fleet Tracker and Contoso Portal, removed afterwards; rules reset to defaults): unallocated HR Insights → no card, reply named her two allocated projects; a repeat log → card line "Already logged: Fleet Tracker, Tue Oct 20, 2 h, same note"; Kasun asking for Nimal's utilisation → told he can see only his own, offered his own. Screenshots `shots/live-*.png` (second run, so the settings card reads "on → on").
