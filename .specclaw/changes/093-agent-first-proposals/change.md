# Agent-first proposals: a project whose repo syncs its proposals gets them from the repo, not by hand

**Change:** 093-agent-first-proposals · **Created:** 2026-11-10 · **Review:** change

**Depends on:** 092-ci-sync-owner-and-merge-fixes (same branch, PR #113).

## Problem

The client wants the agentic proposal flow first. Today every project offers "New proposal" (hand-made, 081) next to
the repo's specclaw proposals, so the two compete. Decided 2026-11-10: a project whose linked repo syncs its proposals is
agent-first, with no manual creation there; other projects keep manual creation, since nothing else can make their
proposals yet. "Draft with an agent" from amax comes next, as its own change.

**Agent-first project** (decided 2026-11-10, "linked + synced"): a project with a linked repo that has brought in at
least one proposal (`source = 'specclaw'`). A freshly linked project keeps manual creation until its first sync;
relinking an agent-first project to another repo keeps it agent-first, since its synced proposals stay, and a project that
already has synced proposals is agent-first as soon as a repo is linked (final passes). (The demo
fixtures' CON has a linked repo but only hand-made proposals, so it stays manual.)

## Mock Delta

What changes on screen, and where to see it: [`093-agent-first-proposals`](../../mock/index.html#093-agent-first-proposals)

On an agent-first project, the header has no "New proposal". In its place a line says where proposals come from:
"Proposals come from github.com/… · write one with /specclaw:propose; it appears here when merged". Any other project looks
as today.

## Acceptance Criteria

1. **AC-1** An agent-first project shows no "New proposal" on its page. It shows the line above,
   naming the repo. Any other project shows "New proposal" as today, to whoever may create there.
2. **AC-2** The global Proposals page shows "New proposal" only to someone who may create in at least one project
   that isn't agent-first. Filtered to an agent-first project, it shows that project's line instead. Chat's "Which project
   is it for?" offers only projects that aren't agent-first.
3. **AC-3** `create_proposal` refuses an agent-first project before the confirm card, and the service refuses it
   too (the API and agents): "<KEY>'s proposals come from its repo (<repo>): write one with /specclaw:propose".
4. **AC-4** Chat suggestions and a project's pin don't offer "New proposal" on an agent-first project.
5. **AC-5** Hand-made proposals already in such a project stay as they are: readable, and editable, withdrawable and
   given tasks as before. Unlinking the repo brings manual creation back.
6. **AC-6** Tests: a table over agent-first projects, linked-but-unsynced ones and projects without a repo for the page, the global page, chat suggestions, the
   pin, the confirm card and the service; the 081 creation tests still pass (CON stays manual).

## Tasks

- [x] `T1` — Project and global Proposals pages: no "New proposal" on an agent-first project, the repo line instead (AC-1, AC-2)
  Files: modules/delivery/server/agent-first.ts, modules/delivery/server/queries.ts, modules/delivery/ui/ProjectPage.tsx, modules/delivery/ui/ProposalsPage.tsx, modules/delivery/ui/AgentFirstLine.tsx
- [x] `T2` — create_proposal and its service refuse an agent-first project; chat's project choice and suggestions, and the pin, leave it out (AC-2, AC-3, AC-4)
  Files: modules/delivery/server/proposal-card.ts, modules/delivery/server/services.ts, modules/delivery/server/pin-offers.ts, modules/delivery/chat-suggestions.ts, modules/delivery/mcp.ts
- [x] `T3` — Tests and docs (AC-5, AC-6)
  Files: modules/delivery/tests/agent-first-093.test.ts, modules/delivery/README.md
  Depends: T1, T2

## Verify

**Verdict:** PASS

- AC-1: pass — `agent-first-093` table (agent-first HRI, linked-but-unsynced CON, no-repo FLT): `getProject` gives
  `agentFirst` and `repoUrl`; `ProjectPage` renders `AgentFirstLine` in place of `NewProposalButton` for it.
- AC-2: pass — `manualProjects` leaves agent-first projects out; the global page and its chat suggestion offer "New
  proposal" only while one is left (tested both ways); the `create_proposal` tool and the `delivery.new-proposal` intent tell
  chat to leave agent-first projects out of "Which project is it for?".
- AC-3: pass — `proposeCreate` and `createProposal` refuse an agent-first project; the service checks under the project lock,
  and a manual create racing a first sync is refused once the sync commits (two-transaction test).
- AC-4: pass — the project's chat suggestion and pin offer no "New proposal" there (table).
- AC-5: pass — a hand-made proposal already in HRI is still edited; unlinking brings manual creation back.
- AC-6: pass — the tables above; 081's creation tests pass (three now make their hand-made proposal in FLT, since CON turns
  agent-first after a spec sync in the same file).

**Linux CI replica over `fc6d168b`** (the head of the fifth pass; node:24-bookworm, fresh postgres:16-alpine, the `checks`
job's steps, `AMAX_TEMPORAL_TESTS=0`): `pnpm install --frozen-lockfile`, `pnpm db:migrate` (80), `pnpm lint` (35/35, graph ok),
`node scripts/check-module-standard.mjs` (22), `pnpm build`: exit 0. `pnpm turbo run test --concurrency=2 --force`: 34/35; the one
failure is Time's `grid-perf` timing under load (4.0 s against 2 s), which passes alone in the same container. e2e: not_run here
(the browser download fails on this network); PR #113's CI runs it.

**Screenshots:** none taken for this pass: the agent-first line is a header chip covered by `ProjectPage`'s rendered HTML in
`agent-first-093` and the mock section `093-agent-first-proposals` (compared by eye: not yet).

**Other checks:** `specclaw-preset-check .`: exit 1 from the repo-wide comment backlog, as in 066–092. `specclaw-quality-scan`:
not_run (jq "Argument list too long" on this host).

### Review loop (2026-11-10)

One loop over **092-ci-sync-owner-and-merge-fixes** (`**Review:** covered-by 093-agent-first-proposals`; its own round 1 didn't
run, a usage limit) and **093-agent-first-proposals**, scope: commits after `fd8b49f6` (091's verify). Stopped at the five-pass
cap (AGENTS.md), round 5 escalated on the Owner-line parser, with **0 blockers and 1 major open**, recorded in
`follow-ups.md` for change 094 with three minors: the Owner-line regex misses an address written straight after the label
and can back off to a shorter one; the redesign is a token parser, not another pattern.

| Round | Pass | Since | Result |
|---|---|---|---|
| 1 | round (opus) | — | 0/3/3: audit read before the lock; In Prod from any release; merge-commit author untested; one rule each for the line, manual projects, skips |
| 2 | round (opus) | `60fb9920` | 0/1/2: In Prod reads `deployment.released`; comments; push-keeps-owner pointer |
| 3 | final (opus) | — | 0/1/3: the intent's project choice; whole Owner-line addresses; one owner-frozen rule; check under the lock; relink docs |
| 4 | final (opus) | — | 0/3/1: list and CSV share In Prod; quotes and markup around the Owner; create-vs-first-sync race test; README |
| 5 | final (opus) | — | escalate 0/1/3: stopped at the cap (above) |

`specclaw-review verdict`: `Review: ESCALATE — 5 rounds, final pass missing, models opus/opus; last round 0/1/3 b/M/m`.
