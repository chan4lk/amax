# Set up a project from one card in chat: create it and link its repo in one confirm

**Change:** 106-set-up-project-card · **Created:** 2026-11-15 · **Review:** change · **PR:** [#118](https://github.com/chan4lk/amax/pull/118)

Size waiver: one feature, granted by the product owner 2026-11-15. The reusable editable card fields (chat engine and
UI) ship with their first user, the Set up a project card; split, the form would ship unused. About 510 production
lines against 105; the checker counts from the stale `origin/main` (b257a6d), so it reports the whole stack.

## Problem

"New project" in chat asks for the name, client, key and billing one message at a time before any card appears, and
linking the repo is a second flow with three more questions. People don't know the next question until they answer the
last one, and it misses Internal billing though the tool takes it. Asked 2026-11-15 by the product owner (Umar Ahamed):
one card, already filled in, that creates the project and links its repo with one click.

**Decided 2026-11-15 (product owner):** a chat card may hold several editable fields. It is still the pending-action
confirm in chat, not a form on a page, so rule 1 holds: nothing is written until the card's button is pressed.

**Out of scope (later changes):** a team row and choosing another PM (project team, Allocations); the amax plugin
offering this setup when a sync names an unknown project; Connect GitHub.

**Amendment 1 (2026-11-15, product owner, after the build):** on `/delivery`, the **New project** button opened chat
with "tell me the details" and chat suggested nothing on the project list. Chat now suggests setting up a project and
linking a repo there (AC-13, AC-14). Revised the same day by the product owner: opening chat (New project or Ask amax)
never sends a message of its own; it shows the suggestions, and a picked one fills the message box for the person to
send.

## Mock Delta

What changes on screen, and where to see it: [`106-set-up-project-card`](../../mock/index.html#106-set-up-project-card)

In chat, "New project" (or "set up a project for the amax repo") gets one **Set up a project** card at once: Name, Key
(with "✓ free" or "taken"), Client chips, Billing chips (Fixed, T&M, Retainer, Internal), PM "You", and an optional Repo
section with Branch chips (main preselected). One button, **Create AMX and link repo** (or **Create AMX** with no repo).
"Link a repo" on an existing project gets the same Repo and Branch fields on its card instead of three questions.

## Acceptance Criteria

1. **AC-1** A new MCP write tool `set_up_project` takes `key`, `name`, `client`, `billing` (fixed, t&m, retainer,
   internal) and an optional `repoUrl` with `defaultBranch` (default `main`). It creates the project with its default
   environments, makes the caller its manager and, when a repo is given, links it, in one `defineService` transaction:
   both happen or neither. It is audited and emits the same events as `create_project` and `link_project_repo`.
2. **AC-2** `set_up_project` needs `delivery:project:create`, plus `delivery:project:link` when a repo is given, and is
   refused otherwise with the reason. The repo URL is checked as `link_project_repo` checks it: a URL holding a user
   name or token is refused.
3. **AC-3** In chat, "New project" (the intent button or plain words such as "set up a project for the amax repo")
   shows the **Set up a project** card in the first reply, with no question in text first. Every field the message, a
   pinned record or the user's projects tell is already filled; the rest are empty on the card.
4. **AC-4** Name and Key are text fields on the card. Key is suggested from the name (2–10 capitals or digits, e.g.
   "amax" → AMX) and checked as it changes: "✓ free · proposal ids AMX-001" or "AMX is taken" / "2–10 capitals or
   digits". The button is disabled while the key is invalid or taken. A note says the key can't change later.
5. **AC-5** Client offers the tenant's existing clients and Internal as chips, plus a text field for a new one. Billing
   offers four chips: Fixed, T&M, Retainer, Internal. PM reads "You" (not editable in this change).
6. **AC-6** The Repo section is optional and collapsed when empty. Its URL field and Branch chips (main preselected, the
   project's or repo's other known branches if any, and "other…" with a text field) fill `repoUrl` and `defaultBranch`.
7. **AC-7** The button names the action: **Create AMX and link repo**, or **Create AMX** with no repo. Nothing is
   written until it is pressed. After it succeeds the card folds to one line, "✓ Created AMX · amax, linked
   github.com/example/portal (main)", and the project's page shows it with the Repo sync card.
8. **AC-8** A key taken between showing the card and pressing the button (or any refusal) keeps the card open with the
   reason next to the field, and nothing is created. Pressing the button twice creates one project.
9. **AC-9** "Link a repo" for an existing project shows one card with the project, Repo URL and Branch fields (main
   preselected) instead of asking three questions; it runs `link_project_repo` as today.
10. **AC-10** A person without `delivery:project:create` doesn't get the card; chat says a PM or Admin sets projects up.
11. **AC-11** The card is keyboard-complete (Tab order Name, Key, Client, Billing, Repo, Branch, button; chips are radio
    groups), every field has a label, field errors are announced (aria-live), and it reads in light and dark themes.
12. **AC-12** `create_project` and `link_project_repo` keep working over MCP unchanged; the chat intents' billing
    options include Internal.
13. **AC-13** (Amendment 1) The **New project** button and Ask amax on `/delivery` open chat without sending anything to
    the model and without a "tell me the details" line: chat shows the page's suggestions, **Set up a project** first.
    Picking it fills "Set up a new project"; sending that brings the Set up a project card.
14. **AC-14** (Amendment 1) Opening chat on `/delivery` suggests **Set up a project** and **Link a repo to a project**
    (each only for someone who may do it) and **Which projects need attention?**; on a project's page with no linked repo
    it suggests **Link a repo** to someone who may link it. A suggestion fills the message box, as chat's suggestions do.

## Tasks

- [x] `T1` — Editable fields on chat's confirm card: a tool's card may declare a `form` (text fields, chip groups with
  an "other…" text field, an optional collapsible section); the card renders it with labels, field errors announced
  (aria-live), radio-group chips, keyboard order, both themes, and the button label following the fields (AC-4, AC-5,
  AC-6, AC-7, AC-11)
  Files: packages/core/src/module.ts, packages/chat/src/engine.ts, apps/web/components/chat/CardForm.tsx,
  apps/web/components/chat/ConfirmCard.tsx, apps/web/components/chat/Chat.tsx, packages/ui/src/styles/chat.css
- [x] `T2` — Confirm with edits: `confirmChat` sends the card's edited fields; the engine merges only fields the card
  declared, parses the tool's input again, reruns its propose check, and runs it under the card's one key, so a refusal
  keeps the card open with the reason by its field and a second press writes nothing more; a `checkCardField` action
  answers a field's check while it is edited (AC-4, AC-8)
  Files: packages/chat/src/engine.ts, apps/web/app/actions/chat.ts, apps/web/components/chat/Chat.tsx,
  packages/chat/tests/card-form.test.ts
  Depends: T1
- [x] `T3` — `set_up_project`: one `defineService` that creates the project with its environments, makes the caller
  manager and, with a repo, links it (link step shared with `link_project_repo`), audited, both events emitted; MCP tool
  with `delivery:project:create` plus `delivery:project:link` when a repo is given, the repo URL checked as linking
  checks it, and a propose check for key format and a free key (AC-1, AC-2, AC-8, AC-12)
  Files: modules/delivery/server/set-up-project.ts, modules/delivery/server/repo-sync.ts,
  modules/delivery/server/project-create.ts, modules/delivery/mcp.ts, modules/delivery/tests/set-up-project-106.test.ts
- [x] `T4` — The Set up a project card and intents: the card's form (name; key suggested from the name with "✓ free ·
  proposal ids KEY-001" / taken / format; client chips from existing clients plus Internal and a new one; four billing
  chips; PM "You"; repo URL and branch chips with main preselected), titled and labelled "Create KEY and link repo" or
  "Create KEY"; "New project" calls it in the first reply with what the message or pins tell; "Link a repo" gets the
  repo and branch form on `link_project_repo`'s card; billing options include Internal; no card without
  `delivery:project:create` (AC-3, AC-4, AC-5, AC-6, AC-9, AC-10, AC-12)
  Files: modules/delivery/chat.ts, modules/delivery/server/set-up-project-card.ts, modules/delivery/server/write-cards.ts,
  modules/delivery/mcp.ts, modules/delivery/tests/chat-106.test.ts
  Depends: T1, T3
- [x] `T5` — End to end and docs: the scripted chat sets up a project with a repo (edits the key on the card, sees a
  taken key refused, creates, sees the receipt and the project page's Repo sync card) and links a repo to an existing
  project; keyboard-only pass and axe check of the card; Delivery README's chat section (AC-3, AC-7, AC-8, AC-9, AC-11)
  Files: apps/web/tests/e2e/set-up-project.spec.ts, modules/delivery/README.md
  Depends: T2, T4
- [x] `T6` — Amendment 1: opening chat on `/delivery` sends nothing and shows the suggestions; Delivery's chat suggests Set up a project, Link a repo to a project and Which projects need attention? on `/delivery`,
  and Link a repo on a project page with no repo, each only when allowed; the scripted model answers "Set up a new
  project"; e2e for the button and the suggestions (AC-13, AC-14)
  Files: packages/ui/src/components/PinButton.tsx, apps/web/components/chat/Chat.tsx, modules/delivery/ui/ProjectsPage.tsx,
  modules/delivery/chat-suggestions.ts, packages/ai/src/scripted-writes.ts, modules/delivery/tests/chat-106.test.ts,
  apps/web/tests/e2e/set-up-project.spec.ts
  Depends: T5

## Verify

<!-- Filled by verify: a **Verdict:** PASS|FAIL line, then one `- AC-n: pass|fail — evidence`
     line per criterion, quality before → after, preset check, and screenshot paths
     (or "compared by eye: <who>"). -->

**Verdict:** PASS

- AC-1: pass — `modules/delivery/tests/set-up-project-106.test.ts` AC-1: one write creates NWP with Dev/QA/UAT/Prod, the caller as
  manager and the link (main), one `delivery.project.setup` audit entry.
- AC-2: pass — same file AC-2: an Engineer is refused, a repo URL holding credentials is refused, nothing is created; a repo
  link without a viewer is refused (review round 1).
- AC-3: pass — `modules/delivery/tests/chat-106.test.ts` AC3 (the first reply is the card, given fields filled, the rest
  empty); e2e `set-up-project.spec.ts` test 1; a draft tool with no fields makes no card (`packages/chat/tests/card-draft.test.ts`).
- AC-4: pass — `packages/chat/tests/card-form.test.ts` AC4 (schema then the tool's check, each naming its field); e2e: CON
  is taken, the button disabled, NWP "✓ free · proposal ids NWP-001"; a key given in the message is kept
  (`set-up-project-fields.spec.ts`); the ✓ shows only after a passing check (`apps/web/tests/card-form-106.test.ts`).
- AC-5: pass — `chat-106.test.ts` AC5 (Internal and existing clients with "+ new…", four billing chips); e2e types a
  multi-word client key by key (`set-up-project.spec.ts`, `apps/web/tests/card-chips-106.test.ts`).
- AC-6: pass — e2e: the Repo section opens, main preselected, and stays open with focus when its URL is cleared; an empty
  "other…" branch is refused (`set-up-project-fields.spec.ts`, `card-draft.test.ts`).
- AC-7: pass — `chat-106.test.ts` AC7 and e2e: "Create NWP and link repo"; the receipt "Created NWP · Northwind Portal,
  linked github.com/example/northwind-portal (main)"; the project page's Repo sync card shows the repo.
- AC-8: pass — `card-form.test.ts` AC8 (a refusal keeps the card open by its field; one write on a second press); a failed
  reword drops the stale receipt (`card-reword.test.ts`); `set-up-project-106.test.ts` AC-8 (a taken key refused before the
  card and by the write, no link alone).
- AC-9: pass — `chat-106.test.ts` AC9; `set-up-project-r1-106.test.ts` (a relink keeps the stored branch); e2e test 3.
- AC-10: pass — `chat-106.test.ts` AC10 (Kasun isn't offered `set_up_project`).
- AC-11: pass — e2e: chips chosen with the keyboard (ArrowRight), axe wcag2a/2aa/21aa on `#chat` with no violations; light and
  dark screenshots; field errors in aria-live notes.
- AC-12: pass — `chat-106.test.ts` AC10/AC12; `create_project` and `link_project_repo` suites unchanged and passing.
- AC-13: pass — e2e: New project sends nothing and shows no "tell me the details" line; the suggestion fills "Set up a new
  project", and sending it brings the card.
- AC-14: pass — `modules/delivery/tests/chat-106-a1.test.ts` AC14 (Maya, Kasun, a project with and without a repo).

Commands: `pnpm lint` exit 0; `pnpm --filter @amax/chat --filter @amax/mcp --filter @amax/delivery --filter @amax/ai
--filter @amax/ui test` exit 1 in the parallel run (trace-ac1, trace-store-down, authors-091: they share the database;
each passes alone), the 106 and review suites pass; web tests pass but for this host's two known load timeouts; e2e
(`set-up-project*.spec.ts`, 6 tests) passed on `next dev` with the e2e database (this host's `next start` fails with
`output: standalone`). `specclaw-verify size`: exit 0 with the size waiver. `specclaw-preset-check .`: exit 1, the
repo-wide backlog as in 066–105 (4,325 violations). Screenshots: `shots/app.png`, `shots/app-dark.png`,
`shots/app-suggestions.png`, `shots/mock.png` (the mock's sections from 047 on are nested in hidden ones, an older
markup slip, so the section was moved into view to shoot it).

Review: CLEAN — 5 rounds, final pass 845d0e486b, models opus/opus; last round 0/0/3 b/M/m; fix proof not proven: no
review.test_command configured, so no test could prove the fix. Three minors from the final pass are open in
`follow-ups.md`.

Quality: not_run (`specclaw-quality-scan .`: jq "Argument list too long" on this Windows host, as in 066–105; no refactor
made). Every new file is under 80 lines.
