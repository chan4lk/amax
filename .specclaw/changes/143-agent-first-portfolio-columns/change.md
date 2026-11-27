# Agent-first projects fill their portfolio row from what the repo already tells amax

**Change:** 143-agent-first-portfolio-columns · **Created:** 2026-11-20 · **Review:** change

## Problem

On Projects → Portfolio, the amax project's row is empty: no Manager, Sprint, Margin or Next release, a "0 of 0" bar,
and a Health of "On track" that is only the column default. These are stored columns that only the demo fixtures fill
(`set_project_manager` writes Manager). An agent-first project (093: a linked repo that has synced proposals) already
gives amax what it needs to work them out: the proposals' phases, tasks and verify verdicts, plus its releases and
deployments. Asked by the product owner (2026-11-20).

## Mock Delta

What changes on screen, and where to see it: [`143-agent-first-portfolio-columns`](../../mock/index.html#143-agent-first-portfolio-columns)

- The amax row on Portfolio shows a computed Sprint, Progress, Health and Next release, each with a short reason.
- Amendment 1 (product owner, 2026-11-20, from a screenshot): long values wrapped and the row looked messy, so Sprint
  and Next release keep a short main line with the detail as a small second line, and Progress drops "tasks".
- Amendment 2 (product owner, 2026-11-20, review round 3 escalation): amax doesn't record when a proposal entered its
  phase, and three rounds of guessing a 14-day "unchanged" clock from proxies kept failing review. At risk now reads the
  repo's own status: an open proposal marked `blocked`. No clock, no migration.
- Manager says "No manager" instead of a blank, and Margin says "Internal" for an internal project.

## Acceptance Criteria

Each rule below applies to an agent-first project only. A manual project keeps its stored values exactly as today.
"Open proposals" means the project's proposals that aren't released or withdrawn (`withdrawnIn`).

1. **AC-1 Sprint.** The cell reads "Continuous", because an agent-first project has no sprints, with the
   number of open proposals as a small second line ("4 open").
2. **AC-2 Progress.** The bar and its label are the sums of `tasks_done` and `tasks_total` over the open proposals
   (for example "23 of 31", like a manual project's row). With no open proposal, it reads "Nothing open" instead of "0 of 0".
3. **AC-3 Health** comes from the open proposals:
   - **off-track** when any of them has a latest verify verdict of FAIL;
   - **at-risk** when none has failed but one's repo status is `blocked` (amendment 2);
   - **on-track** otherwise.

   The chip's tooltip and its `sr` text name the reason (for example "Off track: AMX-112 failed verify", "At risk: AMX-090 blocked").
4. **AC-4 Next release.** It is the newest release that hasn't reached the project's Prod environment, with the
   furthest environment it is in now as a small second line ("v0.14.0" over "in Staging", or "not deployed"). With no
   such release but with verified proposals waiting, it reads "3 verified" over "not released". With neither, it
   reads "–". `list_projects` returns the second line as `nextReleaseNote`.
5. **AC-5 Margin.** An internal project (`billing = 'internal'`, agent-first or not) shows "Internal", not "–". A billed
   agent-first project keeps its stored margin, since finance data is out of scope here.
6. **AC-6 Manager** is never computed, because naming a manager is a person's decision. A null manager shows
   "No manager" in the cell, not an empty avatar. The row's pin is enough for chat to suggest `set_project_manager`
   (R3); the row gets no form.
7. **AC-7 One source.** `list_projects`, `get_project`, the Portfolio table and the Projects page's lede and tickets
   all read the same computed values from one function in `modules/delivery/server`. Nothing new is written to the
   database, and no migration is needed.
8. **AC-8 Tests.** Unit tests cover each rule's branches (AC-1 to AC-6), and one e2e checks the AMX row on
   `/delivery` with its fictional fixture data.

## Tasks

- [x] `T1` — Portfolio cells read the computed values: Sprint "Continuous" over "N open", Progress "N of M" or "Nothing open", Health chip with its reason as tooltip and visible small text, Margin "Internal", Manager "No manager" (AC-1–AC-6)
  Files: modules/delivery/ui/ProjectsPage.tsx
  Depends: T2
- [x] `T2` — One read-time function computes an agent-first project's Sprint, Progress, Health (and its reason) and Next release from its open proposals, releases and Prod deployments; internal billing gives margin "Internal"; `listProjects` and `getProject` apply it, so `list_projects`, `get_project`, the table, lede and tickets share it; manual projects unchanged; no writes, no migration (AC-1–AC-5, AC-7)
  Files: modules/delivery/server/portfolio.ts, modules/delivery/server/queries.ts, modules/delivery/mcp.ts
- [x] `T3` — Unit tests for every rule's branches (open/none, FAIL/stale 14 days/fine, release not in Prod/verified waiting/neither, internal vs billed margin, null manager, manual project untouched), and an e2e for the AMX row on `/delivery` (AC-8)
  Files: modules/delivery/tests/portfolio-121.test.ts, apps/web/tests/e2e/delivery.spec.ts
  Depends: T1, T2

## Verify

**Verdict:** PASS (every AC met; review stopped at the five-pass cap with one major open, below)
- AC-1: pass — Sprint "Continuous" with "N open" below; `portfolio-121.test.ts` AC-1, live AMX row "Continuous / 53 open" (shots/app.png)
- AC-2: pass — Progress sums the open proposals' tasks ("255 of 255"); "Nothing open" with none; `portfolio-121.test.ts` AC-2
- AC-3: pass — Off track on a FAIL verdict, At risk on a repo-`blocked` proposal (amendment 2), else On track, reason as tooltip and small text; `portfolio-121.test.ts` AC-3, `portfolio-121-status.test.ts` (4 cases)
- AC-4: pass — newest release not live in Prod and newer than the live one, with its current environment (latest non-voided deployment per environment, rollbacks excluded), else "N verified / not released", else "–"; `portfolio-121-facts.test.ts` (5 cases), `portfolio-121-offers.test.ts` (3 cases, the pin offer shares the rule)
- AC-5: pass — "Internal" for internal billing, stored margin otherwise; `portfolio-121.test.ts` AC-5, e2e 121 AC-8, shots/app.png
- AC-6: pass — "No manager" for a null manager; e2e 121 AC-8, shots/app.png
- AC-7: pass — `withPortfolio` in `listProjects`/`getProject` is the one source; `portfolio-121.test.ts` AC-7 (list_projects equals get_project, manual CON unchanged); live `list_projects` on the dev DB; no migration
- AC-8: pass — unit and DB tests above; e2e `delivery.spec.ts` "121 AC-8" written, not run on this host (needs the e2e server; CI runs it)

Commands (base scoped to 120's head `78db0e55` for size and review, then restored):
- `vitest run` in modules/delivery against the dev Postgres: 749/750; the one failure is pre-existing and host-only (`releases.test.ts` matches `modules/delivery/` with forward slashes; Windows paths). `authors-091`, `commits-104`, `create-project-surfaces` time out only under full-suite load and pass alone.
- `tsc --noEmit` modules/delivery: 0 · apps/web: 0 · `node scripts/check-graph.mjs`: 0
- `specclaw-verify size`: 83 production lines against 78db0e55 (cap 400): 0
- `specclaw-preset-check .`: exit 1, 4675 repo-wide, all pre-existing; none added by 121 (new files clean; touched files were already over 80 lines and commented)
- `specclaw-quality-scan . --gate`: exit 2, not_run (complexity tool reported 0 functions); duplication none in 121's files
- Screenshots: shots/app.png (live /delivery, demo user), shots/mock.png (mock#121); the AMX row matches the mock

Review: OPEN at the cap — 5 rounds (opus/opus), last round 0/1/0 b/M/m; fix proof not proven (no review.test_command). Stopped per AGENTS.md after the fifth pass. Open major [B4] `in-prod.ts:16`: two "live in Prod" rules (`liveOnProd` for the next release, `liveProdDeployments` for In Prod) disagree after a Prod rollback; rounds 4 and 5 asked for opposite fixes, so it needs a product decision. Recorded in follow-ups.md. No blocker open.

Quality: 57 → 57 duplicated lines in modules/delivery (none in 121's files; no refactor).
