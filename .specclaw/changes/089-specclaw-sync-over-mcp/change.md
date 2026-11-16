# Merges reach the board on their own: CI syncs specclaw through `sync_specclaw`, and duplicate numbers are caught

**Change:** 089-specclaw-sync-over-mcp · **Created:** 2026-11-09 · **Review:** change

**Depends on:** 088-notifications-tests-quiet-hours (same branch, PR #113). First step of agentic proposals (the
client's priority, 2026-11-09): a specclaw change merged to the default branch must appear on the amax board with no
one pushing by hand.

## Problem

The CI sync (`.github/workflows/specclaw-sync.yml`, 039) writes straight to amax's database and needs
`AMAX_SYNC_DATABASE_URL`. Those secrets were never set, so every run skips at its gate (`run=false`, latest run
2026-11-02) and still shows green. Today a proposal reaches amax only when someone runs `/amax:sync-specclaw` by hand.
The direct path also bypasses the checks `sync_specclaw` makes (linked repo, a person on the project, no step back, no
stale commit).

Two change folders can share a number: `main` already has `074-dev-demo-data` and `074-fork-pr-review-gate`, and
`075-amaxerp-url` and `075-team-time-status-band`. `readSpecclaw` keys records by number, so one change of each pair
silently never reaches amax. Agents drafting on parallel branches will make this routine.

## Mock Delta

What changes on screen, and where to see it: [`089-specclaw-sync-over-mcp`](../../mock/index.html#089-specclaw-sync-over-mcp)

The Repo sync page lists CI pushes like any other push: by the credential, acting for the PM ("amax CI · for <PM>").
A duplicate number shows as a skip line that needs a person ("two changes numbered 074"), and a change folder removed
from the default branch shows as withdrawn. The section also shows the CI job's summary.

## Acceptance Criteria

### CI pushes through the tool

1. **AC-1** `specclaw-sync.yml` calls `POST /api/v1/tools/sync_specclaw` with a bearer API key and the
   `amax-act-for` header. It no longer uses `AMAX_SYNC_DATABASE_URL`, `AMAX_SYNC_TOKEN` or `AMAX_SYNC_AUDIT_HASH_KEY`.
   Its secrets are `AMAX_URL`, `AMAX_SYNC_API_KEY` and `AMAX_SYNC_ACT_FOR` (the PM's user id). The payload is built by
   the plugin's own reader (`plugins/amax/scripts/read-specclaw.mjs`), so CI and the plugin can't read a repo
   differently.
2. **AC-2** A push to the default branch that touches `.specclaw/**` sends one push for the default branch (every
   change). Then it sends one push per `specclaw/*` branch with that branch's ref, sha and commit time, which covers
   only its own change (062's rule). This replaces 039's overlays. Batches hold at most 200 records (`MAX_PUSH`).
3. **AC-3** CI applies a push even when `needsReview` is true. It prints every skip line in the job summary and as a
   warning annotation. The push's row on the Repo sync card is where a person sees it.
4. **AC-4** No silent green. With no secrets, the job ends neutral with a notice saying the sync is not configured,
   and names the three secrets. With secrets, a refused push (wrong repo, not linked, no permission) or an HTTP error
   fails the job, and its message is the refusal's reason. A failed sync still never blocks a merge: the workflow runs
   after the push to the default branch.
5. **AC-5** The credential needed is documented in `plugins/amax/README.md` and `modules/delivery/README.md`:
   - created in amax chat with `create_api_credential`, `tools: ["sync_specclaw"]`, scope `delivery:write`, and
     `actsFor` set to the project's PM;
   - every push is recorded as the credential acting for that PM, which is rule 4.

### Withdrawal through the tool

6. **AC-6** A push from the project's default branch withdraws a specclaw proposal whose change folder is gone (sets
   `meta.withdrawn`, never deletes), but only when all of these hold:
   - the proposal was last synced from the default branch (its `meta.source` ref is the default ref);
   - no newer commit has synced the proposal (its `synced_commit_at` isn't after the push's commit: push.ts's stale
     rule);
   - the proposal isn't Released.

   A proposal created by a branch push stays put until its change lands on the default branch. A stale developer
   checkout can't withdraw anything, because its commit is older.

   *Build note (T3):* the push asks for it with `withdrawMissing: true`, which is off by default. Pushes go in batches
   of 200, and one batch can't tell a gone folder from the next batch. So CI sets it only when the whole default branch
   fits in one push, and otherwise warns that withdrawal was skipped. The plugin never sets it, so its behaviour is
   unchanged (AC-11).

   *Review round 1:* the rule is one function for the push and the self-sync (`sync/withdraw.ts`, `planWithdrawals`;
   the self-sync covers any ref, since it reads main and every specclaw branch at once). A sync that read no changes,
   or that would withdraw more than half of the live proposals (and more than two), withdraws nothing and flags it
   for a person: an unreadable or wrong checkout looks the same as "every folder was deleted". CI also stops, without
   pushing, when it reads no changes on `main`.

   *Review round 2:* the cap counts only proposals the sync could withdraw (not Released, not synced from another
   ref), so a long release history doesn't raise it. A person confirms a real mass deletion with `confirmWithdraw:
   <the held count>`; in CI, by running the specclaw sync workflow by hand with its `confirm_withdraw` input. A wrong
   count stays held, and a sync that read nothing can't be confirmed. The number check (AC-10) leaves out folders the
   PR itself renamed or removed (found with the merge base).

   *Review round 3:* the self-sync takes the same confirmation (`sync:specclaw --confirm-withdraw <n>`), and the hold
   message names every way to send it.

   *Final pass (escalation, redesign agreed 2026-11-09):* the self-sync no longer covers any ref. It withdraws only
   what a ref it read last synced (its records' refs: main and the branches it took changes from). `readSpecclaw`
   never reads a change that exists only on a branch, so a proposal a branch push made for one stays put until its
   change reaches main. The number check (AC-10) now judges what the merge produces: the PR adds what head has and
   the merge base didn't, removes what the merge base had and head doesn't, and whatever main did since is main's.
7. **AC-7** A withdrawn count shows in the preview and the result (`withdrawn`). The plugin's summary line prints it
   too. A preview never writes, as today.

### Duplicate numbers

8. **AC-8** `readSpecclaw` keeps every folder. When two folders in one source share a number, it returns one record
   per folder, each marked `duplicate: true`, instead of keeping one. An overlay copy of the same folder name is still
   the same change, not a duplicate.
9. **AC-9** `sync_specclaw` and `syncSpecclaw` skip every duplicate-numbered record with "two changes numbered
   <NNN>: <dir>, <dir>", leave that key's stored proposal untouched (no update, no withdrawal), and set `needsReview`.
   The rest of the push applies.
10. **AC-10** A new CI check (`scripts/check-change-numbers.mjs`, a step in `ci.yml`'s pull-request `review-gate` job,
    which already has the base and head commits) fails a PR that adds a change folder whose number is already used in
    the base branch's `.specclaw/changes` or `archive`, or used twice in the PR. Pairs already on the base branch (062,
    074, 075) are reported but don't fail the check.

### Kept

11. **AC-11** The plugin path is unchanged for people: `/amax:sync-specclaw` previews and applies as before. The
    bundled reader is rebuilt (`pnpm build:plugin`), and `plugins/amax/tests/reader.test.ts` passes.
12. **AC-12** `pnpm --filter @amax/delivery sync:specclaw` (`sync/bin.ts`) still works for a self-hosted amax that
    prefers the direct path, and gains the same duplicate rule (AC-9). The workflow no longer calls it.
13. **AC-13** Tests:
    - **Unit:** the duplicate rule in the reader (incl. an overlay of the same folder); the skip and needsReview; the
      withdrawal table (default branch vs branch, newer vs older commit, Released, last synced from a branch); the
      number check against a fixture base.
    - **Workflow script:** with a fake server, not configured gives neutral, refused fails, and applied prints the
      summary.
    - All in the Linux CI replica.

## Tasks

- [x] `T1` — Repo sync shows CI pushes as the mock does: withdrawn count in each push's result, a "Needs you" chip on an applied push that needs a person, CI's push "by" line as the credential for the PM (Mock Delta, AC-7)
  Files: modules/delivery/db/migrations/0020_sync_push_withdrawn.sql, modules/delivery/server/repo-sync.ts, modules/delivery/ui/RepoSyncCard.tsx, modules/delivery/tests/board-a4.test.ts
- [x] `T2` — The reader keeps both folders of a duplicate number, each marked `duplicate`; an overlay of the same folder is the same change; the plugin bundle is rebuilt (AC-8, AC-11)
  Files: modules/delivery/sync/specclaw.ts, plugins/amax/scripts/src/read-specclaw.ts, plugins/amax/scripts/read-specclaw.mjs, plugins/amax/tests/reader.test.ts, modules/delivery/tests/sync-parse.test.ts
  Depends: —
- [x] `T3` — `sync_specclaw` and `syncSpecclaw` skip duplicate numbers (found by number in the push, whatever the client flags) and set needsReview; a default-branch push withdraws a gone folder under AC-6's three conditions; `withdrawn` in preview and result, stored with `needs_review` on the push row (AC-6, AC-7, AC-9, AC-12)
  Files: modules/delivery/server/push.ts, modules/delivery/sync/import.ts, modules/delivery/mcp.ts, modules/delivery/tests/sync-push.test.ts, modules/delivery/tests/sync-import.test.ts
  Depends: T1, T2
- [x] `T4` — CI pushes through the REST tool: a script reads with the plugin's reader, pushes main then each `specclaw/*` branch in batches of 200 with bearer key and `amax-act-for`, applies with needsReview, writes the job summary and warnings; neutral notice when not configured, failure on refusal or HTTP error; the workflow drops the database secrets (AC-1 to AC-4)
  Files: scripts/specclaw-sync-ci.mjs, .github/workflows/specclaw-sync.yml, packages/testing/tests/specclaw-sync-ci.test.ts
  Depends: T2, T3
- [x] `T5` — CI check that a PR's new change folder doesn't reuse a number from the base branch or another folder in the PR; existing base pairs reported, not failed (AC-10)
  Files: scripts/check-change-numbers.mjs, .github/workflows/ci.yml, packages/testing/tests/change-numbers.test.ts
  Depends: —
- [x] `T6` — Docs: the credential to create and the three secrets; the plugin summary prints withdrawn; delivery README on CI pushes, withdrawal and duplicates (AC-5, AC-7)
  Files: plugins/amax/README.md, plugins/amax/skills/sync-specclaw/SKILL.md, modules/delivery/README.md
  Depends: T3, T4
- [x] `T7` — Tests pass in the Linux CI replica: delivery, plugin reader, scripts (AC-13)
  Files: .specclaw/changes/089-specclaw-sync-over-mcp/change.md
  Depends: T1–T6

## Verify

**Verdict:** PASS

- AC-1: pass — `specclaw-sync-ci.test` AC-1 (REST URL, bearer key, `amax-act-for`, the plugin reader's records); the
  workflow names no database secret.
- AC-2: pass — `specclaw-sync-ci.test` AC-2 (main whole then each `specclaw/*` branch; 201 changes batch at 200 and don't
  withdraw).
- AC-3: pass — `specclaw-sync-ci.test` AC-3 (applies with needsReview, every skip a warning).
- AC-4: pass — `specclaw-sync-ci.test` AC-4 and its table (none set: notice, passes; partly set, empty key, nothing
  read: fails without pushing; refused and HTTP 403 fail with the reason).
- AC-5: pass — read: `plugins/amax/README.md` "Sync on every merge (CI)" and `modules/delivery/README.md` "CI pushes
  (089)" name the credential (`tools: ["sync_specclaw"]`, `delivery:write`, acting for the PM) and the three secrets.
- AC-6: pass — `sync-push-089` AC-6 (whole default-branch push withdraws; a batch, a branch, an older commit, an empty
  read don't; a mass withdrawal is held and applied once confirmed; a newer self-sync leaves a branch-only proposal),
  `withdraw-089` (13 cases).
- AC-7: pass — `sync-push-089` AC-7 (preview and result count, the push row carries withdrawn and Needs you);
  `RepoSyncCard.tsx` shows both; the plugin's summary line prints withdrawn.
- AC-8: pass — `sync-parse` AC-8 (both folders kept and marked, an overlay of the same folder isn't a duplicate).
- AC-9: pass — `sync-push-089` AC-9; `sync-import` on this repo (062, 074 and 075 skipped, the rest created).
- AC-10: pass — `change-numbers.test` (10 cases, judged on the merge result); on this branch: "change numbers: ok".
- AC-11: pass — `plugins/amax/tests/reader.test` 5/5 (bundle in step with the reader); the 062 `sync-push` suite passes
  unchanged.
- AC-12: pass — `sync-push-089` AC-12 (self-sync skips duplicates; holds a mass withdrawal; `--confirm-withdraw`
  applies it).
- AC-13: pass — the tests above, in the replica below.

**Linux CI replica over `8d68b1d7`** (the head of the fifth pass; node:24-bookworm, fresh postgres:16-alpine, the
`checks` job's steps, `AMAX_TEMPORAL_TESTS=0`):
- `pnpm install --frozen-lockfile`, `pnpm db:migrate` (79, incl. `0020_sync_push_withdrawn`), `pnpm lint` (35/35, graph
  ok), `node scripts/check-module-standard.mjs` (22), `pnpm build`: exit 0.
- `pnpm turbo run test --concurrency=2 --force`: 33/35. The two failures are timing under load, not 089:
  delivery `create-project-surfaces` AC-3 (6.7 s) and Time `grid-perf` AC23 (2.3 s against 2 s). Both pass alone in
  the same container (7/7 and 1/1).
- e2e: **not_run**. Playwright's browser download didn't finish in Docker on this network (a Debian mirror error, then
  46 minutes at 10%, then three 10-minute tries reaching 30%). CI on the PR runs it. Only `delivery.spec.ts` (062
  AC-10) covers the changed screen; its fixture rows have `needs_review = false`, so they still read "Applied".

**Screenshots:** `shots/app.png`, `shots/app-dark.png` (CON's Repo sync card, signed in as Maya, dev server) and
`shots/mock.png` (089's section). The app card renders as before for its existing rows in light and dark; the new
row states (Needs you, withdrawn count, skip lines) appear only after a CI push with them, which the demo data has
none of, so AC-7's test is the evidence for them. The mock's 089 section sits inside `048-chat-cost` with 062's and
028's: an earlier section isn't closed (pre-existing, not 089's to change); the shot lifts it out in the browser only.

**Other checks:** `specclaw-preset-check .`: exit 1 from the repo-wide comment backlog (3,734); in 089's files, the
same header comments, and `specclaw-sync-ci.mjs` and `sync-push-089.test.ts` a few lines over 80.
`specclaw-quality-scan`: not_run (jq "Argument list too long" on this host, as in 066–088).

### Review loop (2026-11-09)

Stopped at the five-pass cap (AGENTS.md) with **0 blockers and 2 majors open**, recorded in `follow-ups.md` for a
follow-up change:
- **Major B1:** a branch whose own folder reuses a number main already synced under another folder overwrites that
  proposal (the branch tree holds one folder, so it isn't seen as a duplicate). Fix: treat a stored `source_ref` other
  than the record's folder as a duplicate, in the push and the self-sync.
- **Major B6:** `sync:specclaw --sha` isn't validated; a short or non-hex sha stops the self-sync's withdrawals
  silently. Fix: refuse it as `PushInput` does.
- Minors in `follow-ups.md`: confirm by key set, not count; `withdrawMissing` on trust; a duplicate pair split across
  batches; Needs you on every CI push until 062/074/075 are renumbered; an old plugin can't flag duplicates; Refused
  and Needs you share a colour.

Scope: commits after `7d54c089` (088's head; `git.base_branch` set for each run, then restored).

| Round | Pass | Since | Result |
|---|---|---|---|
| 1 | round (opus) | — | 0/4/6: empty read withdraws everything; two withdrawal rules; number check misses main's tip; partial CI setup green |
| 2 | round (opus) | `249b7e21` | 0/3/0: cap counts unwithdrawable rows; a hold can't be confirmed; number check fails PR renames |
| 3 | round (opus) | `2d741c29` | 0/1/1: the self-sync can't confirm |
| 4 | final (opus) | — | escalate 0/2/1: number check (third time); self-sync "any ref" withdraws branch-only proposals. Redesign agreed |
| 5 | final (opus) | — | 0/2/3: stopped at the cap (above) |

`specclaw-review verdict`: `Review: OPEN — 5 rounds, final pass missing, models opus/opus; last round 0/2/3 b/M/m`.
