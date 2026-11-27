# GitHub app follow-ups: a mismatch return caught wherever it lands, a wrong secret said plainly, and "configured" means usable

**Change:** 139-github-app-follow-ups · **Created:** 2026-11-16 · **Review:** change

## Problem

116 stopped at the five-pass review cap with three majors open (its `follow-ups.md`, round 5):

1. GitHub's own `error=redirect_uri_mismatch&state=…` return is forwarded to the callback only from the homepage, but a
   wrong Redirect URI can name any page.
2. A mistyped Client secret (`incorrect_client_credentials` at the token exchange) reads "GitHub didn't answer… Try
   again", which can never succeed.
3. "Configured" is only `hasSecret`, so the nudge, the Admin suggestions and the Integrations chip can call a value
   that `app()` refuses "Configured". The read side and the write side also check the format differently.

Asked by the product owner (2026-11-16): fix them on the 116 branch.

## Mock Delta

What changes on screen, and where to see it: [`139-github-app-follow-ups`](../../mock/index.html#139-github-app-follow-ups)

No new screen. Git accounts gains one result line for a wrong secret, and the Integrations row can say "Incomplete".

## Acceptance Criteria

1. **AC-1** The proxy (`apps/web/proxy.ts`) sends any page request carrying `error=redirect_uri_mismatch` and a
   `state` to `/api/git/github/callback` with those two values, whatever its path and whether or not anyone is signed
   in, so the claim is recorded as `callback`. Overview's own forward is removed. The callback route itself is never
   redirected.
2. **AC-2** At the token exchange, each GitHub error that only an Admin can fix (`incorrect_client_credentials`,
   `redirect_uri_mismatch`) maps to a result that says what to fix. A wrong Client ID or secret gives the new result
   `credentials`: "GitHub wasn't connected: GitHub refused the app's Client ID
   or secret. An Admin replaces the GitHub app (Settings › Integrations)". It is never "Try again".
3. **AC-3** One `parseGitHubApp(value)` in `modules/git-accounts/server/app.ts` decides whether a stored value is a
   usable `<client id>:<client secret>`. It is used by:
   - `app()` (the reader)
   - `checkClientId` / `checkClientSecret` (the writer)
   - the status, which gains `incomplete`

   Review round 3 escalated: the status is one `state` that every consumer switches on, never a yes/no to lean on (the
   product owner chose this redesign, 2026-11-16). The states are `none`, `expired`, `incomplete` (the value doesn't
   parse), `unchecked` (it couldn't be read, with `checkProblem` saying why; also for those who don't manage credentials)
   and `ready`. Integrations shows each one as itself, and only `ready` is green. Chat offers Set up for none, expired and
   incomplete, Rotate for ready, and Remove for ready and unchecked.

   For those who manage credentials, `ready` needs the value to parse. An unparseable value shows
   "Incomplete" on Integrations and gets the Admin's **Set up the GitHub app** suggestion (not Rotate). Reading the
   value is an audited credential use, so the answer is kept per tenant until the credential is next rotated. The
   Overview nudge stays on the credential existing, since reading it for every person on every load would audit a use
   each time. A person who connects against an incomplete value gets 116's clear refusal ("The GitHub app's credential
   is incomplete…").
4. **AC-4** Variant tests for each, the git-accounts and admin suites and the git-accounts e2e pass, and nothing in
   116's acceptance criteria changes.

## Tasks

- [x] `T1` — A mismatch return caught wherever it lands (AC-1)
  Files: apps/web/proxy.ts, apps/web/lib/github-return.ts, apps/web/app/(app)/page.tsx
- [x] `T2` — A wrong Client ID or secret said plainly (AC-2)
  Files: modules/git-accounts/server/github.ts, modules/git-accounts/server/connect.ts, modules/git-accounts/words.ts
- [x] `T3` — One parse of the GitHub app's value; "configured" means usable for those who manage it (AC-3)
  Files: modules/git-accounts/server/app.ts, modules/git-accounts/server/read.ts, modules/git-accounts/chat-suggestions.ts, apps/web/components/settings/GitHubAppCard.tsx,
  apps/web/app/(app)/settings/integrations/page.tsx
- [x] `T4` — Variant tests (AC-4)
  Files: modules/git-accounts/tests/follow-ups-117.test.ts, modules/git-accounts/tests/setup.ts, apps/web/tests/github-return-117.test.ts

## Verify

**Verdict:** PASS. Every AC passes below. The review stopped at the five-pass cap (AGENTS.md) with **0 blockers, 2
majors and 4 minors open**, all recorded in `follow-ups.md`. Round 3 escalated, and the product owner chose the
one-state redesign. The 2 majors:

1. The Connect GitHub suggestion and the Overview nudge still read "a credential exists", not the app's state. An
   incomplete value still invites people to connect, and they then get 116's clear refusal.
2. A successful check is kept until the next rotation, so an outage that starts after it still reads as `ready`.

- AC-1: pass. The proxy sends a `redirect_uri_mismatch` return to the callback from any page, signed in or not.
  - `apps/web/tests/github-return-117.test.ts`: the homepage, Git accounts, `/signin` and Auth.js's callback are
    forwarded; the callback itself, other errors, a missing state and ordinary pages are left alone.
  - Live (e2e server): a signed-out `/signin?error=redirect_uri_mismatch&state=…` redirects (307) to the callback.
  - `app-116.test.ts`: GitHub's own mismatch return records the `callback` result.
- AC-2: pass. At the token exchange, `incorrect_client_credentials` gives `credentials` ("An Admin replaces the GitHub
  app", never "Try again") and `redirect_uri_mismatch` gives `callback`; an unknown code still gives `github`. The fake
  GitHub checks the client id and secret (`follow-ups-117.test.ts`, a table that runs a real connect for each row).
- AC-3: pass. `parseGitHubApp` is the one rule for writer, reader and status (table). The status is one `state`:
  `none`, `expired`, `incomplete`, `unchecked` (with its reason) or `ready`.
  - Consumers: the Integrations card and the Admin suggestions switch on `state` (`follow-ups-117.test.ts`, a states ×
    consumers table that includes two outages with recovery and a person who can't check; `github-app-card-117.test.ts`).
  - The card mirrors the module's states, checked by `github-app-states-117.test.ts`, and falls back to "Unknown state".
  - Every reason branch, a refused use included, is in `problem-117.test.ts`.
  - The value check is kept per tenant until the next rotation.
- AC-4: pass. git-accounts 79/79 (Postgres); the web 117 and 116 tests 17/17; typecheck 3/3 (web, git-accounts,
  delivery); the git-accounts e2e 3/3; nothing in 116's acceptance criteria changed.
- Review: OPEN — 5 rounds, final pass missing, models opus/opus; last round 0/2/3 b/M/m; stopped at the cap with no
  blockers (AGENTS.md).
- Screenshots: no new screen. The mock section is `#139-github-app-follow-ups`, and the e2e covers Integrations.
