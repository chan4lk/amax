# PR #134's CI green: signed-in e2e specs run signed in, and the restore drill orders around the release cycle

**Change:** 154-pr-134-ci-green · **Created:** 2026-11-27 · **Review:** change

## Problem

PR #134's first CI run failed two jobs. **checks:** the public e2e run (`playwright.config.ts`, no database) ran two
signed-in specs this stack added, because neither is on its `testIgnore` list: `project-tabs.spec.ts` (144) asks for the
`amax_e2e` database, and `release-pages.spec.ts` (147) waits for the demo sign-in form; `release-pages` is also matched
by no project in `playwright.auth.config.ts`, so it never runs signed in. **docker-k3s:** the restore drill failed with
`task_proposal_id_fkey`. Migration 0025 made a foreign-key cycle (`release.completing_deployment_id → deployment`,
`deployment.release_id → release`); the drill's `inOrder` sorts tables parents first and, when no table is ready, appends
every remaining one at once in no order, so tasks were inserted before their proposals.

## Mock Delta

No screen changes. This change gets no mock section (CI only).

## Acceptance Criteria

1. **AC-1 E2E configs.** `playwright.config.ts` ignores `project-tabs` and `release-pages`; `playwright.auth.config.ts`
   runs `release-pages` in its `writes` project (it creates and edits releases). A test lists every e2e spec that signs in
   or opens the database and checks each one is ignored by the public config and matched by exactly one signed-in
   project, so a new spec can't slip past again.
2. **AC-2 The cycle is deferrable.** Migration 0029 makes `release_completing_deployment_id_fkey` deferrable, initially
   deferred, so within one transaction a release may be written before the deployment that completed it (checked at
   commit). Nothing else about the constraint changes.
3. **AC-3 The drill orders around it.** `inOrder` leaves deferrable foreign keys out of the order (their check waits for
   the restore's commit). If tables are still left with no parent restored first (a cycle of non-deferrable keys), the
   drill fails with a clear error naming those tables, instead of inserting them in no order.
4. **AC-4 Tests.** The drill test restores a snapshot that holds a completed release (its completing deployment, and a
   proposal with tasks), and every table's rows come back; `inOrder` is tested on a deferrable cycle (ordered) and a
   non-deferrable one (refused, naming both tables).
5. **AC-5 CI.** PR #134's `checks` (both e2e runs) and `docker-k3s` pass, or any remaining failure is shown to be
   unrelated with its log.

## Tasks

No UI task: CI only.

- [x] `T1` — AC-1: the public config ignores `project-tabs` and `release-pages`; the signed-in config runs `release-pages` in `writes`; a test reads every e2e spec, and each one that signs in or opens the database must be ignored by the public config and matched by exactly one signed-in project
  Files: apps/web/playwright.config.ts, apps/web/playwright.auth.config.ts, apps/web/tests/e2e-configs-154.test.ts
- [x] `T2` — AC-2 AC-3: migration 0029 makes `release_completing_deployment_id_fkey` deferrable, initially deferred; `inOrder` (exported for its test) leaves deferrable keys out of the order and refuses a remaining cycle, naming its tables
  Files: modules/delivery/db/migrations/0029_release_completing_deferrable.sql, packages/core/src/backup/restore.ts
- [x] `T3` — AC-4: the drill restores a snapshot holding a completed release, its deployments, and a proposal with tasks; `inOrder` on a deferrable cycle (ordered) and a non-deferrable one (refused, naming both)
  Files: packages/core/tests/backup-restore-order-154.test.ts
  Depends: T2
- [x] `T4` — AC-5: after the push, PR #134's `checks` (both e2e runs) and `docker-k3s` watched to the end; any remaining failure's log read and recorded
  Files: .specclaw/changes/154-pr-134-ci-green/change.md
  Depends: T1, T2, T3

## Verify

**Verdict:** PASS, with the review stopped at the five-pass cap (AGENTS.md): 0 blockers, 1 major open at the final pass, fixed in 155.
Review: OPEN at the cap: 5 passes (rounds 1 and 2, final passes 3, 4 and 5, opus), last final pass at 0b3dcd25ce (`base_branch` f0d4cfa4, config restored after each). The review gate passes it: no open blocker, final pass in the PR.
Size: well under the cap (the build measured 37 production lines; the replica's fixes add test lines and one SQL clause).

- AC-1: pass. The public run ignores `project-tabs` and `release-pages`, the signed-in run runs `release-pages` in `writes`; `e2e-configs-154.test.ts` places every spec on exactly one side by the configs (fails with `project-tabs` back out of the ignore list).
- AC-2: pass. 0029 makes `release_completing_deployment_id_fkey` deferrable, initially deferred.
- AC-3: pass. `inOrder` leaves only initially-deferred keys out of the order and refuses a remaining cycle, naming its tables; the restore turns user triggers off for the whole load.
- AC-4: pass. `backup-restore-order-154.test.ts` (5 tests; the drill fails without 0029, the cycle and parent/child rows fail with the old filter).
- AC-5: pass. PR #134's CI at 56ccdef4 (2026-11-27): all nine checks pass, `checks` (both e2e runs) and `docker-k3s` included. PR #134's second CI run: `docker-k3s` and the public e2e run pass. The Docker replica of the `checks` job (above) ends with public e2e 9/9 and signed-in e2e 112/112.

Open at the stop (fix in its own change, since a code commit under 154 after its final pass fails the review gate):

- Major [module standard: every write is audited] `server/services.ts` `tagRelease`: the re-tag's audit row records the version only, not the name that now follows it. Fixed in 155-retag-audit-name.

CI's second run (2026-11-27, at 107e3f7d): `docker-k3s` and the public e2e run passed; the signed-in run failed its first project, the visual test, on 001's project header (`/delivery/p/CON .row.head`, 57 px in the app against 63 in 001's mock). 144 changed that header on purpose (its own mock: the h1 without its bottom margin, 57 px), so the visual test leaves it out, as 147 did for the list's rows; 144's e2e covers the header. The other 109 signed-in tests had not run yet.

Docker replica of CI's checks job (2026-11-27; postgres:16-alpine with the amax_app role, the app built from the tree):
six runs until the signed-in e2e run went through. What the runs found and the fixes (all e2e specs that met 144's and
147's pages for the first time, plus one product gap):

- `sections.spec.ts`: a project's own Releases and Proposals tabs leave out the Project column (144, 147), so each row is
  checked as this project's by its link.
- `release-pages.spec.ts` (147): a new target that leaves the status as it was writes no history row (145 AC-2), so the
  history still holds only "Created".
- `releases.spec.ts` (042, 054): 147's release page: the heading is the release's name, "Record a deployment" (exact),
  deployments grouped by environment.
- **Amended at build (found by the replica, raised with the product owner for review):** `tag_release` carries a name that is just the old
  version (0025 named every release made before 145 after its version) along with the re-tag; a real name stays
  (`retag-name-154.test.ts`, 3 rows; 2 fail without it). Without it the v2.4.1 page stayed headed "v2.4.0".
- `auth.spec.ts` AC5 (sign out, then `/delivery` redirects to sign-in) failed in 2 of 6 runs and passed in the others:
  a timing flake in an existing test; nothing in this PR touches sign-in or sign-out (its one proxy change forwards
  GitHub's return URLs only). Left as it is; a failed CI job is re-run.

Final run: public e2e 9/9, signed-in e2e 112/112.

Build notes: the restore now turns user triggers off for the whole load and back on after `set constraints all immediate`,
because a table can't be altered while a deferred key check it queued is pending (the drill's first run on 0029 failed on
exactly that). The same rule meets 150's backfill test, which replays 0027 on today's schema: it now runs its batches with
`set constraints all immediate` (a real migration run applies 0027 before 0029). The README says so for later
migrations. Mutation checks: without 0029 the drill refuses, naming the tables in the cycle; without `release-pages` in
the signed-in config, the guard test fails on it. No per-task commits from the agent (git is read-only here).
