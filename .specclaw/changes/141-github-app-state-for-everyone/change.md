# The GitHub app's state for everyone: connecting follows it, a stale success expires, and a working app looks working

**Change:** 141-github-app-state-for-everyone · **Created:** 2026-11-17 · **Review:** change

## Problem

117 stopped at the five-pass cap with two majors open, and 118's final pass left three minors (their `follow-ups.md`):

- **Connect ignores the app's state.** The Connect GitHub suggestion and the Overview nudge read "a credential exists",
  so an incomplete value still invites people to connect, and each attempt then fails.
- **A stale success.** A successful check is kept until the next rotation, so an outage that starts later still reads
  as "ready".
- **A working app looks broken to most people.** Someone who can't manage credentials gets `unchecked`, and the card
  shows a working app as a red "Not checked".
- **The export.** The CSV's Owner column leaves an ownerless proposal blank instead of using 118's label.
- **The card's fields.** Only the card's `state` list is checked against the module; its other fields aren't.

Asked by the product owner (2026-11-17).

## Mock Delta

What changes on screen, and where to see it: [`141-github-app-state-for-everyone`](../../mock/index.html#141-github-app-state-for-everyone)

- An Engineer sees "Configured" on a working app.
- People aren't invited to connect while the app is incomplete.

## Acceptance Criteria

1. **AC-1** The app's state is checked for everyone, through a job context acting for the viewer, the same way the
   connect reads the credential. The `unchecked` state then means only that the read failed (with its reason), never
   "not allowed to check". `rotatedAt` stays for those who manage credentials.
2. **AC-2** The Connect GitHub suggestion and the Overview nudge appear only when the app's state is `ready`. An
   `incomplete`, `expired`, `none` or `unchecked` app invites nobody to connect.
3. **AC-3** A successful check is kept for at most 10 minutes, and is dropped as soon as any use of the GitHub app's
   credential fails. So the status says `ready` only when a recent read succeeded. Concurrent checks still share one
   read. Review round 1: amax runs as several processes, so the check is keyed on the credential's version from the
   database as well. A new app is seen by every process at once; a failure in another process is seen within the
   10 minutes; a failure in this process at once.
4. **AC-4** The CSV export's Owner column is `ownerLabel` ("Unassigned" or "Not recorded" for an ownerless proposal).
5. **AC-5** A test compares every field the Integrations card reads with what `get_github_app_status` returns, not only
   `state`.
6. **AC-6** Variant tests for each, and the git-accounts, delivery and web suites, the git-accounts e2e and typecheck
   pass. Nothing in 116–118's acceptance criteria changes, except that 117 AC-3's `unchecked` for people who don't manage
   credentials becomes their real state (AC-1).

## Tasks

- [x] `T1` — Everyone's state from one check that expires; connect follows it (AC-1, AC-2, AC-3)
  Files: modules/git-accounts/server/app.ts, modules/git-accounts/server/read.ts, modules/git-accounts/chat-suggestions.ts,
  modules/git-accounts/overview.ts
- [x] `T2` — The CSV owner label (AC-4)
  Files: modules/delivery/ui/ProposalsPage.tsx
- [x] `T3` — Tests (AC-5, AC-6)
  Files: modules/git-accounts/tests/state-119.test.ts, modules/git-accounts/tests/follow-ups-117.test.ts,
  modules/git-accounts/tests/nudge-116.test.ts, modules/delivery/tests/csv-owner-119.test.ts

## Verify

**Verdict:** PASS. Every AC passes below. The git-accounts browser e2e wasn't run locally: Next.js 16.4.2 now stops
at start with a security-upgrade notice when started from the agent's shell. CI runs it with the PR.

- AC-1: pass. Every viewer gets the app's real state: the row and the check are read through a job context acting for
  the viewer, as the connect reads the credential. An Engineer sees `ready` for a working app and `expired` for an
  expired one; `rotatedAt` stays for those who manage credentials (`state-119.test.ts`; `follow-ups-117.test.ts`,
  whose non-Admin row is now `ready`; `nudge-116.test.ts`).
- AC-2: pass. The Connect GitHub suggestion, the Overview nudge and the Git accounts page's Connect button appear only
  when the state is `ready`. When it isn't, the page says "GitHub can't be connected right now…" (`state-119.test.ts`,
  a table over ready, incomplete, none and expired × the three places).
- AC-3: pass. A successful check is kept for at most 10 minutes, keyed on the credential's version from the database,
  so another process's new app is seen at once. Another process's outage is seen when the lifetime ends; a failed use
  here drops it at once (`state-119.test.ts`).
- AC-4: pass. The CSV's Owner column reads "Unassigned", "Not recorded" or the name (`csv-owner-119.test.ts`).
- AC-5: pass. Every field the Integrations card reads is one the status returns (`state-119.test.ts`), alongside 117's
  state-list check.
- AC-6: pass, with the e2e left to CI (above). Results:
  - git-accounts 83/83 (Postgres)
  - delivery owner and CSV tests 17/17
  - web 117 tests 14/14
  - typecheck 3/3 (web, git-accounts, delivery)
- Review: CLEAN — 4 rounds, final pass 4dbfea80de, models opus/opus; last round 0/0/2 b/M/m. The final pass also listed
  one pre-existing major, recorded in `follow-ups.md`: the `connect_github` card and `get_my_git_identities` still
  read "a credential exists". Against an incomplete app, a Connect card can still be raised in chat, and pressing it
  gives 116's clear refusal.
- Screenshots: no new screen. The mock section is `#141-github-app-state-for-everyone`.
