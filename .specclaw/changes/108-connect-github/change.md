# Connect GitHub: each person links their GitHub login and verified emails, so their commits and proposals carry their name

**Change:** 108-connect-github · **Created:** 2026-11-15 · **Review:** change

Lane exemption: the platform pieces (the auth migration and identity helpers, the `github-oauth` connector and the
GitHub URL env vars, chat's link after a confirm, the callback route) exist only for this module and ship with it in
one change (product owner, 2026-11-16, review round 1).

Size waiver: one new module (Git accounts) whose screen, tools and OAuth connect only work together; splitting leaves a half-built connect flow (product owner, 2026-11-16).

## Problem

amax gives a spec proposal its owner, and drafts 104's hours, only for a commit email that is a person's account email
or a verified git identity. The only way to verify one today is a push webhook plus an Admin accepting a link
suggestion, and only for an email that already matches the account. GitHub no-reply addresses
(`<id>+<login>@users.noreply.github.com`) and second addresses never match, so on the amax repo every proposal comes in
Unassigned. A commit email alone proves nothing, since anyone can set it in `git config`. Asked 2026-11-15 by the
product owner (Umar Ahamed): let each person connect their GitHub account so their emails are read, stored and used.

**Out of scope:** Azure DevOps (the same shape, later); the amax plugin offering project setup.

## Mock Delta

What changes on screen, and where to see it: [`108-connect-github`](../../mock/index.html#108-connect-github)

The profile menu gains **Git accounts**. The screen shows GitHub "Not connected" with **Ask amax · Connect GitHub**; chat
answers with a card whose button opens GitHub. Once approved it shows "Connected as @kasun-dias" and the verified emails
amax will match commits by, with **Ask amax · Disconnect**. With no GitHub app configured it says an Admin sets it up.

## Acceptance Criteria

1. **AC-1** With the GitHub app set up (a 031 credential, connector `github-oauth`, value `<client id>:<client secret>`,
   added by an Admin in chat: the module standard keeps credentials out of env), a person can connect GitHub: chat's
   **Connect GitHub** card, once confirmed, offers **Continue to GitHub** to GitHub's authorize page (scopes
   `read:user user:email`), and GitHub returns to amax's callback. Without it, the Git accounts screen and chat say
   "GitHub isn't set up for this workspace; an Admin adds the GitHub app", and Settings › Integrations shows GitHub
   accounts as not configured.
2. **AC-2** The callback accepts only a `state` it issued to the same signed-in person, once, within 10 minutes;
   anything else is refused and nothing is linked.
3. **AC-3** On approval amax reads the GitHub user (login and numeric id) and every email GitHub marks verified,
   including the no-reply one, and stores each as a verified `auth.git_identity` (provider github) for that person, in
   one audited write (`<person> connected GitHub as @login: 3 emails`). Unverified GitHub emails are not stored. amax
   keeps no GitHub token after the callback.
4. **AC-4** One GitHub login can hold several emails (the schema allows it). Reconnecting updates the set: emails
   GitHub no longer lists are removed, new ones added.
5. **AC-5** A login or email already linked to someone else is not taken over: it is skipped, the screen names it
   (`kasun@example.test is linked to another person; ask an Admin`), and the rest are linked.
6. **AC-6** The profile menu has **Git accounts**. The screen leads with the connection status, then the login and its
   verified emails, each with a PinButton. Connect and Disconnect are Ask amax intent buttons; there are no write
   controls on the page.
7. **AC-7** "Disconnect GitHub" in chat shows a red confirm card listing what goes ("@kasun-dias and 2 emails", every
   GitHub login the person holds); confirming removes those identities, audited. Owners follow the repo (091): the card
   says that proposals named for the person only through those emails lose them as owner at the next sync.
8. **AC-8** MCP tools: `get_my_git_identities` (read), `connect_github` (returns a single-use connect link for the
   caller), `disconnect_github` (write), and for an Admin `unlink_git_identity` (one identity of any person, audited).
9. **AC-9** After connecting, the next specclaw sync names the person as owner of the changes whose author email is one
   of theirs (091's rule, unless a person set the owner), and 104 drafts hours for their commits where commit time is on.
10. **AC-10** Open `delivery.git-identity` link suggestions for the login the person just connected
    (`github:<login>`) are withdrawn, acting for that person.
11. **AC-11** The screen and cards are keyboard-complete, labelled, and read in light and dark themes; the return from
    GitHub announces the result (aria-live).

## Tasks

<!-- Added by plan, UI first, then backend, then integration, in tasks.md's task-line
     format: checkbox, `Tn`, em dash, title; then indented Files: and optional Depends: lines. -->

Plan note: AC-4's "the schema allows it" doesn't hold today: `auth.git_identity` is unique on (tenant, provider, login),
one email per login. T2 adds the migration that allows several emails per login, each email unique per provider.

- [x] `T1` — The Git accounts screen in the profile menu: a `git-accounts` module (`menu: "profile"`) whose screen leads
  with the GitHub status, then the login and each verified email with a PinButton; **Ask amax · Connect GitHub** /
  **Disconnect GitHub** intent buttons, no write controls; "GitHub isn't set up for this workspace; an Admin adds the
  GitHub app" without the app; the return from GitHub announced (aria-live); light and dark (AC-1 screen, AC-6, AC-11)
  Files: modules/git-accounts/module.ts, modules/git-accounts/package.json, modules/git-accounts/README.md,
  modules/git-accounts/ui/GitAccountsPage.tsx, modules/git-accounts/ui/AskButton.tsx, modules/git-accounts/pins.ts
- [x] `T2` — Identities by GitHub: a migration letting one login hold several emails (each email unique per provider),
  `linkGitIdentity` on the new keys, and `setGitHubIdentities` (one person's verified GitHub emails stored as verified
  identities; emails GitHub no longer lists removed; a login or email linked to someone else skipped and named) (AC-3,
  AC-4, AC-5)
  Files: packages/db/migrations/0033_git_identity_emails.sql, packages/auth/src/git-identity.ts,
  packages/auth/tests/git-identity-108.test.ts
- [x] `T3` — Connecting: `connect_github` issues a single-use state (the module's `git_accounts.connect_state`, 10
  minutes, the same person) and the authorize link (`read:user user:email`); the callback route checks the state,
  exchanges the code, reads the user and its verified emails, keeps no token, stores them in one audited write
  (`<person> connected GitHub as @login: 3 emails`) and closes open `delivery.git-identity` suggestions for those emails;
  Settings › Integrations shows GitHub accounts configured or not (AC-1, AC-2, AC-3, AC-10)
  Files: modules/git-accounts/db/migrations/0001_git_accounts.sql, modules/git-accounts/server/connect.ts,
  modules/git-accounts/server/github.ts, apps/web/app/api/git/github/callback/route.ts,
  apps/web/app/(app)/settings/integrations/page.tsx, modules/git-accounts/tests/connect-108.test.ts
  Depends: T2
- [x] `T4` — The tools and chat: `get_my_git_identities`, `connect_github` (a card whose button opens GitHub),
  `disconnect_github` (a red confirm card naming "@login and N emails"; owners kept), Admin `unlink_git_identity`, all
  through `defineService`, audited; chat suggestions on the screen (AC-7, AC-8)
  Files: modules/git-accounts/mcp.ts, modules/git-accounts/chat.ts, modules/git-accounts/server/services.ts,
  modules/git-accounts/tests/tools-108.test.ts
  Depends: T3
- [x] `T5` — End to end: with a fake GitHub (its URLs from env), a person connects, the screen shows the login and
  emails, the next specclaw sync names them owner of their changes (091's rule) and 104 drafts their hours, then they
  disconnect (AC-9, AC-11)
  Files: apps/web/tests/e2e/git-accounts.spec.ts, modules/delivery/tests/owner-108.test.ts
  Depends: T4

## Verify

<!-- Filled by verify: a **Verdict:** PASS|FAIL line, then one `- AC-n: pass|fail — evidence`
     line per criterion, quality before → after, preset check, and screenshot paths
     (or "compared by eye: <who>"). -->

**Verdict:** PASS — every AC passes below. The review stopped at the five-pass cap (AGENTS.md) with 0 blockers and 2
majors open (below and in `follow-ups.md`, for a follow-up change).

- AC-1: pass — `connect-108.test.ts` AC1 (no app: "GitHub isn't set up…"; with it, the link is GitHub's authorize page with
  the client id, `read:user user:email` and amax's callback); the app is the 031 credential `github-oauth`; Settings ›
  Integrations shows GitHub accounts (`shots/app-integrations.png`); fail closed without AMAX_BASE_URL in production.
- AC-2: pass — `connect-108.test.ts` AC2 table (a state someone else was given, over 10 minutes old, already used, never
  given: refused, nothing linked).
- AC-3: pass — `connect-108.test.ts` AC3 (two verified emails stored, the unverified one not; one audited write naming
  the person; no token in the audit); GitHub read outside any write, with timeouts (hang, reset) and checked replies.
- AC-4: pass — `git-identity-108.test.ts` (several emails per login, each email one person's; a reconnect drops what
  GitHub no longer lists; 0033 dedupes rows the old rule allowed); GitHub's account id stored, renames and reuse handled.
- AC-5: pass — `git-identity-108.test.ts` (someone else's email skipped and counted, their login taking nothing over; the
  email and login races between two writers); a connect that would link nothing is refused and rolled back.
- AC-6: pass — the Git accounts screen in the profile menu (`shots/app.png`, `shots/app-dark.png`): status first, then
  the login and pinnable emails, Ask amax Connect / Disconnect, no write controls; e2e `git-accounts.spec.ts`.
- AC-7: pass — `tools-108.test.ts` (the red card names every login and email it removes and that owners follow the repo;
  confirming removes them).
- AC-8: pass — `tools-108.test.ts` (get_my_git_identities, get_my_git_identity, connect_github, disconnect_github; only
  an Admin has unlink_git_identity).
- AC-9: pass — `owner-091.test.ts` "108 AC-9" (a no-reply-authored change has no owner, then after connecting GitHub
  the next sync names the person); 104's hours read the same verified identities.
- AC-10: pass — `connect-108.test.ts` AC10 (the open `delivery.git-identity` suggestion for the login is withdrawn).
- AC-11: pass — e2e `git-accounts.spec.ts` (connect from chat through a fake GitHub, the result in a live region, axe
  wcag2a/2aa/21aa clean on main, disconnect); light and dark screenshots.

Commands: git-accounts (19), auth (76, 11 in `git-identity-108`), ai (82), agents (7), chat (62), web (370) pass;
delivery passes but for this host's known `releases` and `create-project-surfaces`; core but for `ac5-adapters`. Type
checks exit 0 for core, auth, git-accounts, delivery, web. e2e on `next dev` with the e2e database: `git-accounts`,
`project-team`, `set-up-project*`, `retention` pass; the notifications bell test fails here with git-accounts switched off
too (a date-drift failure, not this change). `specclaw-verify size`: 522 production lines against 111's head, over the
cap, with the size waiver. `specclaw-preset-check .`: exit 1, the repo-wide comment backlog as in 066–110. Screenshots:
`shots/app.png`, `shots/app-dark.png`, `shots/app-integrations.png`, `shots/mock.png`.

Quality: not_run (specclaw-quality-scan: jq "Argument list too long" on this Windows host)

Review: OPEN — 5 rounds, final pass missing, models opus/opus; last round 0/2/2 b/M/m; fix proof not proven: no
review.test_command configured. Stopped at the five-pass cap: round 1, round 2 and three final passes. Open majors, for a
follow-up change: delivery's commit attribution still matches a GitHub login without its stored account id, so a renamed
login someone else reuses is credited to its first holder until they reconnect; the Git accounts screen still shows the
skipped count and failure codes from the URL (keep them on the connect record instead). Open minors in `follow-ups.md`:
the callback slot's name and type are declared twice (app and module); docs/architecture.md doesn't yet say the app may
read a slot; a lapsed session on GitHub's return gives a bare 404.
