# Time requests history

**Change:** 077-time-requests-history · **Created:** 2026-10-25 · **Review:** covered-by 073-time-workflow-enhancements

## Problem

Every change request and its decision is stored (`time.change_request`), but no screen keeps them. The approver's Team
time lists only requests still open; the owner's My timesheet shows decided ones for 7 days, then they disappear. Neither
side can look back at what was asked, decided, by whom and why, except by asking chat.

Approved by the product owner, 2026-10-25: "build it end to end including optional too", after the Requests page and
the per-week history fold were proposed in chat.

## Mock Delta

What changes on screen, and where to see it: [`077-time-requests-history`](../../mock/index.html#077-time-requests-history)

A **Requests** page in Time (a third tab beside Team and My timesheet), with **Mine** and **To review** lenses, open
requests first, then decided ones, each a folding row with the whole exchange. Week pages gain a folded **History** of
that week's older decided requests.

## Acceptance Criteria

1. **AC-1** `/time/requests` shows the viewer's change requests in two lenses, **Mine** (requests they made) and
   **To review** (requests they review). The To review tab shows only for someone who reviews at least one request. The
   default lens is To review when something waits there, else Mine when the viewer has requests, else To review. Each tab shows its open count.
2. **AC-2** Requests are grouped **Needs attention** (pending, needs an answer) then **Decided** (applied, reopened,
   completed, declined, withdrawn), newest first within each. Rows reuse the existing request cards (fold, chip, the
   change, the thread, the steps, who decided and when), with their chat actions on open requests only.
3. **AC-3** Read-only filters in the URL: status (All, Open, Applied, Reopened, Declined, Withdrawn) and week (Any, or
   the weeks those requests are on). With no match, an empty state says so and offers to clear the filters.
4. **AC-4** Scope is exactly `get_change_requests`': the viewer's own and those in their approval chain, within their
   entity scope. Nothing new is exposed: a reviewer scoped to one entity never sees another entity's requests.
5. **AC-5** Every row has a **+** pin (as now) and the page has a pin for the list (`get_change_requests`). Team time,
   My timesheet and a member's timesheet have a **Requests** tab beside Team | My timesheet, and Team time's change
   requests card links to "See all requests".
6. **AC-6** Week history: My timesheet and a member's timesheet show a folded **History · {n} decided** under the
   week's open requests, listing every decided request on that week that isn't already shown above (My timesheet keeps
   showing the last 7 days' decisions as now). Closed by default; absent when there are none.
7. **AC-7** Chat on the Requests page names it ("Requests") and suggests "Review change requests" when something waits
   for the viewer.
8. **AC-8** Accessible (tabs as links with `aria-current`, labelled filters, keyboard-complete folds), light and dark,
   phone width without sideways scroll. Axe finds nothing.
9. **AC-9** Tests: lens and grouping, status and week filters, entity scope (a reviewer in another entity sees none),
   week history excludes what's shown above; e2e: the page lists an applied request under Decided and the tab links
   from Team time. Every other test passes unmodified.

## Tasks

- [x] `T1` — The Requests page: lenses, groups, filters, empty state, pins, tabs and links (AC-1, AC-2, AC-3, AC-5, AC-7, AC-8)
  Files: modules/time/ui/RequestsPage.tsx, modules/time/ui/RequestFilters.tsx, modules/time/ui/parts.tsx, modules/time/ui/ChangeRequests.tsx, modules/time/ui/request.css, modules/time/module.ts, modules/time/chat-suggestions.ts
- [x] `T2` — The read behind it and the week history fold (AC-4, AC-6)
  Files: modules/time/server/requests-read.ts, modules/time/ui/RequestHistory.tsx, modules/time/ui/MyPage.tsx, modules/time/ui/SheetPage.tsx
- [x] `T3` — Tests and the live check (AC-9)
  Files: modules/time/tests/requests-page.test.ts, modules/time/tests/e2e/time.spec.ts
  Depends: T1, T2

## Verify

**Verdict:** PASS
- AC-1: pass — `/time/requests` (`RequestsPage.tsx`), with the Mine and To review lenses showing their open counts.
  - Live: Maya, with no requests of her own and nothing open, lands on To review. Nimal lands on Mine.
  - During the build, the default changed from Mine to "To review when something waits, else Mine if you have any, else To review", so a reviewer with no requests of their own never lands on an empty Mine.
- AC-2: pass — Needs attention, then Decided, reusing `ReviewRequest`/`MyRequest`.
  - Open requests sort by `reviewOrder`; decided ones are newest first.
  - Bugs found live and fixed: decided requests showed "New request" / "{name} answered" to reviewers (`reviewStateOf` now gives Applied, Week reopened, Declined or Withdrawn), and a withdrawn request read "Change applied" to its owner.
  - "Waiting for X to answer" now shows only on needs_info.
  - Decided rows read "Maya decided 25 min ago" instead of "asked …".
- AC-3: pass — `RequestFilters.tsx` (status, week) in the URL. With no match, an empty state offers "Clear the filters". Tests cover status and week.
- AC-4: pass — `requestsPage`/`weekHistory` read through `listRequests`. Test: unscoped, Sahan sees both requests; scoped to the other entity, he sees none.
- AC-5: pass — row pins as before, plus a pin for the list.
  - A Requests tab sits beside Team | My timesheet on all three pages (`Views` in `parts.tsx`).
  - Team time's change requests card links to "See all requests".
- AC-6: pass — `RequestHistory.tsx`, folded "History · n decided requests on this week".
  - On My timesheet it sits under the requests already shown and leaves those out. On a member's timesheet it sits after the hours.
  - Live: Maya on Nimal's W42 sees "2 decided requests on this week", Applied and Declined. Tests: decided only; the owner's own, or the reviewed person's.
- AC-7: pass — the "requests" route is titled "Requests". Suggestions: "Review change requests" when something waits, and "What happened to my requests?".
- AC-8: pass — tabs are links with `aria-current`, filters are labelled and folds are native `<details>`. Axe is clean in light, dark and phone, with no sideways scroll at 390 px.
- AC-9: pass — `tests/requests-page.test.ts` (chips ×5, lenses, filters, scope, history); e2e "077 the Requests tab …".
  - Time 157/157; `pnpm lint` ok; build ok.
  - Time e2e: 10/10 on the second run. The first run's one failure was the known flaky 070 session test, which fails while a dev server is running.
- Screenshots: rq-maya.png, rq-nimal-dark.png, rq-phone.png, rq-history.png, rq2-maya.png and rq2-history.png in the session scratchpad (`ui/`).

Amendment 1 (2026-10-25; product owner: "why Kasun's week 42 My timesheet has the change applied request card? … yes build it"):
My timesheet shows request cards only while a request is open. A decided request goes straight into the week's
folded History (and stays on the Requests page) instead of a card for 7 days, which duplicated both. The owner still
hears the outcome in their bell. `shownToOwner` returns open requests only; 073's 7-day rule is retired.

Amendment 2 (2026-10-25; product owner asked whether history belongs on My timesheet or the Requests tab, and chose
the link: "yes build it"):
- The Requests page is the one home for request cards.
- A week page (My timesheet, a member's timesheet) no longer folds its decided requests. It says "n decided requests on this week" and links "See in Requests", filtered to that week: Mine from your own week, To review from someone else's.
- The link sits after the hours on both pages. From a member's timesheet it also filters to that person, using a new **Person** filter on the To review lens (shown when more than one person is listed). Without it, the 2 the link counted opened onto 3 rows.
- Live: Kasun's W42 "1 decided request on this week → See in Requests" opens Mine, Week 42, 1 row. Maya on Nimal's W42 "2 decided requests" opens To review, Nimal Silva, Week 42, 2 rows. Axe is clean.
- Tests: the filter test covers the person filter. Time 157/157; `pnpm lint` ok.
