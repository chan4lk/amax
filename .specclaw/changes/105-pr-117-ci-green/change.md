# PR #117's CI goes green: the Proposals heading stays full width without the info icon, reviewed in a loop of its own

**Change:** 105-pr-117-ci-green · **Created:** 2026-11-14 · **Review:** change

**Depends on:** 104-agentic-time-from-sync (same branch, PR #117).

## Problem

PR #117's `checks` failed its signed-in e2e on `delivery-visual.spec.ts` (041 AC-6) at 1440 and 390 px:
`/delivery/proposals h1 #1: 668x34.5 vs 160x34.5, 100.0%`. 104's review round 1 put the Proposals heading in the
`.dv-title` flex row on every page, so it shrank to its text even when there was no info icon (the visual tenant has no
agent-first project). The one-file fix was first committed under 104 (`d2badfd`), after 104's final review pass and at
its five-pass cap, so `review-gate` (fork PR) failed every covered-by change in the stack (082–086 under 081, 092
under 093): no loop in the PR reviewed that commit. `docker-k3s` failed on a k3d image import (`short read … unexpected
EOF`), a runner fault.

**Amendment 1 (2026-11-14, PR #117 CI run 2):** with the heading fixed, `checks` failed next on `admin.spec.ts`
(047 AC-1): the Settings hub said "3 schedules wait for an entity's time zone" where it expects 2. 104's nightly
`time.proposal-hours-refresh` was declared per legal entity, so it counted as one more schedule waiting for an
entity's zone, and it recomputed every project of the tenant once per entity (104 review pass 6's minor). It now runs
once per tenant, with no time zone (AC-4).

## Mock Delta

What changes on screen, and where to see it: [`105-pr-117-ci-green`](../../mock/index.html#105-pr-117-ci-green)

No new design. Without the info icon, the Proposals page's heading and lede are as `001-amax-foundation-proposals`
shows them, as before 104; with it, as `104-agentic-time-from-sync` shows.

## Acceptance Criteria

1. **AC-1** On `/delivery/proposals`, the `.dv-title` flex row is rendered only when the agent-first info icon is; without
   it the page renders a plain full-width `h1` and the lede, as before 104. `delivery-visual.spec.ts` passes at 1440 and
   390 px with no new allowance.
2. **AC-2** With the icon, the heading, icon and popover are as 104 AC-14 (amended) says: the heading's accessible name is
   "Proposals", and the popover opens on click and closes on Escape.
3. **AC-3** The fix is in a commit named for 105, after `d2badfd` is taken out of the branch, and 105's own final
   review pass runs at or after it, so `review-gate` passes for every change in PR #117, covered-by ones included.

4. **AC-4** (Amendment 1) `time.proposal-hours-refresh` is a tenant-wide schedule (no `timezone`), so the Settings
   hub counts 2 schedules waiting for an entity's time zone again (`admin.spec.ts` 047 AC-1) and the refresh runs once
   per tenant. `schedules.test.ts` pins it.

## Tasks

- [x] `T1` — Render the `.dv-title` row only with the info icon; otherwise the plain heading and lede (AC-1, AC-2)
  Files: modules/delivery/ui/ProposalsPage.tsx
- [x] `T2` — Amendment 1: the nightly proposal hours refresh runs once per tenant, not per legal entity (AC-4)
  Files: modules/time/server/proposal-hours-jobs.ts, modules/time/tests/schedules.test.ts

## Verify

<!-- Filled by verify: a **Verdict:** PASS|FAIL line, then one `- AC-n: pass|fail — evidence`
     line per criterion, quality before → after, preset check, and screenshot paths
     (or "compared by eye: <who>"). -->

**Verdict:** PASS. Review clean (1 round, final pass at `002785f3`, opus). Verified on 2026-11-14.

- AC-1: pass. `ProposalsPage.tsx` renders `.dv-title` only when the agent-first icon shows; otherwise the plain `h1` and
  lede as before 104. `delivery-visual.spec.ts` (041 AC-6) runs in PR #117's CI, the check of record: it can't run
  on this Windows host.
- AC-2: pass. `proposals-button-104`: the labelled icon button, its popover target and the two steps; 104's screenshot
  (`104-agentic-time-from-sync/shots/app-proposals.png`): the popover opens on click, Escape closes it, the heading's
  name is "Proposals".
- AC-3: pass. `d2badfd` is out of the branch; 104's records are `8b58a9dd` (`.specclaw/` only) and the fix is
  `002785f3`, named for 105, whose final pass ran there.
  `node scripts/check-review-gate.mjs --base 94565fc2 --head HEAD --fork true`: 104 pass; 105 passes once its review
  record is committed.
- Commands (Windows host): `tsc --noEmit` (delivery) exit 0; `proposals-button-104` and `proposals-action-094` 9/9.
  `docker-k3s` failed on a k3d image import (`short read … unexpected EOF`), a runner fault; the next push re-runs it.
- Screenshot: no new one (no new design; the page without the icon is as `001-amax-foundation-proposals`, compared by
  CI's visual test).
