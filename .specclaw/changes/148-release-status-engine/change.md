# Release tracking, phase 4: release status keeps itself up to date, and Completed is final

**Change:** 148-release-status-engine · **Created:** 2026-11-26 · **Review:** change

## Problem

Since 123 a release's status follows one rule (`releaseStatus`), recalculated on create, edit and deployment. Nothing
moves it when only the calendar changes, so a release stays Planned after its start day and never turns Off track after
its target day until someone writes to it. The phase 4 brief (product owner, 2026-11-26) also asks for a `failed`
deployment that never completes a release, and for Completed to be final.

Decisions (product owner, 2026-11-26), which amend 123's AC-9: **Completed is final**: voiding the deployment that
completed a release no longer reopens it; the page says the record was voided. **Add `failed`** as a deployment status.
Already in place and kept (123): the release-to-deployment link (`deployment.release_id`), the category-to-environment
mapping (Dev and UAT by name, Prod by the project's `is_prod` environment), completion evidence, the inclusive target day,
and history rows only on a change.

## Mock Delta

What changes on screen, and where to see it: [`148-release-status-engine`](../../mock/index.html#148-release-status-engine)

- A release's status history shows "Start date reached" and "Target date passed" rows written by amax.
- A `failed` deployment shows with the bad tone and never completes the release.
- A completed release whose completing deployment was voided keeps Completed and says so.
- Settings → Workflows lists "Release status check", hourly.

## Acceptance Criteria

Terms as in 123. **Unsuccessful**: a deployment whose status is `rolled-back` or `failed`.

1. **AC-1 Failed status.** Migration `0026_release_status_engine.sql` widens `delivery.deployment.status` to
   `deployed | testing | rolled-back | failed` and `release_status_history.source` to add `schedule`.
   `record_deployment` accepts `failed`; the `ReleaseDeployed` contract's status gains `failed` (additive, README). A
   failed record never completes a release and never releases proposals.
2. **AC-2 One rule for unsuccessful.** A shared `unsuccessful(status)` (`server/deployment-status.ts`) is what the map's
   pill ("Failed Wed Oct 14", as for a rollback), the next step ("Retry UAT"), the progress track (✕ "failed"), the
   deployment chip (bad tone, "failed"), the board band, the Overview's rolled-back count, the portfolio's next-release
   stage and the pin offers' retry use; every place that read `rolled-back` alone reads it. A failed deployment
   notifies the project's PMs like a rollback (rule `delivery.release-failed`).
3. **AC-3 Completed is final.** Once a release is Completed nothing changes its status, completion time, on-time or late,
   or completing deployment: not a later rollback or failure (already true), and not voiding the completing deployment
   (amends 123 AC-9: no history row, no reopening). `get_release_history` adds `completingVoided` (the void's time and
   reason, or null), and the release page says "The deployment that completed this release was voided on <date>:
   <reason>. The release stays completed."
4. **AC-4 The scheduled check.** A workflow `delivery.release-status` with an hourly UTC schedule (`0 * * * *`, enabled)
   evaluates every tracked release that isn't completed, in every tenant: it works out today in the release's project zone
   (AC-6) and applies `releaseStatus`. A change writes the status and one history row (`source: schedule`, by amax);
   the run is one audited write per tenant (`delivery.release.evaluate`, `after.changed`: version, from, to) and its
   summary says "<n> releases moved". It's listed in Settings → Workflows.
5. **AC-5 Idempotent and safe.** Running the check twice in a row changes nothing the second time and writes no second
   history row. Each release row is locked while it is evaluated, and a release a deployment completed meanwhile is left
   alone, so the check never overwrites Completed.
6. **AC-6 Timezone.** The day is the project's legal entity zone (`entityZone`: the entity's own zone, else its
   country's default) and UTC for a project with no legal entity or no zone; the tenant's `delivery.clock_pin` applies,
   as everywhere in Delivery. The README says so.
7. **AC-7 Reasons in the history.** The status history's Why reads "Start date reached" (to In progress) or "Target date
   passed" (to Off track) for a scheduled change, by "amax".
8. **AC-8 Tests.** Planned, In progress and Off track by date; on-time and late completion (target day inclusive, project
   zone); the matching environment completes, another doesn't; failed, testing and rolled-back don't; voiding the
   completing deployment keeps Completed; a rollback after completion keeps it; the check run twice writes once; the
   check leaves a release completed meanwhile alone; deployment history and the existing release suites still pass.

## Tasks

- [x] `T1` — UI: the one `unsuccessful` rule on every screen that read `rolled-back` (map pill, next step, progress track, deployment chip, board band); the "completing deployment voided" line on the release page; the history's Why for scheduled changes (AC-2 UI side, AC-3 page, AC-7)
  Files: modules/delivery/server/deployment-status.ts, modules/delivery/ui/ReleasesPage.tsx, modules/delivery/ui/ReleaseTable.tsx, modules/delivery/ui/ReleaseDeployments.tsx, modules/delivery/ui/ReleaseHistory.tsx, modules/delivery/ui/ReleasePage.tsx, modules/delivery/ui/BoardBand.tsx, modules/delivery/ui/band.ts
- [x] `T2` — Data and services: migration 0026 (`failed`, `schedule`); `record_deployment` and the contract accept `failed`; Overview, portfolio and pin offers use `unsuccessful`; the failed notification rule; voiding the completing deployment keeps Completed and `get_release_history` reports `completingVoided` (AC-1, AC-2 server side, AC-3)
  Files: modules/delivery/db/migrations/0026_release_status_engine.sql, modules/delivery/server/services.ts, modules/delivery/server/release-tracking.ts, modules/delivery/server/queries.ts, modules/delivery/server/overview.ts, modules/delivery/server/portfolio.ts, modules/delivery/server/pin-offers.ts, modules/delivery/contracts.ts, modules/delivery/mcp.ts, modules/delivery/module.ts
  Depends: T1
- [x] `T3` — The hourly check: `evaluateReleases` (one audited write per tenant, rows locked, Completed untouched, history only on a change, the project zone with UTC fallback) as workflow `delivery.release-status` with its hourly schedule in the manifest (AC-4, AC-5, AC-6)
  Files: modules/delivery/server/release-check.ts, modules/delivery/module.ts
  Depends: T2
- [x] `T4` — Tests and docs: the brief's full list (planned, in progress, off track, on time, late, matching and other environments, failed, testing, rollback, void, repeated run, finality, a completion during the check), 123's void test amended, README, lint, typecheck (AC-8)
  Files: modules/delivery/tests/release-engine-126.test.ts, modules/delivery/tests/release-tracking-123-writes.test.ts, modules/delivery/README.md
  Depends: T3

## Verify

**Verdict:** PASS
Renumbered by 152 (was 126-release-status-engine, 2026-11-26): `**Review:** change` now, with its own final pass after the rename (below), because the review gate reads a change's history by its folder path, which starts at the rename. The record of the earlier cover follows.
Review: covered by 127-release-off-track-notice (one loop over both changes' commits, from 126's base 52435965): CLEAN, final pass e2789a43de
Size: 204 production lines against 52435965 (cap 400).

Checked 2026-11-26 at `5cbf593`, Windows 11, dev app on :3000 with the scripted chat model, dev database migrated to 0026.

- AC-1: pass. Migration 0026; `record_deployment` and the contract accept `failed`; a failed UAT record leaves a UAT release open (`release-engine-126.test.ts` AC-1 AC-3; `shots/app-release-failed-voided.png`, the failed row seeded directly in the dev database, since the scripted model has no phrase for it).
- AC-2: pass. One `unsuccessful` rule (in Delivery's contract after round 1, so Leave uses it too): map pill "Failed Wed Oct 14", "Retry UAT" (AC-2 test), the chip, the board track colour, the Overview note, the portfolio SQL; Leave's retry for failed (`leave/tests/standard.test.ts`); the failed notification rule.
- AC-3: pass. Voiding the completing deployment keeps Completed (Late) with the line "The deployment that completed this release was voided on 26 Nov 2026: wrong build. The release stays completed." (`shots/app-release-failed-voided.png`; 123's amended AC-9 test).
- AC-4: pass. `delivery.release-status` hourly, listed in Settings → Workflows (`shots/app-workflows.png`); moves releases with one audited write per tenant (AC-4 test).
- AC-5: pass. A second run changes nothing; two runs and a deployment at once write each transition once (`release-notice-127.test.ts` AC-5, which fails 3/3 without the row lock).
- AC-6: pass. A Kiritimati project goes Off track a day before a UTC one (AC-6 test); README documents the fallback.
- AC-7: pass. "Start date reached", "Target date passed", by amax (AC-4 test).
- AC-8: pass. The brief's list across `release-engine-126`, `release-notice-127` and 123's suites.

Commands (exit codes), at `5cbf593` unless noted:

- `pnpm lint` (36 tasks): 0; `node scripts/check-module-standard.mjs --root .`: 0 (23 modules); `node scripts/check-graph.mjs --root .`: 1, only the deliberate R7 fixture
- `pnpm turbo run build --filter=./apps/web`: 0
- `pnpm turbo run test` (delivery, notifications, workflows, web; `--concurrency=1 --continue --force`): 1, host-only: `releases.test` (backslash path), workflows `kill.test` (`spawn npx ENOENT`), and load timeouts that pass alone (16/16); after the review fixes, delivery, notifications and leave 825/826 (the backslash test)
- `specclaw-preset-check .`: 1, repo-wide, pre-existing; none in 126's or 127's files
- `specclaw-quality-scan . --gate`: 2, the complexity tool did not run; duplication 860 lines repo-wide, none in these files
- `specclaw-review` rounds 1 to 3 as 127 with `base_branch` 52435965 for the run (126's base; config restored after each), covering 126 and 127

Screenshots: `shots/mock.png`, `shots/app-release-failed-voided.png`, `shots/app-workflows.png`

Verify fix: deployment rows leave room for their pin (125's rows let the pin cover Void).

Build notes (2026-11-26): 123's AC-9 test now asserts the amended rule (a void leaves a completed release as it is). `reopenOnVoid` is gone. The pin offers needed no change: they already count only deployed or testing as reached. The rest of the brief's list (matching and other environments, testing, on time and late, the target day inclusive) is covered by 123's suites, which still pass.

Quality: 860 → 860 duplicated lines (repo-wide; none in this change's files). Complexity: lizard not_run.
