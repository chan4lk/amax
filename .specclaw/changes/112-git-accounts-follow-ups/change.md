# Git accounts follow-ups: commits credited by account, results the screen can trust, one callback slot

**Change:** 112-git-accounts-follow-ups · **Created:** 2026-11-16 · **Review:** change

**Builds on:** 108-connect-github (its two majors and three minors open at the pass-5 cap; `## Verify` and
`follow-ups.md`).

## Problem

108 stopped at the review cap with two majors open. Delivery credits a commit to whoever holds its GitHub login, without
the account id 108 now stores, so a renamed login that someone else reuses is credited to its first holder until they
reconnect. And the Git accounts screen takes its result from the URL (the skipped count, the failure reason), so anyone
can send a link that tells a person something false. Three minors ride along: the callback slot is declared twice, the
architecture doc doesn't say the app may read a slot, and a lapsed session on GitHub's return gives a bare 404.

## Mock Delta

What changes on screen, and where to see it: [`112-git-accounts-follow-ups`](../../mock/index.html#112-git-accounts-follow-ups)

No new screen. The Git accounts note after GitHub's return reads from the person's own connect record; a link that
doesn't match one says only "amax can't say how that GitHub connect went", and nothing when you're connected.

## Acceptance Criteria

1. **AC-1** A commit is credited through a GitHub identity that was connected (it has GitHub's account id) only when the
   commit's email is one of that person's verified GitHub emails, so a renamed login reused by another GitHub user is
   never credited to its first holder. When a connected login's holder and the commit's verified email's holder are
   different people, nobody is credited and the conflict is left for an Admin (product owner, 2026-11-16). An identity
   linked before 108 (no account id) yields to the email's holder, and is otherwise credited as before.
2. **AC-2** The note after GitHub's return comes from that return's own record on its connect state (the result and the
   skipped count, the first outcome standing), read by id for the viewer within the last 10 minutes. With no such record
   it says only "amax can't say how that GitHub connect went. To try again, ask amax to connect GitHub.", or nothing for
   someone connected; never a claim from the URL.
3. **AC-3** The callback slot's name and type are declared once, in `@amax/core`, and both the app's route and the module
   use that declaration.
4. **AC-4** `docs/architecture.md` says the app may also read a slot, where that slot is declared, and names this one.
5. **AC-5** GitHub's return to a signed-out browser goes to sign-in and back to the callback, never a bare 404.

## Tasks

<!-- Added by plan, UI first, then backend, then integration, in tasks.md's task-line
     format: checkbox, `Tn`, em dash, title; then indented Files: and optional Depends: lines. -->

- [x] `T1` — The screen trusts only the record: connect states keep their result and skipped count; the note reads the
  viewer's latest one within 10 minutes, and an unmatched URL code shows only the fixed sentence (AC-2)
  Files: modules/git-accounts/db/migrations/0002_connect_result.sql, modules/git-accounts/server/connect.ts,
  modules/git-accounts/server/callback.ts, modules/git-accounts/server/read.ts, modules/git-accounts/ui/ResultNote.tsx,
  modules/git-accounts/ui/GitAccountsPage.tsx, modules/git-accounts/tests/result-112.test.ts
- [x] `T2` — Commits credited by account: a connected identity credits a commit only for one of its person's verified
  GitHub emails (AC-1)
  Files: modules/delivery/server/ingest.ts, packages/auth/src/git-identity.ts, modules/delivery/tests/ingest-112.test.ts
- [x] `T3` — One slot declaration, the doc, and sign-in on a lapsed return (AC-3, AC-4, AC-5)
  Files: packages/core/src/slots.ts, packages/core/src/server.ts, apps/web/app/api/git/github/callback/route.ts,
  modules/git-accounts/server/callback.ts, docs/architecture.md

## Verify

<!-- Filled by verify: a **Verdict:** PASS|FAIL line, then one `- AC-n: pass|fail — evidence`
     line per criterion, quality before → after, preset check, and screenshot paths
     (or "compared by eye: <who>"). -->

**Verdict:** PASS — every AC passes below. The review stopped at the five-pass cap (AGENTS.md) with 0 blockers and 1
major open (below and in `follow-ups.md`, for a follow-up change).

- AC-1: pass — `ingest-112.test.ts` table: a connected person's own verified email credits them; a reused login with a
  stranger's email, or an email the person never verified, credits nobody; a connected login with someone else's verified
  email credits nobody (the product owner's rule, 2026-11-16); a login linked before 108 yields to the email's holder and
  is otherwise credited as before. Open: that conflict isn't yet raised to an Admin (see Review).
- AC-2: pass — `result-112.test.ts`: every return is recorded on its own state and read by id for the viewer (success,
  refusal, declined, incomplete, a reused link); the first outcome stands; a duplicate return while the first waits on
  GitHub only reads; a non-UUID ref reads nothing; with no record the note is the neutral sentence, or nothing when
  connected.
- AC-3: pass — `GITHUB_CALLBACK_SLOT` and `GitHubCallback` are declared once in `packages/core/src/slots.ts`; the route
  and the module import them; the e2e connect runs through the slot.
- AC-4: pass — `docs/architecture.md`, Module slots: the app may read a slot, where it is declared, and this one.
- AC-5: pass — e2e `git-accounts.spec.ts` "112 AC5": a real return to a signed-out browser goes to sign-in, resumes
  through Git accounts, and finishes the connect (on a cold server too); the callback is on the gate's public list and
  checks the session itself.

Commands: git-accounts (30), auth (82), web (370), delivery's ingest, owner and attribution tests (29) pass; type checks
exit 0 for core, auth, git-accounts, delivery, web. e2e on `next dev` with the e2e database: `git-accounts` (2) pass.
`specclaw-verify size`: 158 production lines against 108's head (`fdfcf943`), cap 400, exit 0. No new screen: screenshot
`shots/mock.png`.

Quality: not_run (specclaw-quality-scan: jq "Argument list too long" on this Windows host)

Review: OPEN — 5 rounds, final pass missing, models opus/opus; last round 0/1/1 b/M/m. Stopped at the five-pass cap: five
final passes; round 4 escalated on whom a conflicting commit credits, and the product owner chose nobody. Open major, for
a follow-up change: a commit credited to nobody because of that conflict is not raised anywhere an Admin sees it (it
looks like an unknown author's). Open minor in `follow-ups.md`: a return that changes no row still writes an audit entry.
