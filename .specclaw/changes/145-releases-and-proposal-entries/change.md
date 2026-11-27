# Release tracking, phase 1: a release has a name, a category, dates and a status

**Change:** 145-releases-and-proposal-entries · **Created:** 2026-11-26 · **Review:** change

## Problem

A release today is only a version tag on a project (`delivery.release`: `id`, `project_id`, `version`, `created_at`).
Release Tracking needs to know what a release is for and when it's due: a human-readable name, a category (Dev, UAT
or Prod), a start and target date, a status, and whether it finished on time. Adding a proposal that already sits in
another open release quietly moves it today (`assignProposals`), and any proposal can be added whatever its phase.
This is phase 1 of Release Tracking (the product owner's brief, 2026-11-26): the data, the services and their rules.
The chat card, the list and detail pages, and the daily status check are later phases.

Decisions (product owner, 2026-11-26): existing releases stay **untracked** (nullable new fields); a valid deployment
completes a release **in this phase**; a proposal in another open release is **refused, naming that release**; the
new fields are **required now** on `create_release`.

## Mock Delta

What changes on screen, and where to see it: [`145-releases-and-proposal-entries`](../../mock/index.html#145-releases-and-proposal-entries)

- No page changes. Chat's New release asks for the name, category and dates, and its confirm card shows them.
- The refusals a person can meet are shown as chat would show them.
- `get_release_history` returns the new fields and the status history (sample output).

## Acceptance Criteria

Terms. A release's **category environment** is the project's environment named like the category (`Dev`, `UAT`,
case-insensitive) or, for `Prod`, the project's Prod environment (`is_prod`). A **valid deployment** is a
`delivery.deployment` row with status `deployed`, not voided, to the category environment. **Today** and the
day of a completion are read in the project's zone: `entityZone(tx, project.legal_entity_id)` (UTC with none).
A **tracked** release has a category; one with none (every release made before this change) is **untracked**.

1. **AC-1 Schema.** Migration `0025_release_tracking.sql` adds to `delivery.release`: `name text`, `category text`
   (check `dev | uat | prod`), `start_date date`, `target_date date` (check `target_date >= start_date`), `status text`
   (check `planned | in_progress | overdue | completed`), `completed_at timestamptz`, `completion text` (check
   `on_time | late`), `completing_deployment_id uuid` (references `delivery.deployment`), and `updated_at timestamptz
   not null default now()`. All new columns are nullable; existing rows keep `version`, `id` and `created_at`, and get
   `name = version` and nothing else. A check keeps a tracked row whole (category, start, target, status and name all set).
   RLS stays forced, as for every `delivery` table.
2. **AC-2 Status history.** New table `delivery.release_status_history` (`id`, `tenant_id`, `release_id`, `from_status`
   null on create, `to_status`, `at`, `source`: `create | update | deployment | void`, `deployment_id` nullable, `by`),
   tenant RLS on, append-only (no update or delete grant to the app role). Every status a tracked release takes writes
   one row in the same transaction; a write that leaves the status as it was writes none.
3. **AC-3 Status rule.** One pure function `releaseStatus({ today, start, target, completedAt })`: `completed` when
   there's a completion, else `planned` before the start day, `overdue` after the target day, else `in_progress`.
   `completion` is `on_time` when the completion's day (project zone) is on or before the target day, else `late`.
   Unit tests cover each branch and the day boundary in a non-UTC zone.
4. **AC-4 Create.** `create_release` takes `projectKey`, `version`, `name` (trimmed, 1–120), `category`
   (`Dev | UAT | Prod`), `startDate`, `targetDate` (`YYYY-MM-DD`, real calendar days), and optional `proposalKeys`; all
   but `proposalKeys` are required in the tool and in `createRelease`. It refuses, each with a plain message: a target
   before the start; a project with no category environment ("ORB has no UAT environment"); a duplicate version (as
   today). The release is created with the AC-3 status and one history row (`source: create`). The result carries
   `id`, `status` and `href` (`releaseHref`). Audited as `delivery.release.create`, as today.
5. **AC-5 Eligible proposals.** A proposal newly put in a release (by `create_release` or `set_release_proposals`)
   must be Verified or Released; anything else is refused naming it and its phase ("ORB-050 is Building; only Verified
   or Released proposals can go in a release"). The existing refusals stay: unknown key, withdrawn, released in another
   release, release already live in Prod. A proposal already in this release keeps its place whatever its phase.
6. **AC-6 Conflicts.** A proposal that sits in another release that isn't Completed is refused, naming that release,
   its category and status ("ORB-044 is already in ORB v0.14.0 (UAT, In progress); take it out there first"). An
   untracked other release counts as open. The silent move in `assignProposals` is gone. A proposal in a Completed
   release that isn't Released can be moved.
7. **AC-7 Update.** New write tool `update_release` (`projectKey`, `version`, and any of `name`, `category`,
   `startDate`, `targetDate`; `delivery:release:create`, PM `@managed`, a confirm card listing before and after) edits
   a release. It refuses a Completed one ("ORB v0.13.0 is completed; it can't change"). Setting the category on an
   untracked release needs the name, category and both dates together, after which it's tracked. The same field
   rules as AC-4 apply. It recomputes the status (history row `source: update` when it changes), sets `updated_at`,
   and is audited `delivery.release.update` with before and after. `set_release_proposals` and `tag_release` also refuse
   a Completed release; an untracked release keeps today's behaviour for both.
8. **AC-8 Completion.** In the same locked transaction, `record_deployment` of a valid deployment to a tracked,
   uncompleted release's category environment sets `status = completed`, `completed_at` = the deployment's time,
   `completion`, `completing_deployment_id`, and a history row (`source: deployment`, `deployment_id`). Testing,
   rolled-back, and deployments to other environments don't complete it. Prod releasing proposals is unchanged.
9. **AC-9 Void reopens.** `void_deployment` of the completing deployment looks for another valid deployment to the
   category environment: the earliest one completes it instead (history `source: void`); with none, the release is
   reopened to the AC-3 status with `completed_at`, `completion` and `completing_deployment_id` cleared (history
   `source: void`). Voiding any other deployment leaves the release as it is.
10. **AC-10 Reads.** `get_release`, `get_release_history` and `list_releases` rows carry `name`, `category`, `startDate`,
    `targetDate`, `status`, `completedAt`, `completion` and `updatedAt` (null for an untracked release), and
    `get_release_history` adds `statusHistory` (oldest first). `list_releases` keeps its order and gains no filters
    (phase 3). Its `proposals` count leaves out withdrawn proposals.
11. **AC-11 Scope.** Every new or changed write is a `defineService` with `scoped(ctx, "delivery:release:create",
    project.id)`: a PM of another project, an Engineer, Finance and HR are refused; an Admin and the project's PM may.
    Reads keep `delivery:read`; a release of another tenant is never found (RLS), tested with two tenants.
12. **AC-12 Chat.** The `delivery.new-release` intent asks for the name, category and dates as well (no new card; the
    full card is phase 2), and `createReleaseCard` shows Name, Category, Start, Target and Proposals. The release pin's
    offers and every existing caller of `create_release` (fixtures, tests, the e2e) send the new fields.
13. **AC-13 Nothing else breaks.** Release pages, the release map, the board band, the portfolio's next release, In
    Prod, the CSV, the charts, pins and deployment history behave as before for untracked releases; the existing
    delivery suites (`releases.test.ts`, `release-ref.test.ts`, the portfolio and board tests) pass, plus `pnpm lint`
    (module graph) and typecheck.

## Tasks

- [x] `T1` — Chat: New release asks for name, category, start and target; the create card shows them; an update card for `update_release` (AC-12, AC-7 card)
  Files: modules/delivery/chat.ts, modules/delivery/server/write-cards.ts, packages/ai/src/scripted-writes.ts, packages/ai/tests/scripted-writes.test.ts
- [x] `T2` — Migration and the status rule: `0025_release_tracking.sql` (release columns, checks, `name = version` backfill, `release_status_history` with RLS and no update/delete grant) and the pure `releaseStatus` / `completionOf` in a new `server/release-status.ts`, with its unit tests (AC-1, AC-2, AC-3)
  Files: modules/delivery/db/migrations/0025_release_tracking.sql, modules/delivery/server/release-status.ts, modules/delivery/tests/release-status-123.test.ts
- [x] `T3` — Services: `createRelease` takes and checks the new fields and the category environment, writes status and history, returns `href`; `assignProposals` refuses ineligible phases and open-release conflicts (no silent move); new `updateRelease`; `setReleaseProposals` and `tagRelease` refuse a Completed release; `recordDeployment` completes and `voidDeployment` reopens or re-completes, under the existing locks (AC-4 to AC-9)
  Files: modules/delivery/server/services.ts, modules/delivery/server/release-status.ts
  Depends: T2
- [x] `T4` — Tools and reads: `create_release` input, new `update_release` write tool; `ReleaseRow`, `listReleases`, `getRelease` carry the new fields, `statusHistory`, and a proposal count without withdrawn ones; README and contracts note (AC-4, AC-7, AC-10, AC-11)
  Files: modules/delivery/mcp.ts, modules/delivery/server/queries.ts, modules/delivery/README.md
  Depends: T3
- [x] `T5` — Tests and callers: DB tests for create, read, list, update, dates, category, eligibility, conflicts, completion, void, scope by role and two tenants; existing tests that call `create_release` / `createRelease` send the new fields; run the delivery, notifications and ai suites, `pnpm lint` and typecheck (AC-4 to AC-13)
  Files: modules/delivery/tests/release-tracking-123.test.ts, modules/delivery/tests/releases.test.ts, modules/delivery/tests/owner-accept-118.test.ts, modules/delivery/tests/pin-offers.test.ts, modules/delivery/tests/proposal-lifecycle.test.ts, modules/delivery/tests/stable-pins.test.ts, modules/delivery/tests/sync-import.test.ts, modules/delivery/tests/proposal-regression.test.ts, modules/notifications/tests/delivery-flow.test.ts
  Depends: T1, T4

## Verify

**Verdict:** PASS, with the review stopped at the five-pass cap (AGENTS.md): 0 blockers, 2 majors (one carried on a path that doesn't exist) and 3 minors open at the final pass, recorded below.
Review: ESCALATE at the cap: 5 passes (rounds 1 to 4 and the final pass, opus), final pass at 5fd18c7ad9. Run as 123 with `base_branch` 35a824c7 (122's head) for each run, config restored after each. The product owner chose this scope (2026-11-26): the CLI always diffs to HEAD, and no earlier loop had reviewed 123's commit, so the loop reviewed the whole release stack (123 to 128) once more. Its fixes are committed under 123, after 124–128's final passes. The review gate passes it: no open blocker, final pass in the PR.

The loop's fixes (rounds 1 to 4, each with a table-driven test in `release-review-123.test.ts`, 20 tests, each fix mutation-checked):
- A completed release's pin offers no re-tag or proposal change, and a Verified proposal's pin offers the newest open release.
- An environment that open releases complete on can't be renamed to another name, unmarked as Prod or removed.
- `update_release` tracking a release, or moving it to a category it already reached, completes it on its first live deployment there, with no Off track on the way.
- An environment change that gives a category an environment an open release already reached completes it there. The row is read again under its lock, so a completion never rewrites. The change's audit names what it completed, and history and event say `source: environment` (migration 0028).
- Release edits and environment changes take the project row lock first.

Amendments since this record: AC-9's reopen-on-void is replaced by 126 (Completed is final; the page shows the void); AC-7's "name with the category and dates" by 125 (the name is optional and stays the version).

Checked 2026-11-26 on the working tree over `35a824c`, Windows 11, local dev database (`amax-dev-postgres`, 0025 applied).

- AC-1: pass — `0025_release_tracking.sql` adds the columns, checks and backfill; an untracked fixture release reads its name as its version, a half-tracked row and a target before start are refused by the table (`release-tracking-123.test.ts` AC-1).
- AC-2: pass — `release_status_history`, one row per status taken and none for an unchanged one; the app role gets permission denied on delete and on updating `to_status`; tenant RLS on every delivery table (AC-2).
- AC-3: pass — `releaseStatus` and `completionOf`, each branch and the day boundary in UTC, Asia/Colombo and America/New_York (`release-status-123.test.ts` AC3).
- AC-4: pass — required fields, plain refusals (dates, category, name, no UAT environment, duplicate version), `status` and `href` in the result, audited (AC-4); in the app, FLT v1.11.0 and v1.12.0 were created from chat and stored `uat`, Planned, one history row each, and a target before the start is refused on the card (`shots/app-refusal-light.png`).
- AC-5: pass — a Proposed proposal is refused naming its phase; Verified goes in; CON-014 (Building) keeps its place in CON v2.5.0 (AC-5).
- AC-6: pass — both `createRelease` and `setReleaseProposals` refuse a proposal in another open release, naming it, its category and status; an untracked one reads "(Untracked)"; it moves once that release is completed (AC-6); the deadlock race now waits and is refused (`releases.test.ts`).
- AC-7: pass — `update_release` (write tool with its service), status recomputed with an `update` history row, an untracked release tracked only whole, a completed one refuses update, proposals and re-tag (`release-tracking-123-writes.test.ts` AC-7).
- AC-8: pass — testing, rolled-back and Dev deployments leave a UAT release In progress; a deployed UAT record completes it on time; a Prod release past its target completes late (AC-8).
- AC-9: pass — voiding a Dev record changes nothing; voiding the completing record moves completion to the other valid one; voiding that reopens it In progress with the completion cleared and a `void` history row (AC-9). When completion moves, the status stays Completed, so AC-2's rule (no row for an unchanged status) applies and no row is written.
- AC-10: pass — `list_releases`, `get_release` and `get_release_history` carry the fields and `statusHistory`; the count leaves out a withdrawn proposal; untracked rows read null (AC-10).
- AC-11: pass — the PM of CON may create there and is refused on RTK; Engineer, Finance and HR are refused; another tenant's release is never found (AC-11).
- AC-12: pass — the intent asks for the new fields; the card shows Name, Category, Start, Target (`release-status-123.test.ts` AC12; `shots/app-card-light.png`, `shots/app-card-dark.png`); the pin offer's prompt and the scripted parser take the details, and e2e "081 AC-39" types them (not run here; CI runs it).
- AC-13: pass — the release, proposal, pin, sync and notification suites pass with their callers updated; lint, typecheck and the web build pass.

Commands (exit codes):

- `pnpm lint` (36 tasks): 0; `node scripts/check-graph.mjs --root .`: 1 — one problem, the deliberate R7 fixture under `packages/testing/boundaries/` (the script's own root reads 0 modules on Windows); `node scripts/check-module-standard.mjs --root .`: 0 (23 modules)
- `pnpm turbo run build --filter=./apps/web`: 0
- `pnpm turbo run test --filter=@amax/delivery --filter=@amax/notifications --filter=@amax/ai --concurrency=1 --continue --force`: 1 — ai 6/6 files, notifications 7/7, delivery 83/84: the one failure is host-only (`releases.test.ts` "assignProposals … two call sites" compares a backslash path on Windows)
- `specclaw-verify size` with `base_branch` 35a824c7 for the run (config restored): 0 — 292 production lines (cap 400)
- `specclaw-preset-check .`: 1 — repo-wide, pre-existing; none in this change's files
- `specclaw-quality-scan . --gate`: 2 — the complexity tool did not run; duplication 860 lines repo-wide, none in this change's files
- e2e: not run here (the signed-in suite's database doesn't set up on Windows); the app flow was driven with Playwright against the dev app instead (scratch script)

Screenshots: `shots/mock.png`, `shots/app-card-light.png`, `shots/app-card-dark.png`, `shots/app-refusal-light.png`

Review commands (at the final pass, 5fd18c7a): `npx vitest run modules/delivery modules/notifications modules/leave apps/web/tests`: 1, 1273/1274, host-only `releases.test` "two call sites"; `npx tsc --noEmit` in `modules/delivery` and `apps/web`: 0; dev database migrated to 0028.

Open at the stop (the final pass; fixes go in their own change, since a code commit under 123 after its final pass fails the review gate):

- Major [B12] `server/services.ts`, **false positive**: the finding is that `recordDeployment` without the project lock races making QA the Prod environment and leaves the release open. Both sides already lock the release row, so whichever goes second reads the other's write. A follow-up change (proposed as 129, 2026-11-26) added the lock and was withdrawn at build by the product owner: three forced interleavings (the deployment paused after reading the Prod environment; the environment change paused after its environment write; and paused after looking for a deployment there) end Completed on the QA deployment, once, with and without the lock (`evidence/deployment-lock.test.ts.txt`, 3/3 both ways on the dev database). Its folder was then removed so the PR adds no change without a review loop; number 129 is free.
- Major (carried, path `modules/delivery/services.ts`, which doesn't exist): the round 3 audit finding. It was fixed in rounds 3 and 4 (`after.completed`, `source: environment`), but the tool carries a finding on a missing path into every later round. This carried finding caused the ESCALATE.
- Minor: the category-to-environment rule is written twice, `categoryEnv` in SQL and `serves` in JS; derive one from the other.
- Minor: `STATUS_FILTERS` repeats the status labels; build them from `statusLabel`.
- Minor: a completion by `update_release` is recorded with source `deployment`; record it as `update` with the deployment id.

Quality: 872 → 860 duplicated lines (repo-wide; `openRelease` shares the tag, proposals and update openings; none in the files this change adds). Complexity: lizard not_run.
