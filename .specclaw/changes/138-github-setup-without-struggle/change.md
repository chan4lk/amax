# GitHub setup without the struggle: one card for the GitHub app, chat that suggests it, a nudge to connect, and no emails in the audit record

**Change:** 138-github-setup-without-struggle · **Created:** 2026-11-16 · **Review:** change

Lane exemption: the platform pieces (core's shared expiry rule and vault words in `secrets/expiry.ts`, the card line's
`copy` and the waiting item's `snoozeDays`, the scripted model's GitHub app prompts, and in the app the Copy button,
the Integrations row, Overview's nudge order and "Not now", and the generic credential tools' `github-oauth` guard)
exist for this module's GitHub app and ship with it in one change, as 108's did (product owner, 2026-11-16).

## Problem

Setting up a real GitHub connect on 2026-11-16 took six tries.

- Chat filed the credential under `github` instead of `github-oauth`.
- The value was saved without its client id, then saved as the literal placeholder `<Client ID>:<Client secret>`.
- GitHub refused the return address because the app's Redirect URI was the homepage.
- With no key service set, every save failed.

Each of these showed only "I can't tell whether this was done". People who haven't connected aren't told to, so their commits aren't credited to them. And the connect's audit record stores the full list of linked emails, which an Admin's raw audit export would show after the person disconnects. Asked by the product owner (2026-11-16): make it effortless, and keep emails private.

## Mock Delta

What changes on screen, and where to see it: [`138-github-setup-without-struggle`](../../mock/index.html#138-github-setup-without-struggle)

- Overview, for a person who isn't connected: a "Connect GitHub" attention item.
- Settings › Integrations: the GitHub app row with its status, and chat suggestions to add, rotate or remove the app.
- The new **Set up the GitHub app** card: a Client ID field, a masked Client secret, and the callback URL to copy into GitHub.
- The clear refusals that replace "I can't tell whether this was done".

## Acceptance Criteria

1. **AC-1** A new MCP write tool `set_github_app` (in `modules/git-accounts/mcp.ts`, permission
   `secrets:credential:manage`) takes `clientId` as input and the client secret from the card's masked field. It stores
   or rotates the `github-oauth` credential as `<clientId>:<secret>`. Its confirm card shows:
   - the Client ID
   - the masked **Client secret** field
   - "Callback URL to paste into GitHub: `<callback URL>`", using the same URL `redirectUri()` builds, with a Copy button
   - "Adds" or "Replaces" the GitHub app, depending on whether one is set (review round 2: an expired app is replaced
     without the "old secret works 72 more hours" note)

   The card refuses a client id with a space, `<`, `>` or `:` in it, and a secret shorter than 20 characters or holding
   whitespace or `:`. An optional `expiresAt` (`YYYY-MM-DD`, the end of that UTC day) sets the app's expiry. On
   replace without one, the current expiry is kept by 052's rule, shared with `rotate_secret` through
   `@amax/core/secrets`: a future date or none is kept, and a past one refuses the card before the secret is typed.
2. **AC-2** `put_secret` and `rotate_secret` refuse the `github-oauth` connector outright, whatever the value, when chat
   proposes the card and when they run (over MCP too), with "Use set_github_app: the GitHub app needs its Client ID and
   Client secret". So `set_github_app` is the only writer of the GitHub app, and chat's "add or rotate the GitHub app"
   prompts pick it.
3. **AC-3** On `/settings/integrations`, chat suggests to an Admin:
   - **Set up the GitHub app** (`set_github_app`) when `github-oauth` is not set
   - **Rotate the GitHub app secret** (`set_github_app`) and **Remove the GitHub app** (`revoke_secret`, connector
     `github-oauth`) when it is

   Nobody else gets these suggestions.
4. **AC-4** The Integrations "GitHub accounts" row shows "Configured · rotated `<date>`" or "Not configured". It is pinnable
   through `get_github_app_status`, which also returns `rotatedAt` and the callback URL.
5. **AC-5** Overview leads with a "Connect GitHub so your commits and proposals are credited to you" attention item for
   a person who:
   - holds `git-accounts:connect`
   - has no GitHub login linked
   - is in a workspace with the GitHub app set up

   The item has **Ask amax · Connect GitHub** (opens chat with "Connect my GitHub"), is pinnable (`get_my_git_identities`)
   and can be dismissed for 30 days. It doesn't show once the person is connected or while the app isn't set up.
6. **AC-6** Clear refusals, never "I can't tell whether this was done", each with the tool's `invalid_input` code:
   - Connect with a malformed credential: "The GitHub app's credential is incomplete; an Admin sets it up again with Set up the GitHub app".
   - Any credential write with no key service configured: "amax can't store credentials yet: no key service is set (`AMAX_KMS`); an operator sets it".
   - Connect with a GitHub-reported redirect mismatch on return: "GitHub refused amax's callback URL; an Admin pastes `<callback URL>` into the GitHub app's Redirect URIs".
7. **AC-7** The connect's and disconnect's audit records keep counts, not addresses: `after` is
   `{ summary, login, linked: <n>, removed: <n>, skipped: <n> }`. No email address is written to `core.audit_event` by
   git-accounts. The event payload stays `{ userId, login, emails: <n> }`.
8. **AC-8** Unchanged and tested:
   - Every Git accounts read stays the viewer's own.
   - The Admin unlink still works by id.
   - `pnpm lint` (graph check included), `pnpm test` for git-accounts, core and web admin, and the `git-accounts` e2e pass.
   - The new UI is keyboard-complete, its fields are labelled, errors are announced, and it works in light and dark themes.
9. **AC-9** The clickable mock's markup is balanced, so sections 050 to 116 render (approved by the product owner
   2026-11-16). Sections 047, 049 and 048 are missing four closing tags (047's confirm `div.card` and three `</section>`),
   so the browser nests every later section inside 047's hidden section. Only those closing tags are added: no content
   in 047, 048 or 049 changes. An HTML parse of the mock finds no unclosed element, and
   `apps/mock/public/mock/index.html` matches.

## Tasks

- [x] `T1` — The screens: the Integrations row, Admin chat suggestions, the Overview nudge and the GitHub app card (AC-3, AC-4, AC-5, the UI of AC-1)
  - **Integrations:** the "GitHub accounts" row shows "Configured · rotated `<date>`" or "Not configured", pinnable through
    `get_github_app_status`. Its Ask button prompts "Set up the GitHub app" (tool `set_github_app`).
  - **Admin suggestions:** `chatSuggestions` on `/settings/integrations` offer set up, rotate or remove, each only when
    it can happen and only with `secrets:credential:manage`.
  - **Overview:** git-accounts' `overview` hook returns one `waiting` item, "Connect GitHub so your commits and proposals
    are credited to you". It has action "Ask amax · Connect GitHub", prompt "Connect my GitHub" and pin
    `get_my_git_identities`, and appears only for a person who can connect, has no GitHub login, and has the app set up.
  - **Not now:** a waiting item with `snoozeDays` gets a "Not now" button that hides it for 30 days in this browser
    (localStorage). It's a read-only control, with no server write (rule 1).
  - **The card:** `set_github_app`'s card shows the Client ID (a line, from the message: a form card can't also hold
    the masked field), the callback URL with a Copy button (`CardLine.copy`), the masked Client secret, and Adds or
    Replaces.
  Files: apps/web/app/(app)/settings/integrations/page.tsx, modules/git-accounts/chat-suggestions.ts, modules/git-accounts/overview.ts,
  modules/git-accounts/module.ts, apps/web/components/chat/CopyValue.tsx, apps/web/components/chat/ConfirmCard.tsx,
  apps/web/components/overview/WaitingTable.tsx, apps/web/components/overview/useSnoozed.ts, packages/core/src/module.ts,
  packages/core/src/overview.ts, .specclaw/mock/index.html, apps/mock/public/mock/index.html
- [x] `T2` — The tools and the server: `set_github_app`, the `github-oauth` guard, clear refusals and counts in the audit record (AC-1, AC-2, AC-6, AC-7)
  - **`set_github_app`:** in git-accounts' `mcp.ts`, permission `secrets:credential:manage`. Input `clientId` (checked:
    no space, `<`, `>` or `:`), secret from the masked field (20+ characters, no whitespace or `:`). It puts or rotates
    `github-oauth` through `putSecret` / `listCredentials` from `@amax/core/secrets`.
  - **Status:** `get_github_app_status` adds `rotatedAt` and `callbackUrl`.
  - **The guard:** `put_secret` / `rotate_secret` refuse the `github-oauth` connector outright, at propose and at run
    ("Use set_github_app…").
  - **Clear refusals (`ToolError`, `invalid_input`):** a malformed credential at connect; `SecretsUnavailableError` on
    any credential write ("no key service is set (`AMAX_KMS`)…"); GitHub's `redirect_uri_mismatch` at the token
    exchange (callback URL message). Chat then shows the message, not "I can't tell…".
  - **Audit counts:** connect and disconnect `after` hold `linked` / `removed` / `skipped` counts, not addresses.
  Files: modules/git-accounts/mcp.ts, modules/git-accounts/app-tool.ts, modules/git-accounts/words.ts,
  modules/git-accounts/server/github.ts, modules/git-accounts/server/connect.ts, modules/git-accounts/server/callback.ts,
  modules/git-accounts/server/services.ts, modules/git-accounts/server/read.ts, modules/git-accounts/server/app.ts,
  apps/web/lib/admin/secrets.ts
  Depends: T1
- [x] `T3` — Tests and the mock check (AC-8, AC-9)
  - **Tables:** the client id / secret checks (valid, placeholder `<Client ID>`, spaces, colon, short secret); the
    `github-oauth` guard on put and rotate; each refusal reaching chat as its message; audit `after` with no `@` in it;
    the nudge's three conditions; suggestions by role and state.
  - **E2E:** the git-accounts e2e sets the app up through `set_github_app`'s card, then connects.
  - **Mock:** a test that parses `.specclaw/mock/index.html` and finds no unclosed element.
  Files: modules/git-accounts/tests/app-116.test.ts, modules/git-accounts/tests/nudge-116.test.ts, modules/git-accounts/tests/setup.ts,
  apps/web/tests/admin/secret-116.test.ts, apps/web/tests/e2e/git-accounts.spec.ts, packages/ai/src/scripted.ts,
  packages/testing/tests/mock-balanced-116.test.ts
  Depends: T2

## Verify

**Verdict:** PASS. Every AC passes below. The review stopped at the five-pass cap (AGENTS.md) with **0 blockers, 3
majors and 5 minors open**, all recorded in `follow-ups.md`. The 3 majors:

1. GitHub's `redirect_uri_mismatch` return is forwarded only from the homepage, not from every page a wrong Redirect URI
   could name.
2. `incorrect_client_credentials` at the token exchange still reads as "try again".
3. `configured` doesn't check that the stored value parses (the read and write format checks differ).

- AC-1: pass. `set_github_app`, an Admin-only card:
  - It shows the Client ID, the callback URL with Copy (`CardLine.copy`) and the masked Client secret, and stores
    `<id>:<secret>`.
  - It refuses placeholders, spaces, a colon and short secrets.
  - A second setup replaces the app.
  - On replace, the expiry follows 052's shared rule. A given or kept expiry that has passed, or that isn't a real day,
    is refused before the secret is typed.

  Evidence: `modules/git-accounts/tests/app-116.test.ts` and `expiry-116.test.ts`, `packages/core/tests/secrets-words-116.test.ts`.
- AC-2: pass. `put_secret` and `rotate_secret` refuse `github-oauth` outright, both when chat proposes the card and
  when they run over MCP (`apps/web/tests/admin/secret-116.test.ts`).
- AC-3: pass. On Integrations, chat suggests Set up / Rotate / Remove, to Admins only, and each only when it can happen
  (`nudge-116.test.ts`).
- AC-4: pass. The Integrations row reads "Configured · rotated `<date>`", "Expired" or "Not configured", shows the
  callback URL with Copy, and is pinnable through `get_github_app_status`. The status also carries `expired` and
  `callbackProblem` (`nudge-116.test.ts`, `expiry-116.test.ts`, e2e).
- AC-5: pass. The Overview nudge appears only for a person who can connect, isn't connected, and whose workspace has
  the app. It leads "Waiting on you", reads "New", has "Not now" for 30 days (per person, per browser), and can't be
  selected (`nudge-116.test.ts`, `apps/web/tests/attention-116.test.ts`).
- AC-6: pass. Clear refusals reach chat as `ToolError`s:
  - a malformed credential
  - no key service, but only when `AMAX_KMS` is unset; otherwise the vault's own reason
  - GitHub's `redirect_uri_mismatch`, at the token exchange and as GitHub's own return forwarded from the homepage,
    recorded as "callback". Checked live: signed in, `/?error=redirect_uri_mismatch&state=…` lands on Git accounts.
- AC-7: pass. The audit records of connect, disconnect and the Admin unlink contain no email address, and the Admin's
  unlink answer names none (`nudge-116.test.ts`).
- AC-8: pass. Reads stay the viewer's own, and the Admin unlink works by id.
  - Tests: git-accounts 57/57 (Postgres); `apps/web/tests/admin` 184/184; core 10/10 new, with the rest as before.
  - Typecheck: `turbo lint` for core, web, ai, testing and git-accounts, 5/5.
  - `check-graph` (Docker): ok, 23 modules.
  - Git accounts e2e: 3/3, including "116 AC1 AC4 an Admin replaces the GitHub app from Integrations".
  - Core's `ac5-adapters` fails on Windows only (backslash paths); Linux CI skips `tests/`.
- AC-9: pass. `packages/testing/tests/mock-balanced-116.test.ts` (4/4): no unclosed element, and the deployed copy
  matches. All sections from 050 to 116 render (checked in Chromium).
- Review: OPEN — 5 rounds, final pass missing, models opus/opus; last round 0/3/5 b/M/m; stopped at the cap with no
  blockers (AGENTS.md).
- Screenshots: the mock section, rendered in Chromium; the e2e covers the screens in the app.
