# The CI sync shows the repo as it is: open branches only, history as Released, one owner per key

**Change:** 091-ci-sync-demo-fixes · **Created:** 2026-11-10 · **Review:** change

**Depends on:** 090-e2e-amx-duplicate-numbers (same branch, PR #113).

## Problem

The local demo of 089's CI sync (2026-11-10) put 78 proposals in Verified on AMX: CI pushes every `specclaw/*` branch,
and a long-merged branch still says "PR raised", so finished work came back as Verified. The Released lane stayed empty:
a push never releases, so 65 archived changes were skipped, each listed on the Repo sync card. A branch push also
updated AMX-062 though `main` holds that key for a duplicate pair (089 round-5 major B1), and the self-sync takes any
`--sha` (089 round-5 major B6).

## Mock Delta

What changes on screen, and where to see it: [`091-ci-sync-demo-fixes`](../../mock/index.html#091-ci-sync-demo-fixes)

The Repo sync card groups a push's skips by reason ("two changes numbered … (3): AMX-062, AMX-074, AMX-075") instead
of one line per proposal. A first push from main lists its finished changes as created, and the board's Released lane
holds them. The CI job summary says how many merged or archived branches it left out.

## Acceptance Criteria

1. **AC-1** CI pushes only open branches. A `specclaw/*` branch is left out when its tip is already in the checked-out
   default branch (merged), or when its change folder is archived there. The job summary says so in one line ("left
   out 61 merged or archived branches"). The rest are pushed as before.

   *Build note (demo re-run, 2026-11-10):* also left out, with a warning naming the folder, is an open branch whose
   change number the default branch already uses for another folder. amax can't see the default branch's folders
   during a branch push, so AC-2 had no stored row to compare when main skips that number as a duplicate, and
   `specclaw/062-mock-unclosed-sections` created AMX-062. Its PR fails the number check (089 AC-10) anyway.

   *Final pass (round 3):* a branch counts as merged by content only when it has its change folder; a branch named
   after no folder is still pushed, so amax flags it. `authorsOf` takes the sha by the one rule in `sync/sha.ts`.
2. **AC-2** A branch push can't take over a key that the default branch holds for another folder. On a ref other than
   the default branch, a record whose stored proposal came from a different folder (`source_ref`) is skipped with
   "two changes numbered NNN: <stored folder>, <this folder>" and sets needsReview. The default branch may still
   rename a change (its push has only the new folder). The self-sync can't meet this case: it takes a branch's copy
   only of a folder that's on main.
3. **AC-3** `sync:specclaw` refuses a `--sha` that isn't 7–40 hex characters, as `sync_specclaw` does, before reading
   anything.
4. **AC-4** History as Released (agreed 2026-11-10). A push from the default branch
   creates an archived change it has never stored as Released, with the archive date as its released date. It emits no
   phase event and sends no notification. A proposal amax already has is still never moved to Released by a push:
   that stays a Prod deployment's ("released comes from Prod deployments"). A branch push never creates Released.
5. **AC-5** The Repo sync card groups a push's skip lines by reason: "<reason> (n): KEY, KEY, …", at most five keys
   and then "+n more". Needs you and the counts are unchanged.
6. **AC-6** Tests: a table per rule (merged, archived and open branches; another folder on a branch, a rename on the
   default branch; sha shapes; new archived vs existing vs on a branch; grouped skip lines), the 089 suites unchanged,
   and the AMX e2e board still matching the sync's rule.
7. **AC-7** A spec proposal's owner comes from the repo, never from who pushed (agreed 2026-11-10; the demo gave the
   PM every AMX proposal, since CI acts for her). In order:
   - an `**Owner:** <email>` line in the change's header;
   - else the author of the commit that added its `change.md` (the CI script and the plugin read it from git; the
     self-sync reads only the header line);
   - mapped to a person by a verified git identity with that email, else an active person whose work email it is,
     and only when they're on the project. Otherwise the proposal is Unassigned (the Delivery agent's Suggested owner
     still applies).

   A sync keeps the owner up to date with the repo until a person sets it in amax (`update_proposal`, or accepting a
   Suggested owner); from then on the sync never changes it. A sync's owner change raises no event or notification.

   *Build notes:* an owner the repo names but amax couldn't match at first (a git identity linked later) is picked up
   on the next sync though the change's files are unchanged; who set the owner is kept on the row
   (`owner_set_by_person`, 0021). *Review round 1:* the email is never stored, only resolved during the sync; an
   author git can't read is unknown and keeps the stored owner; the self-sync reads authors the same way
   (`sync/authors.ts`); an owner change is audited. AC-1 also leaves out a squash- or rebase-merged branch (its change
   folder already on main as it is).

   *Review round 2:* the blocker that author emails reach `core.trace_event` through the traced arguments was checked
   and doesn't hold: both transports trace through `traceStep`, which stores `args_key = keyed(args)` (a keyed hash,
   `packages/core/src/trace.ts`), never the arguments; `owner-091` proves it (a `sync_specclaw` trace step carrying
   emails leaves none in `core.trace_event`). Fixed the round's minors: one shallow check, and a folder not committed at
   the sha read is unknown.

   *Final pass (round 4):* the Owner line takes the email anywhere on it (bare, `quoted`, `<bracketed>`, `Name <email>`);
   one predicate says when a sync leaves the owner (`ownerFrozen`); `sync_proposal` passes `ownerEmail` through; a
   withdrawn proposal frees its number for a branch; a squash-merged branch stays merged after main edits its folder;
   0021 says why its one-time backfill reads the audit log.

## Tasks

- [x] `T1` — Repo sync card groups skip lines by reason, five keys then "+n more" (AC-5)
  Files: modules/delivery/ui/skips.ts, modules/delivery/ui/RepoSyncCard.tsx, modules/delivery/tests/skips-091.test.ts
- [x] `T2` — sync_specclaw: a default-branch push creates a never-seen archived change as Released history; a branch push skips a record whose stored proposal came from another folder (AC-2, AC-4)
  Files: modules/delivery/server/push.ts, modules/delivery/mcp.ts, modules/delivery/tests/sync-push-091.test.ts
- [x] `T3` — One commit-sha rule for sync_specclaw and sync:specclaw, which refuses a bad --sha before reading (AC-3)
  Files: modules/delivery/sync/sha.ts, modules/delivery/sync/bin.ts, modules/delivery/server/push.ts, modules/delivery/tests/sha-091.test.ts
- [x] `T4` — CI leaves out merged and archived specclaw/* branches and says how many (AC-1)
  Files: scripts/specclaw-sync-ci.mjs, packages/testing/tests/specclaw-sync-ci.test.ts
- [x] `T5` — Docs, the 089 suites and the AMX e2e still green (AC-6)
  Files: modules/delivery/README.md, plugins/amax/README.md, .specclaw/changes/091-ci-sync-demo-fixes/change.md
  Depends: T1–T4
- [x] `T6` — The owner comes from the repo: the header's Owner line, else the change's author from git, mapped to a person on the project; a sync keeps it until a person sets one (AC-7)
  Files: modules/delivery/sync/specclaw.ts, plugins/amax/scripts/src/read-specclaw.ts, plugins/amax/scripts/read-specclaw.mjs, scripts/specclaw-sync-ci.mjs, modules/delivery/server/push.ts, modules/delivery/server/services.ts, modules/delivery/server/owner.ts, modules/delivery/tests/owner-091.test.ts
- [x] `T7` — Demo run on local amax: AMX owners are the changes' authors or Unassigned, not the PM (AC-7)
  Files: .specclaw/changes/091-ci-sync-demo-fixes/change.md
  Depends: T6

## Verify

**Verdict:** PASS

- AC-1: pass — `specclaw-sync-ci.test` AC-1 (main and open branches pushed; merged, archived, squash-merged and
  squash-then-edited branches left out with one summary line; a branch reusing main's number left out with a warning;
  a branch named after no folder still pushed). Demo: "left out 67 merged or archived branches", Verified 78 → 22.
- AC-2: pass — `sync-push-091` AC-2 (a branch can't take a key held for another folder; main may rename).
- AC-3: pass — `sha-091` (sha table, `refOf`, and `sync:specclaw --sha 3` refused before the database opens).
- AC-4: pass — `sync-push-091` AC-4 (main brings never-seen finished changes in as Released; existing ones and branches
  never); `sync-push` 062 test updated to the agreed rule. Demo: Released 0 → 62.
- AC-5: pass — `skips-091` (grouped by reason, five keys then "+n more"); `shots/app-reposync.png`.
- AC-6: pass — the tables above; 089 and 090 suites green; the AMX e2e still uses the sync's rule (`onBoard`).
- AC-7: pass — `owner-091` (Owner line forms, author by work email and verified identity, off-project and unknown give
  Unassigned, never the pusher, an identity linked later is picked up, an unknown author keeps the owner, the email is
  never stored and the trace holds none, every way a person sets an owner stops the sync, owner changes audited),
  `authors-091` (author across the archive move, unknown for a shallow clone or uncommitted folder). Demo: 20 owned by
  Umar Ahamed via his git identity, 68 Unassigned, none by the pusher.

**Linux CI replica over `d2e57521`** (the head of the fifth pass; node:24-bookworm, fresh postgres:16-alpine, the
`checks` job's steps, `AMAX_TEMPORAL_TESTS=0`): `pnpm install --frozen-lockfile`, `pnpm db:migrate` (80, incl. `0021`),
`pnpm lint` (35/35, graph ok), `pnpm turbo run test --concurrency=2 --force` (35/35 packages),
`node scripts/check-module-standard.mjs` (22), `pnpm build`: all exit 0. e2e: not_run here (the browser download fails
on this network); PR #113's CI runs it.

**Screenshots:** `shots/mock.png` (091's section), `shots/app-board.png` and `shots/app-reposync.png` (local demo after
091, signed in as Umar Ahamed), `shots/before-board-089.png` (the same board after 089, for comparison). The real card
groups skips as the mock does; the mock still shows CI pushing a branch that reuses main's number, which CI now leaves
out (AC-1's build note).

**Other checks:** `specclaw-preset-check .`: exit 1 from the repo-wide comment backlog, as in 066–090.
`specclaw-quality-scan`: not_run (jq "Argument list too long" on this host).

### Review loop (2026-11-10)

Stopped at the five-pass cap (AGENTS.md) with **0 blockers and 4 majors open**, all in `follow-ups.md` for change 092,
to land before PR #113 merges (two are regressions from round 4's fixes):
- **B7:** "a person set the owner" is read before the upsert without a lock, so a concurrent `update_proposal` can be
  overwritten. Decide it in SQL on the conflicting row again.
- **B1:** the Owner line's email takes trailing punctuation and link brackets.
- **B3:** a file in the tree whose add commit git can't find reads as "nobody" (clears the owner) instead of unknown.
- **B1:** squash-merge detection by commit time can leave out a branch with newer progress; use content or ancestry.

| Round | Pass | Since | Result |
|---|---|---|---|
| 1 | round (opus) | — | 1/6/1: committer emails stored in meta (blocker); self-sync without authors; failed lookups clear owners; owner changes not audited; person-set paths untested; squash merges; one email rule |
| 2 | round (opus) | `9aab6ebc` | 1/0/2: trace blocker checked and refuted (`traceStep` keeps a keyed hash; proved by a test); one shallow check; uncommitted folder unknown |
| 3 | final (opus) | — | 0/1/2: branch named after no folder counted as merged; one sha rule; mock grouping |
| 4 | final (opus) | — | 0/1/5: Owner line forms; one owner-frozen rule; sync_proposal ownerEmail; withdrawn rows; squash then edit; 0021 note |
| 5 | final (opus) | — | 0/4/1: stopped at the cap (above) |

Scope: commits after `1dba57e5` (090's verify), `git.base_branch` set for each run, then restored.
`specclaw-review verdict`: `Review: OPEN — 5 rounds, final pass missing, models opus/opus; last round 0/4/1 b/M/m`.
