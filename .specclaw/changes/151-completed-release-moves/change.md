# A proposal in a completed release moves only when asked

**Change:** 151-completed-release-moves · **Created:** 2026-11-26 · **Review:** change

## Problem

124's review stopped at the cap with one major open (124's `## Verify`). A Verified proposal that sits in a *completed*
release is listed on the New release card with no detail and no "Move from their release" box, and `create_release` and
`set_release_proposals` take it out of that release without `reassign`; only the audit records the move. Since 126 a
completed release is final, so a change to what it contains shouldn't happen silently. Product owner (2026-11-26): ask
first, as for an open release; the move stays possible (a proposal of a UAT release that never reached Prod still ships
in a later one).

## Mock Delta

What changes on screen, and where to see it: [`151-completed-release-moves`](../../mock/index.html#151-completed-release-moves)

- New release card: a proposal in a completed release shows where it is ("in v0.12.0 · UAT · Completed") and appears in
  "Move from their release", exactly like one in an open release; unticked there, the card refuses it on the field.

## Acceptance Criteria

Terms. **Held elsewhere**: the proposal is in another release of the project, open or completed (123's
`openElsewhere`, which today skips completed ones). A proposal **shipped** in another release (Released there) stays
refused outright, as today.

1. **AC-1 One rule.** "Held elsewhere" counts a completed release as well as an open one. The card's list
   (`releaseProposals`), its field check, its move line (`movesOf`) and `assignProposals` all use it, so they can't
   disagree.
2. **AC-2 Writers ask.** `create_release` and `set_release_proposals` refuse a proposal held in a completed release
   unless `reassign` names it, with the same message as for an open one ("CON-14 is already in CON v2.4.0 (UAT,
   Completed); confirm moving it, or take it out there first"). Named in `reassign`, it moves and is audited in
   `after.moved` as today.
3. **AC-3 The card shows it.** On the New release card, such a proposal carries its detail ("in v2.4.0 · UAT ·
   Completed"), appears under "Move from their release", is refused on the field until ticked there, and the confirm
   card's move line names it ("CON-14 from v2.4.0 (UAT, Completed)").
4. **AC-4 Tests.** A table over a proposal in an open release, in a completed release, and in a completed release with
   `reassign`: both writers and the card agree in each case; a Released proposal in a completed release is still
   refused as shipped. README line.

## Tasks

No separate UI task: the New release card is built from the rule's data (its detail line and "Move from their release"
options come from `releaseProposals`), so the screen matches the mock once the rule counts completed releases.

- [x] `T1` — AC-1 AC-2 AC-3: one "held elsewhere" rule that counts completed releases (`openElsewhere` becomes `heldElsewhere`), used by the card's list, field check and move line and by `assignProposals`; `list_release_proposals`'s `openRelease` becomes `inRelease` (release tracking hasn't reached `main`), its description updated
  Files: modules/delivery/server/release-proposals.ts, modules/delivery/server/release-card.ts, modules/delivery/server/services.ts, modules/delivery/mcp.ts, modules/delivery/tests/release-card-124.test.ts
- [x] `T2` — AC-4: table over open, completed, and completed with `reassign`, through both writers and the card; Released in a completed release still refused; README line
  Files: modules/delivery/tests/completed-release-moves-129.test.ts, modules/delivery/README.md
  Depends: T1

## Verify

**Verdict:** PASS
Review: CLEAN — 3 rounds, final pass 5422c42849, models opus/opus; last round 0/0/0 b/M/m (`base_branch` a2a86d4d, the stack before 129, for each run; config restored after each). Round 1's findings were fixed (both writers' tool descriptions; the open-release helper's name); the first final pass's one minor (a timing flake in the test) was fixed and the final pass run again.
Size: 36 production lines against a2a86d4d (cap 400).

Checked 2026-11-26, Windows 11, dev app on :3000 with the scripted chat model.

- AC-1: pass. One `heldElsewhere` (no completed-release exception) drives `releaseProposals`, the card's field check, `movesOf` and `assignProposals`; with the old exception put back, the two completed-release rows of `completed-release-moves-129.test.ts` fail.
- AC-2: pass. Both writers refuse a proposal held in a completed release without `reassign`, naming "(UAT, Completed)", and move it with `reassign`, audited `moved` (test table); `create_release` and `set_release_proposals` tool descriptions say so. 123 AC-6's move without `reassign` is amended: its test and the two cross-release races pass `reassign`.
- AC-3: pass. The card shows "in v8.9.0 · UAT · Completed", offers "CON-012 from v8.9.0" under Move from their release, and refuses it on the field until ticked there (`shots/app-card.png`, CON-012 placed in the completed v8.9.0 for the shot and put back in v8.10.0 after); the confirm card's move line names it (test).
- AC-4: pass. The table (open, completed, completed with `reassign`) and a Released proposal in a completed release still refused as shipped; `list_release_proposals`' field is `inRelease` (renamed from `openRelease`); README.

Commands (exit codes):

- `npx vitest run modules/delivery modules/notifications modules/leave apps/web/tests` (at the build): 1, 1277/1278, host-only `releases.test` "two call sites"; delivery after round 1: 840/841, the same one; the 129 tests 4/4 after the final-pass fix
- `npx tsc --noEmit` in `modules/delivery` and `apps/web`: 0
- `node scripts/check-module-standard.mjs --root .`: 0 (23 modules); `node scripts/check-graph.mjs --root .`: only the deliberate R7 fixture
- `specclaw-verify size .specclaw 129-completed-release-moves` (base a2a86d4d): 0
- `specclaw-preset-check .`: 1, repo-wide; in 129's files only the comment rule, as across the repo
- `specclaw-quality-scan . --gate`: 2, the complexity tool did not run; duplication repo-wide, none in 129's files

Screenshots: `shots/mock.png`, `shots/app-card.png`

Quality: 872 → 872 duplicated lines (repo-wide, 860 at 128's build; none in 129's files, so nothing to refactor). Build notes: no per-task commits from the agent (git is read-only here). 123 AC-6's "a proposal in a Completed release that isn't Released can be moved" now needs `reassign` (129 amends it): `release-tracking-123.test.ts` AC-6 and the two cross-release races in `releases.test.ts` pass `reassign` for that move.
