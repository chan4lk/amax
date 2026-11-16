# Proposals: what 081's review left open

**Change:** 087-proposal-review-follow-ups · **Created:** 2026-11-07 · **Review:** change

## Problem

081's review loop stopped at the five-pass cap (PR #113) with two majors open and minors in its `follow-ups.md`:

- **Two "no owner" rules.** The list calls a proposal unassigned only when it has neither an owner user nor an owner
  name. The pin's "Make me the owner", the agent's Suggested owner and its accept guard look at the user alone. So on a
  row with only a name (every hand-made row from before 081, and some synced ones), accepting the suggestion silently
  replaces the named owner.
- **`mark_task_done` accepts a withdrawn proposal,** though every other write refuses one.
- **Seven of the minors are small and touch the same files.** They are fixed here too.

**Depends on:** 081-proposals-end-to-end (PR #113). Build on its branch until it merges.

## Mock Delta

None. No screen changes: the list, the pin's suggestions and the agent behave as the mock already shows. 087 has no
section.

## Acceptance Criteria

### The two majors

1. **AC-1** One rule decides "has no owner": no owner user **and** no owner name (`hasNoOwner` in
   `server/readiness.ts`). `needsOf` (the Unassigned chip), the pin's "Make me the owner", the agent's Suggested owner
   and the suggestion's accept guard all use it. A row with only an owner name counts as owned: nothing replaces a named
   owner by itself. Linking that owner to a person stays a deliberate `update_proposal`. A table-driven test covers
   four rows: a user and a name, a name only, a user only, and neither. It checks that the four callers agree on each.
2. **AC-2** `mark_task_done` refuses a withdrawn proposal, with a refusal that carries a code ("`<key>` was
   withdrawn"), as `reopen_task` does. A variant test covers withdrawn by hand, withdrawn by the repo (`meta.withdrawn`)
   and open (still closes).

### Minors from 081's follow-ups

3. **AC-3** A proposal URL with a malformed `%` escape shows "Proposal not found", not a server error. One safe decode
   serves `pageLabel`, the chat suggestions' proposal lookup and `ProposalsPage`. Tested with `%E0%A4%A`, `%` and a
   valid encoded key.
4. **AC-4** The list routes' "New proposal" chat suggestion shows only to someone who may create proposals
   (`canEver(delivery:proposal:create)`), the same check as the page's button.
5. **AC-5** "Reopen a task closed in the last day" is one rule, read on the database clock. The proposal's pin and the
   task row's pin use one helper, so they can't disagree.
6. **AC-6** "Log time on `<key>`" is offered only when Time is installed (`hasModule('time')`), as well as the
   permission.
7. **AC-7** A time-line pin read while Time is switched off is refused as **unavailable**: code `unavailable`,
   `retryable: true`. It's a new refusal in `server/refusal.ts`, and it is no longer `invalid_input`.
8. **AC-8** Core tells "slots never set" from "nobody fills this slot", the way `hasModule` keeps its unset list as
   `null`: `slotsSet()` says whether `setProvided` ran. When it hasn't, a proposal page doesn't claim there's no time:
   its history notes that time lines weren't read, and a time-line pin is refused as unavailable (AC-7). The app sets
   slots at boot, so this only shows in a process that never loaded the registry.
9. **AC-9** A proposal page reads at most a bounded number of Time's audit rows for its time lines (10 batches of
   200). When it stops early, the lines say the history is partial. A test plants more rows than the bound, all of
   them hidden from the viewer, and checks the read stops and reports partial.
10. **AC-10** Time's migration no longer ties `time.entry.proposal_id` to Delivery's table. A new Time migration drops
    the foreign key; `getProposalRef` still validates every write. Amended in review round 2: 0009 itself stays as
    applied, because the migration runner refuses a changed file once it has run ("add a new file instead"), so 0010
    drops the key with `if exists`. The original wording also claimed Time then migrates with Delivery off. That was
    never true: Time declares `dependsOn: ["delivery"]`, and its first migration (0001) references `delivery.project`.
    That older key is in `follow-ups.md`.

### Out of scope (stay in follow-ups)

- **The hours write's second connection** (round 3). Moving the write after the handler's transaction changes the
  event contract, so it's its own change.
- **Keying the history-line pin on the line** (round 3). The registry's pin check requires a UUID id, and a line id
  isn't one. That needs a pin-spec change in `@amax/mcp`.

## Tasks

- [x] `T1` — One "has no owner" rule for the Unassigned chip, the pin's "Make me the owner", the agent's Suggested owner and its accept guard (AC-1)
  Files: modules/delivery/server/readiness.ts, modules/delivery/server/attention.ts, modules/delivery/server/pin-offers.ts, modules/delivery/server/agent.ts, modules/delivery/server/proposal-kinds.ts, modules/delivery/tests/readiness-081.test.ts, modules/delivery/tests/proposal-agent.test.ts
- [x] `T2` — `mark_task_done` refuses a withdrawn proposal, by hand or by the repo (AC-2)
  Files: modules/delivery/server/tasks.ts, modules/delivery/tests/proposal-lifecycle.test.ts
- [x] `T3` — One safe decode of a proposal key from the URL; "New proposal" in chat gated on the create permission (AC-3, AC-4)
  Files: modules/delivery/chat-suggestions.ts, modules/delivery/ui/ProposalsPage.tsx, modules/delivery/tests/chat-081.test.ts, modules/delivery/tests/proposal-detail.test.ts
- [x] `T4` — One reopen-within-a-day rule on the database clock; "Log time" only when Time is installed (AC-5, AC-6)
  Files: modules/delivery/server/pin-offers.ts, modules/delivery/tests/pin-offers.test.ts
- [x] `T5` — An `unavailable` refusal for a time-line pin while Time is off; core says whether slots were set, and the history notes unread time lines (AC-7, AC-8)
  Files: modules/delivery/server/refusal.ts, modules/delivery/server/proposal-detail.ts, modules/delivery/ui/ProposalPage.tsx, packages/core/src/installed.ts, packages/core/src/server.ts, packages/core/tests/installed.test.ts, modules/delivery/tests/proposal-detail.test.ts
- [x] `T6` — Time's time-line read is bounded (10 batches of 200) and says when it is partial; the page shows it (AC-9)
  Files: modules/delivery/contracts.ts, modules/time/server/proposal-lines.ts, modules/delivery/server/proposal-detail.ts, modules/delivery/ui/ProposalPage.tsx, modules/time/tests/proposal-time.test.ts
  Depends: T5
- [x] `T7` — A Time migration drops `time.entry.proposal_id`'s foreign key into Delivery (AC-10)
  Files: modules/time/db/migrations/0010_entry_proposal_no_fk.sql, modules/time/tests/proposal-time.test.ts

## Verify

**Verdict:** PASS

- AC-1: pass — Delivery `proposal-agent`, 4 owner rows: chip, list, board card, update card, pin, agent, accept guard.
- AC-2: pass — `proposal-lifecycle`, withdrawn by hand, by the repo (`true` and `"true"`), and open; plus `reopen_task` and `move_proposal`.
- AC-3, AC-4: pass — `chat-081`, three URL segments and three viewers.
- AC-5, AC-6: pass — `pin-offers`, 23 h and 25 h windows; Time installed and not.
- AC-7: pass — `proposal-detail` (time-line pin refused as `unavailable`); REST `ac1-rest` (503 with `Retry-After`).
- AC-8: pass — core `installed` (`slotsSet`); `proposal-detail` (Time off, partial, complete).
- AC-9: pass — Time `proposal-time`, exactly 2,000 hidden rows (not partial) and 2,001 (partial).
- AC-10: pass — Time `proposal-time`: no key from `time.entry.proposal_id` into `delivery.proposal` after 0010 (0009 stays as applied; see AC-10).

Commands (Linux replica of CI over `7ac4aafe`, the head the final review pass ran on):
- `pnpm install --frozen-lockfile`, `pnpm db:migrate`, `pnpm lint`, `node scripts/check-module-standard.mjs`, `pnpm build`: exit 0.
- `pnpm turbo run test --concurrency=2`: exit 0, 35/35 packages.
- `pnpm --filter @amax/web e2e`: 9 passed. `pnpm --filter @amax/web e2e:auth`: 95 passed.

Notes:
- Review: `Review: CLEAN — 6 rounds, final pass 7ac4aafedb, models opus/opus; last round 0/0/3 b/M/m`. Five passes, the
  cap. Round 5 was not_run (the review backend's usage limit), so it doesn't count. Scoped to 087's own commits
  (`git.base_branch` set to `75dc88c5` for the run, then restored). The final pass at `7ac4aafe` came after every 087
  commit, so it also covers the commits PR #113 gained after 081's final pass.
- Open minors (in `follow-ups.md`): note the slot's return-type change in Delivery's README, the AC-6 test's
  module-list reset, and 0009's key (why it stays is under AC-10).
- No screen changes beyond the History note when time lines weren't read; no mock section.
- `specclaw-preset-check .`: exit 1 from the repo-wide comment backlog. `specclaw-quality-scan`: not_run (jq, as in 066–086).

### Build and review notes

Build notes (2026-11-07, Windows host, local Postgres; not a verdict, `/specclaw:verify` writes that):
- Each AC has a table-driven test: Delivery `proposal-agent` (AC-1), `proposal-lifecycle` (AC-2), `chat-081` (AC-3, AC-4),
  `pin-offers` (AC-5, AC-6), `proposal-detail` (AC-7 to AC-9); Time `proposal-time` (AC-9, AC-10); core `installed` (AC-8).
- Suites: Delivery 376/378, Time 242/243, Notifications 15/15, core 166/167, MCP 20/20, web 334/334; lint and type checks pass.
  The failures: `releases` and `ac5-adapters` (backslash paths, Windows only), `create-project-surfaces` and `grid-perf`
  (time limits under load; each passes alone).
- One older `proposal-lifecycle` case moved to an open proposal: on a withdrawn one, `mark_task_done` now refuses as withdrawn
  before it can say "has no task" (AC-2).
- AC-7 adds `unavailable` to `userFacing` in `@amax/mcp`, so chat and MCP show that refusal's message.
- Quality: not_run (`specclaw-quality-scan`: jq "Argument list too long" on this host, as in 066–086).
- CodeQL (PR #113, "missing regular expression anchor"): `navigation-081.test.ts`'s crumb regex now groups its alternation,
  `(?:…)|(?:…$)`, so the `$` plainly anchors only the last crumb. Same captures, same result (3/3).
- Review round 2 (pass 2): clean on its commit, with three earlier findings raised again.
  - **Screens:** the screens now use `hasNoOwner` too, and a row with an owner user but no stored name shows that user's name.
  - **Withdrawn:** one `isWithdrawn` and one SQL form (`withdrawnIn`), used at all ten sites.
  - **0009's foreign key:** not changed, with the reason under AC-10.
  Tests: Delivery 378/379 (`releases` is Windows-only).
- Review round 3 (pass 3): 2 majors and 2 minors, all fixed.
  - **Tests:** the AC-1 table now also checks the board card and the update card's From line.
  - **Withdrawn:** the board's spec facts and the sync's withdraw pass use `isWithdrawn`, with a table of which values count.
  - **Owner name:** one SQL fragment (`ownerShownIn`) for the owner name, with "Unknown person" when an owner user's name
    can't be read.
  Tests: Delivery 384/385 (`releases` is Windows-only).
- Final pass (pass 4): 2 majors and 3 minors.
  - **Time off:** with no Time source, the history now says the Time module isn't running, instead of showing no time.
    It's one rule with the pin's refusal, and the AC-8 test now covers Time off without depending on test order.
  - **Overview:** "Approve proposal" reads `ownerShownIn`.
  - **Stale message:** it no longer prints "(null)".
  - **Left in follow-ups:** the AC-6 test's module-list reset.
  Tests: Delivery 386/387, web 334/334.
