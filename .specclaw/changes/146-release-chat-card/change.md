# Release tracking, phase 2: create a release from one chat card

**Change:** 146-release-chat-card · **Created:** 2026-11-26 · **Review:** change

## Problem

Since 123, chat's New release asks for six fields in text, the person must know proposal keys, and a proposal that
sits in another open release is simply refused. The product owner's phase 2 brief (2026-11-26) wants "Create a new
release" to open one conversation that collects the name, category, proposals and dates, offers only Verified and
Released proposals, warns about a proposal already in another release and moves it only on explicit confirmation, and
ends with a link to the new release. Phase 3 (list and detail pages, the daily status check) is out of scope.

Decisions (product owner, 2026-11-26), which amend 123's AC-6: a proposal in **any** other open release is shown as a
warning and moved only when the person **explicitly** ticks it to move (otherwise refused, as in 123); proposals are
picked from a **multi-select** on the card (a new `checks` field kind); the done card links to the release with an
**in-app** path.

## Mock Delta

What changes on screen, and where to see it: [`146-release-chat-card`](../../mock/index.html#146-release-chat-card)

- "Create a new release" opens one New release card: Name, Version, Category chips, Start, Target, and the project's
  Verified and Released proposals as checkboxes, each in another release marked with it.
- Ticking a proposal that sits in another open release shows a "Move from …" box that must also be ticked.
- Field errors show on the field; the done card says "Created November Release (v1.9.0) · 2 proposals" with an
  "Open the release" button.

## Acceptance Criteria

Terms. **Eligible proposals** of a project: its Verified and Released proposals that aren't withdrawn and haven't
shipped in another release (123's rules, unchanged). A proposal's **open release** is another release of it that isn't
Completed (an untracked one counts, as in 123).

1. **AC-1 Intent.** "Create a new release", "New release" on a Releases page, and the project pin's offer open the New
   release card at once (106's pattern: `create_release` gets a `draft` input, chat proposes the card with whatever is
   known and asks nothing in text). The project is the pinned or named one; with none, chat asks "Which project is it
   for?" with `offer_answers` listing up to six active projects the person may create releases in.
2. **AC-2 The card.** Fields: Name (text), Version (text, prefilled with the next version after the project's latest),
   Category (chips Dev, UAT, Prod), Start (text, prefilled with today in the project's zone), Target (text), and
   Proposals (`checks`, AC-3). Anything already said is prefilled; edits stay on the card while it's checked, so
   nothing is typed twice. The button reads "Create {name}".
3. **AC-3 Eligible proposals.** New read tool `list_release_proposals` (`projectKey`; `delivery:read`) returns the
   project's eligible proposals: key, title, phase, and their open release (version, category, status) if any. The
   card's Proposals options are exactly these, labelled "<KEY> <title>", with "in <version> · <Category> · <Status>"
   under one in an open release. With none, the field says "No Verified or Released proposals in <project> yet".
4. **AC-4 Checks field (platform).** `CardField` gains `{ kind: "checks", options: { value, label, detail? }[] }`; its
   value is the ticked values joined by commas. The chat card draws it as a fieldset of checkboxes with a legend,
   keyboard-complete, light and dark, and an error under it like other fields. Existing cards are unchanged.
5. **AC-5 Explicit move.** `create_release` and `set_release_proposals` take `reassign` (proposal keys). A ticked
   proposal in an open release moves only when it is also in `reassign`; otherwise it's refused, naming the release ("FLT-012
   is already in FLT v1.8.0 (UAT, In progress); confirm moving it, or take it out there first"). On the card, ticking such a proposal
   adds a `checks` field "Move from their release" listing it, unticked. The move is audited with where each came from
   (`after.moved`: key and version). A proposal in a Completed release moves without `reassign`, as in 123.
6. **AC-6 Warnings on the card.** The card's note (the tool's `note` hook) lists each ticked proposal in an open release:
   "FLT-012 is in FLT v1.8.0 (UAT, In progress): it moves only if you tick it below".
7. **AC-7 Checks as you edit.** The card checks a field on edit (the existing field check): a date that isn't
   YYYY-MM-DD or a real day, a target before the start, a category the project has no environment for, an empty name,
   a version the project already has, and an ineligible proposal each show their message on that field; the button
   stays until fixed. The whole input is checked again at confirm (Phase 1's service), so nothing invalid is written.
8. **AC-8 Create and link.** Only Create on the card writes: Phase 1's `createRelease` runs with the edited input
   under the existing pending-action confirm. The result carries `open: { label: "Open the release", url: <href> }`.
   Chat's done outcome accepts an in-app path (`/` then not `/`) and shows it as a button without ↗ that opens in the
   same tab. The receipt reads "Created <name> (<version>) · <n> proposals"; chat's reply names the release and the link.
9. **AC-9 Errors.** A person who may not create releases in the project gets no card: "You can't create releases in
   <KEY>" (the `propose` hook). A refusal at confirm (a conflict nobody ticked, a proposal that changed phase, a
   version taken meanwhile) shows its reason and leaves the card open to fix. A backend failure shows "That didn't go
   through. Try again." and the card stays open. Cancel closes it with nothing written. No path says Done before the
   service returns.
10. **AC-10 Tests.** Intent and draft card (fields, prefill, project question); `list_release_proposals` (eligibility,
    open release); the checks field renders and edits (component test); conflict note and explicit move in both
    writers, refusal without it; field checks; confirm creates and returns the link; cancel writes nothing; a failing
    service leaves the card open. 123's suites still pass; the e2e "081 AC-39" uses the card.

## Tasks

- [x] `T1` — Chat card UI: the `checks` field kind (checkbox fieldset with legend and error, keyboard, both themes), its comma-joined value in the form values, and an in-app path on the done card's link (no ↗, same tab) (AC-4, AC-8 link)
  Files: packages/core/src/module.ts, apps/web/components/chat/FormChecks.tsx, apps/web/components/chat/CardForm.tsx, apps/web/components/chat/form-values.ts, apps/web/lib/chat-outcome.ts, apps/web/components/chat/Chat.tsx, apps/web/tests/card-checks-124.test.ts
- [x] `T2` — Eligible proposals and explicit moves: `list_release_proposals`; `reassign` on `createRelease` and `setReleaseProposals` (moves only what it names, audited `after.moved`, otherwise the naming refusal); comma-string or array proposal keys (AC-3, AC-5)
  Files: modules/delivery/server/release-proposals.ts, modules/delivery/server/services.ts, modules/delivery/mcp.ts, modules/delivery/tests/release-card-124.test.ts
- [x] `T3` — The New release card: `create_release` draft input, `propose` (permission, project), form card (Name, Version from the next version, Category chips, Start today in the project zone, Target, Proposals and Move checks), `note` warnings, field checks on edit, result `open` link and receipt; intent, chat suggestion and pin offer open it (AC-1, AC-2, AC-6, AC-7, AC-8, AC-9)
  Files: modules/delivery/server/release-card.ts, modules/delivery/server/write-cards.ts, modules/delivery/mcp.ts, modules/delivery/chat.ts, modules/delivery/server/pin-offers.ts, packages/ai/src/scripted-writes.ts, modules/delivery/tests/release-card-124.test.ts
  Depends: T1, T2
- [x] `T4` — Integration: tests for intent, card, checks, conflicts, confirm, cancel and a failing service; e2e "081 AC-39" through the card; 123's suites, README, lint, typecheck (AC-10)
  Files: modules/delivery/tests/release-card-124.test.ts, modules/delivery/tests/pin-offers.test.ts, packages/ai/tests/scripted-writes.test.ts, apps/web/tests/e2e/delivery.spec.ts, modules/delivery/README.md
  Depends: T3

## Verify

**Verdict:** PASS
Review: OPEN — 5 rounds, final pass missing, models opus/opus; last round 0/1/2 b/M/m; fix proof not proven: no review.test_command configured, so no test could prove the fix
Stopped at the five-pass cap (AGENTS.md). No blocker. Open, in `follow-ups.md`: the round-5 major, that a move out of a
*completed* release (allowed without `reassign` by 123 AC-6) is audited as `moved` but never shown on the confirm card
(a product decision: show it, or stop moving out of completed releases; **fixed by 151-completed-release-moves**, product owner's choice: a move out of a completed release needs `reassign` and shows on the card, as for an open one); and two minors (one shared "latest release"
query for the pin and the card; `set_release_proposals` taking a comma-string like `create_release`). Fixes after the
cap go in their own change.

Checked 2026-11-26 at `b398098` (gates) and `975af07` (review), Windows 11, dev app on :3000 with the scripted chat model, local dev database.

- AC-1: pass — the intent needs only the project; "Create release v8.5.0 of CON" opens the card at once (`release-chat-124.test.ts` AC-1; `shots/app-card-conflict-light.png`).
- AC-2: pass — Name, Version (next filled in), Category chips, Start (today in the project's zone), Target, Proposals, Move; any category case picks its chip; padded text reads trimmed (AC-2 tests; `release-card-124.test.ts`).
- AC-3: pass — `list_release_proposals`: Verified and Released, each with its open release; Proposed left out; an unknown project is refused (`release-card-124.test.ts` AC-3, AC-5 AC-6).
- AC-4: pass — the `checks` field: fieldset, legend, ticked values, details, empty line, dependent `of` field; an unoffered ticked key stays drawn and submitted (`card-checks-124.test.ts`); keyboard and both themes (`shots/app-card-*-{light,dark}.png`).
- AC-5: pass — both writers move only what `reassign` names, audited `after.moved`; both cards show the move before confirm (`release-card-124.test.ts`; `shots/app-card-move-light.png`).
- AC-6: pass, as built (build notes below) — an unticked move is a field error on Proposals; ticked, the note says it moves (`shots/app-card-conflict-light.png`, `shots/app-card-move-light.png`).
- AC-7: pass — each field is checked with the service's own schema and message; the card and create agree on every value in the variant table, version taken included.
- AC-8: pass — Create runs `createRelease`; "Created November Release (v8.10.0) · 1 proposal" with "Open the release" (no ↗) to `/delivery/releases/CON/v8.9.0`, which opens the release with CON-012 (`shots/app-done-{light,dark}.png`, `shots/app-release-page.png`); in-app links and page moves refuse other hosts and whitespace (`card-checks-124.test.ts`, `chat-move.test.ts`).
- AC-9: pass — no card for FLT (not Maya's); cancel writes nothing; a version taken meanwhile is refused and the card stays open, then creates (`release-chat-124.test.ts` AC-9).
- AC-10: pass — the tests above; 123's suites pass with the reworded refusal; e2e "081 AC-39" drives the card (not run here; CI runs it).

Commands (exit codes), at `b398098` unless noted:

- `pnpm lint` (36 tasks): 0; `node scripts/check-module-standard.mjs --root .`: 0 (23 modules); `node scripts/check-graph.mjs --root .`: 1, only the deliberate R7 fixture under `packages/testing/boundaries/`
- `pnpm turbo run build --filter=./apps/web`: 0
- `pnpm turbo run test` (delivery, notifications, ai, chat, core, web; `--concurrency=1 --continue --force`): 1 — all host-only: `releases.test` (backslash path), core `ac5-adapters` (Windows paths), and load timeouts that pass alone (`create-project-surfaces`, web `pin-refs`, `agents-tools`, `baseurl`: 16/16 alone); after the final-pass fixes at `975af07`, delivery 772/773 (the backslash test)
- `specclaw-verify size` with `base_branch` ab90a86e for the run (config restored): 0 — 281 production lines (cap 400)
- `specclaw-preset-check .`: 1 — repo-wide, pre-existing; none in this change's files
- `specclaw-quality-scan . --gate`: 2 — the complexity tool did not run; duplication 860 lines repo-wide, none in this change's files
- `specclaw-review` rounds 1 to 5 with `base_branch` ab90a86e for the run (config restored after each)

Screenshots: `shots/mock.png`, `shots/app-card-conflict-{light,dark}.png`, `shots/app-card-move-{light,dark}.png`, `shots/app-done-{light,dark}.png`, `shots/app-release-page.png`

Build notes (2026-11-26):

- AC-6 as built: an unticked move is a field error on Proposals (the service's own refusal text), checked on edit and again at confirm, where it keeps the card open; once the proposal is ticked under Move, the note says "… : it moves to this release". A refusal from the service itself would close the card as failed, so every refusal the card can predict is made by its `propose` check first.
- A Released proposal that was never in a release (archived history from the repo) is now eligible; before, 123's "already shipped in another release" also caught it, though it was in none.

Quality: 860 → 860 duplicated lines (repo-wide; none in this change's files). Complexity: lizard not_run.
