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

## Tasks

- [x] `T1` — Render the `.dv-title` row only with the info icon; otherwise the plain heading and lede (AC-1, AC-2)
  Files: modules/delivery/ui/ProposalsPage.tsx

## Verify

<!-- Filled by verify: a **Verdict:** PASS|FAIL line, then one `- AC-n: pass|fail — evidence`
     line per criterion, quality before → after, preset check, and screenshot paths
     (or "compared by eye: <who>"). -->
