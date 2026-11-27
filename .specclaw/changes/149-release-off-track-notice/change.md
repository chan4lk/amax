# Release tracking, phase 5: the project's PM hears when a release goes Off track

**Change:** 149-release-off-track-notice · **Created:** 2026-11-26 · **Review:** change

## Problem

Since 126 the hourly check turns a release Off track when its target day passes without a valid deployment, but nobody
is told: the PM finds out only by opening the release list. The phase 5 brief (product owner, 2026-11-26) asks for the
project's PM to be notified once, when the release goes Off track, with its name, category, target date, status and a
link, through the existing workflow and notification infrastructure.

Decision (product owner, 2026-11-26): **keep 126's hourly check** (one schedule for every zone; a release turns Off
track within the hour after its target day ends where its project is) instead of a daily one. Already in place from
126 and kept: automatic evaluation, the status rule, history only on a change, one transaction and one audit row per
tenant run, and the workflows engine's retries and run log.

## Mock Delta

What changes on screen, and where to see it: [`149-release-off-track-notice`](../../mock/index.html#149-release-off-track-notice)

- The PM's notifications show "November Release is now Off track" with "UAT release · target 12 Dec 2026 · no
  successful UAT deployment yet" and a link to the release.

## Acceptance Criteria

1. **AC-1 The event.** Every status change a release takes (create, edit, deployment, the check) raises
   `delivery.release.status_changed` (`EVENTS.releaseStatusChanged`, contract type `ReleaseStatusChanged`: releaseId,
   projectId, projectKey, version, name, category (its label), targetDate (as "12 Dec 2026"), from, to, toLabel,
   source, href), in the same transaction as the status and its history row. A write that leaves the status as it
   was raises none. Its payload is declared for outgoing webhooks; README and contracts say so (additive).
2. **AC-2 The notice.** A notification rule `delivery.release-off-track` on that event, when `to` is `overdue`, tells
   the project's manager (its PM, `managerUserId` on the event, who must hold `delivery:release:create` on the project), category releases, urgent: title
   "{name} is now Off track", body "{category} release · target {targetDate} · no successful {category} deployment
   yet", linking to the release page. It goes through the notifications module, so each person's preferences, quiet
   hours and permissions apply.
3. **AC-3 Once per transition.** A release that stays Off track through later runs raises nothing more and notifies
   no one again; a release that goes Off track, is edited back to In progress and passes its target again notifies
   again (a new transition). Completing an Off track release is a normal status change and sends no Off track notice.
4. **AC-4 Safe runs.** A run that fails part way writes nothing for that tenant (its evaluation, history rows and
   events are one transaction) and the engine retries the step; the retry finds the same releases and notifies each
   once. A failed run shows on Settings → Workflows with its error, as every workflow run does.
5. **AC-5 Tests.** The check run on a pinned day: an Off track transition notifies the project's PM (and not a PM of
   another project, nor Finance); a second run notifies no one; edited back and overdue again notifies again;
   completion sends no Off track notice; the zone decides the day (a Kiritimati project goes Off track before a UTC
   one); a run that throws part way leaves no status change, history row or notification, and its retry sends each
   notice once.

## Tasks

- [x] `T1` — The event: `EVENTS.releaseStatusChanged` and `ReleaseStatusChanged` in the contract, built in one place from the release and its project and returned by `writeStatus` on a change; every writer (create, edit, deployment, the check) emits it with its write; payload declared in the manifest (AC-1)
  Files: modules/delivery/contracts.ts, modules/delivery/server/release-tracking.ts, modules/delivery/server/services.ts, modules/delivery/server/release-check.ts, modules/delivery/module.ts
- [x] `T2` — The notice: rule `delivery.release-off-track` on the change to `overdue`, to the project's PMs, urgent, with the title, body and link from the payload (AC-2, AC-3)
  Files: modules/delivery/module.ts
  Depends: T1
- [x] `T3` — Tests and docs: notice to the project's PM only, once per transition, again after a new transition, none on completion, the zone deciding the day, a run that throws part way writes and notifies nothing and its retry notifies once; README and contracts note; lint and typecheck (AC-4, AC-5)
  Files: modules/delivery/tests/release-notice-127.test.ts, modules/delivery/README.md
  Depends: T2

## Verify

**Verdict:** PASS
Review: CLEAN — 3 rounds, final pass e2789a43de, models opus/opus; last round 0/0/1 b/M/m; fix proof not proven: no review.test_command configured, so no test could prove the fix
Covers 126-release-status-engine: this loop ran from 126's base (52435965) over both changes' commits; 126 declares `**Review:** covered-by 127-release-off-track-notice`.
Size: 62 production lines against 9b40ea2c (cap 400). Open, in `follow-ups.md`: two minors (the README's 123 void sentence and Notifications line; the notice also reaches a PM who made the change themselves, no `except: "by"` yet).

Checked 2026-11-26 at `5cbf593` (gates) and `e2789a4` (review), Windows 11, dev app with the scripted chat model.

- AC-1: pass. `delivery.release.status_changed` once per change, none for an unchanged write; payload with ISO `targetDate` and `category` plus their labels after round 1 (`release-notice-127.test.ts` AC-1).
- AC-2: pass. Maya, Contoso's manager, gets "Notice check is now Off track", urgent, "UAT release · target 30 Sept 2026 · no successful UAT deployment yet", linking to the release (`shots/app-notifications.png`; `notifications/tests/release-off-track-127.test.ts`).
- AC-3: pass. Once per transition; again after a new transition; completion is its own (AC-3 test); Fleet Tracker's release and an engineer get nothing.
- AC-4: pass. A run that fails part way writes and raises nothing; its rerun raises each event once (AC-4 test, an injected trigger failure).
- AC-5: pass. The tests above.

Commands (exit codes), at `5cbf593` unless noted:

- `pnpm lint` (36 tasks): 0; `node scripts/check-module-standard.mjs --root .`: 0 (23 modules); `node scripts/check-graph.mjs --root .`: 1, only the deliberate R7 fixture
- `pnpm turbo run build --filter=./apps/web`: 0
- `pnpm turbo run test` (delivery, notifications, workflows, web; `--concurrency=1 --continue --force`): 1, host-only: `releases.test` (backslash path), workflows `kill.test` (`spawn npx ENOENT`), and load timeouts that pass alone (16/16); after the review fixes, delivery, notifications and leave 825/826 (the backslash test)
- `specclaw-preset-check .`: 1, repo-wide, pre-existing; none in 126's or 127's files
- `specclaw-quality-scan . --gate`: 2, the complexity tool did not run; duplication 860 lines repo-wide, none in these files
- `specclaw-review` rounds 1 to 3 as 127 with `base_branch` 52435965 for the run (126's base; config restored after each), covering 126 and 127

Screenshots: `shots/mock.png`, `shots/app-notifications.png` (five notices: five releases from five script runs, one each)

Build notes (2026-11-26): AC-2 reads "the project's manager": routing to every role-PM with the right on the project also reached Admins who hold PM, for every project. The brief asks for the responsible PM, so the event carries the project's `managerUserId` and the rule sends to that person (a project with no manager notifies no one). The notifications test lives in `modules/notifications/tests/` (module boundaries: it drives Delivery through its tools); the event tests in Delivery.

Quality: 860 → 860 duplicated lines (repo-wide; none in this change's files). Complexity: lizard not_run.
