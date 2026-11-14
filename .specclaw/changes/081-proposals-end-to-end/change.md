# Proposals end to end: hours, owners, a detail page and a lifecycle for hand-made proposals

**Change:** 081-proposals-end-to-end · **Created:** 2026-11-02 · **Review:** change

## Problem

Delivery → Proposals is read-mostly and partly hollow (full audit: [`audit.md`](audit.md)). A proposal's hours are a
stored column that nothing ever updates, because no time entry names a proposal. Proposals made by hand or synced from
a repo get no owner. A single proposal has no page, so every link and search hit goes to the project board. And a
hand-made proposal can't be edited, withdrawn or given tasks. The global list has no Planned filter. The shipped-per-week
pin opens the generic list. Global counts include closed projects and ignore the project filter.

## Mock Delta

What changes on screen, and where to see it: [`081-proposals-end-to-end`](../../mock/index.html#081-proposals-end-to-end)

New proposal detail page (`/delivery/proposals/:key`). The global Proposals page gets a Planned filter, a New proposal
button and linked rows. Board cards and search link to the detail page.

Amended in T8 (asked and agreed, 2026-11-03): 007's Proposals section
([`001-amax-foundation-proposals`](../../mock/index.html#001-amax-foundation-proposals)) now has the heading row with
New proposal, the Planned filter and the search box. The page changed by design, and the delivery visual test compares
it against that section within 2% per region; only its header and the table's filter bar changed.

Amendment 1 (2026-11-04), in 081's section: a board card with its actions and its meter while Proposed (AC-22, AC-23),
the key note on the proposal page (AC-24), time lines in the history (AC-28), and the "Released in <Month>" / "Released,
all time" labels (AC-25). **Agreed 2026-11-04:** the same two labels in 007's Proposals section (its legend item "Released this
month" becomes "Released in October", the fixtures' pinned month, and its filter button "Released" becomes "Released,
all time"), so the delivery visual test still compares like with like.

Amendment 2 (2026-11-04), in 081's section: the "Suggested by amax" card, chat's suggestions for a pinned proposal,
and the board card's "✦ amax suggests" chip (AC-30, AC-35).

## Acceptance Criteria

### Time and hours

1. **AC-1** `time.entry` gets a nullable `proposal_id` (migration, index, no backfill). `log_time` accepts an optional
   `proposalKey`. Time checks it through a Delivery contract (`getProposalRef`): it must exist, belong to the entry's
   project and not be withdrawn. Anything else is refused with a clear error.
2. **AC-2** A commit-time suggestion keeps its `proposalKey`, and accepting it logs the entry with that proposal's id.
3. **AC-3** `correct_time_entry` keeps the entry's proposal on the same project, clears it when the project changes,
   and accepts an explicit `proposalKey`. A deleted entry never counts.
4. **AC-4** A proposal's hours are its approved time: totals only, from approved weeks only, no deleted entries.
   Amended during T1 (build): Delivery can't import Time, because Time depends on Delivery and the graph check
   (R5) refuses cycles. So the direction is inverted, the way presales uses `createProject`. Time recomputes the
   totals for whole projects whenever a week is approved or reopened, or an approved week's entry changes. It hands
   them to Delivery's contract `setProposalHours`, which is the only writer of `delivery.proposal.hours` (widened to
   numeric(10,2)). Delivery never reads Time tables. List, board, detail, CSV and `get_proposal` all show that one
   number. Fixtures no longer invent hours: they start at 0, and Time's week-42 fixture entries name their
   proposals, so approving a demo week shows its hours.

### Owners

5. **AC-5** `delivery.proposal` gets `owner_user_id` (FK `auth.user`). `create_proposal` defaults the owner to the
   person acting (the onBehalfOf user for an agent) and takes an optional `ownerUserId`, who must be an active person in
   the tenant. `owner_name` is kept in step. A spec proposal synced or pushed gets the person it was synced for as owner
   when created, and a later sync never overwrites an owner. An existing proposal with no owner shows "Unassigned" and
   can be given one with `update_proposal`. Retention covers `owner_user_id`.

### Detail page and navigation

6. **AC-6** `/delivery/proposals/:key` shows the title and key; project (linked); phase; owner; estimate vs approved
   hours; task progress and the task list; release and the furthest environment reached; source (repo, PR, change
   folder) for spec proposals; created and updated; phase history and audit events for the proposal (from the audit
   log, delivery:read); and lifecycle actions as Ask amax buttons, shown only when the viewer may run them. Unknown key,
   or a viewer without delivery:read, gets the usual not-found or sign-in state. Every block has a pin.
7. **AC-7** Rows in the global and project lists, board cards, `search` hits and `get_proposal` results link to the
   detail page (`proposalHref(key)` in contracts). A refresh of the detail page works.
8. **AC-8** `get_proposal` reads one row by id or key (not the whole list) and returns tasks, owner, hours and the
   release with its environments. It still returns withdrawn proposals, marked `withdrawn`.

### Lifecycle for hand-made proposals

9. **AC-9** `update_proposal` (`delivery:proposal:create`, scoped to the project) changes title, description,
   estimate and owner of a hand-made, unreleased, not-withdrawn proposal. It's audited with before/after. A spec proposal
   is refused ("edit it in the repo"); there is one exception, the owner, which can be set on any proposal.
10. **AC-10** `withdraw_proposal` (`delivery:proposal:move`, destructive, needs a reason) marks a hand-made, unreleased
    proposal withdrawn (`withdrawn_at`, `withdrawn_by`, reason). No row is deleted. It takes the proposal out of its
    release if it's in one. It's audited and emits `proposal.withdrawn`. Withdrawn proposals leave every list, count,
    board lane and release picker, and stay readable by key. A spec proposal is refused: the repo withdraws it.
11. **AC-11** `add_proposal_task` (`delivery:task:done`, scoped) adds the next `T<n>` task to a hand-made, unreleased,
    not-withdrawn proposal and recounts tasks. It's audited. `mark_task_done` keeps working on it.
12. **AC-12** `delivery:proposal:create` is enforced on the server for every new write, with the same grants as today
    (Engineer @assigned, PM). Chat shows a confirm card for each write before it runs (`service:` set), and
    `mcp-registry.test` lists the new tools.

### Creation and chat

13. **AC-13** The global Proposals page has a New proposal button. On a project page the button and chat start with the
    project already known (pinned project, prompt "New proposal in &lt;Project&gt;"), so chat doesn't ask for it again.
    Delivery registers `chatSuggestions` for its pages, the way Time does.
14. **AC-14** The `create_proposal` confirm card shows project, title, description, estimate and owner as they will be
    written.

### Lists, metrics, pins

15. **AC-15** The phase filter is All, Proposed, Planned, Building, Verified, Released, on the global and project lists.
16. **AC-16** Global counts, list, shipped-per-week and Released this month exclude closed projects and withdrawn
    proposals, follow the project filter, and agree with each other. The list sorts by most recently updated, has a
    title/key search box (`?q=`), and pages 20 to a page. CSV exports the filtered rows, all pages.
    Amended after T8 (asked and agreed, 2026-11-03): emptying the search box goes back to the list without `q`, and the
    box completes what you type in place from the filtered proposals (a key first, then a title), the guessed part
    selected: Tab or → keeps it, typing on or Backspace drops it, Enter searches. No dropdown.
    The project filter in use shows as a chip beside Filter; its ✕ goes back to all projects, keeping phase and search.
17. **AC-17** A read tool `get_proposal_metrics` (phase counts, released this month, shipped per week, optional
    project) backs both metric cards and their pins. The shipped-per-week pin opens that metric, not the list.

### Lifecycle consistency and notifications

18. **AC-18** The existing rules keep working, with tests: Released comes only from a Prod deployment; a void restores
    the prior phase; a sync or push never moves Released back; a withdrawn proposal can't be moved, released or synced
    back into the active lists by hand.
19. **AC-19** Notifications: the proposal owner is told when someone else moves their proposal to a new phase or
    releases it, and when a task on it is done by someone else (`to: owner`, category `delivery`). There's no
    notification when the owner acted themselves.
20. **AC-20** D1 decided 2026-11-02: no approval gate. Moving to Planned keeps today's permission (`delivery:proposal:move`); the owner is notified (AC-19).

### Verification

21. **AC-21** `pnpm lint` (graph check included), `pnpm test` for delivery, time and core, `pnpm build`, and
    `e2e:auth` delivery specs pass; a new e2e opens a proposal from the list, board and search.

## Decisions

- **D1 PM approval to Planned (AC-20), decided: keep as is.** PRODUCT.md says PMs "approve proposals", but today an Engineer on the project
  can move one to Planned. Options: (a) keep as is; (b) Planned needs `delivery:proposal:approve` (PM @managed).
- **D2 Who sees proposal hours (AC-4), decided: everyone with delivery:read.** totals of approved time, no per-person rows, shown to anyone with
  delivery:read, the same audience as today's (stale) column. The alternative is Time's week scope, where each viewer
  sees a different total.
- **D3 Closed projects (AC-16):** excluded from global counts and lists, the way `listProjects` already does it. A
  closed project's own page still shows its proposals.

## Amendment 1 (2026-11-04): close the gaps against the Proposals BRD

The product owner's BRD (Proposals Module, Nov 3, 2026) was checked against 081 at `2424743b`. It found seven gaps: FR-14,
FR-13, FR-18, FR-03, FR-10a, FR-21 and NFR-3. This amendment closes them inside 081 (no 074/075 changes), with no
database migration and no new module edge. Every earlier AC, decision and business rule (BR-1 to BR-6) stands.

### Board, list and page

22. **AC-22 (FR-14)** A board card for a hand-made, unreleased, not-withdrawn proposal offers Edit, Add a task and
    Withdraw next to Move. Each is an Ask amax button: it pins the proposal and fills a prompt, and chat writes only
    after the person confirms the card. Each button shows only when the viewer holds its tool's permission on the card's
    project: `delivery:proposal:create` for Edit, `delivery:task:done` for Add a task, `delivery:proposal:move` for
    Withdraw and Move. A spec proposal's card shows none of them (BR-3). The board and the proposal page draw these
    actions from one component, so the two can't differ.
23. **AC-23 (FR-13)** A proposal that has tasks shows its task meter (done of total), Proposed included: in every phase
    on the global and project lists (as Released rows already did), and on the board card in every phase but Released,
    whose card shows its release chip. With no tasks, the list shows "–" and the card shows no bar. (Amended in T9:
    the lists keep the meter on Released rows, as the mock and the visual test have it.)
24. **AC-24 (FR-10a)** ~~The page of a hand-made proposal says what can happen to its key.~~ **Revised 2026-11-04 (Amendment 4,
    the client): the page no longer shows this note.** The rekey itself is unchanged, and the history records it ("Renamed to …").
    The original text: For example: "Made by hand.
    If this project starts syncing specclaw changes and one of them is numbered CON-019, this proposal moves to the
    hand-made series (for example CON-H001). Its tasks, time, release and history move with it; links by the old key
    stop working." A proposal already in the `-H` series says it is in the hand-made series and keeps its key. Spec
    proposals show no note.
25. **AC-25 (FR-21)** The time period is visible in both places, and neither one's meaning changes. The phase bar's
    legend reads "Released in <Month>" (e.g. "Released in November"), counting proposals released since the 1st, as
    before. The Released filter tab reads "Released, all time" and still lists every released proposal. The
    `get_proposal_metrics` field keeps its name (`releasedThisMonth`) and its description says "this calendar month
    (UTC)".

### Time and notifications

26. **AC-26 (FR-03)** Time's "Log time" chat flow asks "Which proposal is it for?" as an optional field, saying a
    proposal on the chosen project or "none". A `proposalKey` the person already gave is used, not asked again. The
    confirm card shows the proposal (key and title) when there is one. The saved entry carries that proposal's id. A log
    without a proposal works exactly as before, and an unknown, other-project or withdrawn proposal is refused before
    any card appears (AC-1's rule).
27. **AC-27 (FR-18)** A new notification rule tells the project's PMs (people holding `delivery:release:create` on
    that project, the managed scope) when a proposal reaches Verified: "<key> is verified and ready for a release" (the
    key names the project, so the payload needs no new field; amended in T11), linking the
    proposal page. It fires on Verified from a board move or a sync, never for the PM's own action, and never twice to
    one person for one event. The platform keeps one notification per person per event, so a PM who is also the owner
    gets one (that is a test). The owner rules from AC-19 are unchanged.
28. **AC-28 (NFR-3)** The proposal's history shows time logged against it, from Time's existing audit rows (no new
    audit write): "<person> logged 2 h for Oct 19", "corrected to 2.5 h", "removed 2 h".
    - **Join on the id, not the key.** From this amendment on, Time writes the entry's `proposalId`, owner (`userId`),
      `day` and `hours` into every audit row's `after`: log, correct (plus `previousProposalId`), delete, and a change
      request an approver applies (audited as `time.change_request`). The history joins on that id, so a rekey doesn't
      lose the lines. (Amended in T12: all in `after`, so an applied request carries them too.)
    - **Who sees the lines (Q8, decided 2026-11-04).** Time lines are per person, so a viewer sees one only when it is their own entry, or when
      they hold `time:approve` on the proposal's project. Everyone else sees the proposal's approved total only (D2),
      with no per-entry lines.
    - **Older entries.** Entries logged before this amendment carry no `proposalId` in their audit row and get no
      history line; their approved hours still count (AC-4).

### Verification

29. **AC-29** The tests below pass. `pnpm lint`, `check-module-standard`, `pnpm build` and the Linux CI replica
    (unit tests and `e2e` / `e2e:auth`) pass. The delivery visual test passes against the mock after AC-25's label
    change (see Mock Delta).

| AC | Tests |
|---|---|
| AC-22 | Board card renders Edit, Add a task, Withdraw for Maya (PM) on a hand-made card. An Engineer not assigned sees none, a Leadership viewer sees none, a spec card shows none. The e2e clicks Add a task on a card, sees the pinned prompt, and nothing is written until confirm. |
| AC-23 | List and card show a meter for a Proposed proposal after `add_proposal_task`, "–" with no tasks, and the chip on a released card. |
| AC-24 | Page text for a hand-made key, an `-H` key, and a spec proposal (none). |
| AC-25 | Legend reads "Released in November" with the clock pinned to Oct/Nov fixtures. The filter reads "Released, all time" and lists every released proposal. The counts match `phaseCounts`. |
| AC-26 | The intent declares `proposalKey`. The log card shows the proposal line. `propose` refuses another project's proposal. A chat turn (fake provider) with "log 2 h on CON-014" yields a card with the proposal and an entry with its id. A log without one is unchanged. |
| AC-27 | A Verified move by an Engineer notifies the CON PM and not an unrelated PM. A move by the PM themselves notifies no PM. A PM who owns the proposal gets exactly one notification. A Planned move notifies no PM. |
| AC-28 | Log, correct and delete against CON-014 appear in its history for the owner and for an approver, and not for Leadership or another engineer. The proposal is rekeyed (a spec sync takes its key) and the lines remain under the new key. Approved hours are unchanged. |
| Regressions | The existing 081 suites (AC-1 to AC-21), BR-1/BR-2 (`proposal-regression`), owner rules (`proposal-owner`), and approved-hours (`proposal-hours`) stay green. |

**Affected:**
- **Delivery:** `ui/ProjectPage.tsx`, `ui/ProposalActions.tsx`, `ui/ProposalsPage.tsx`, `ui/ProposalPage.tsx`, `server/proposal-detail.ts`, `server/queries.ts`, `mcp.ts` (description), `module.ts` (rule), tests.
- **Time:** `chat.ts` (intent field), `server/log.ts`, `server/correct.ts` (audit carries `proposalId`), tests.
- **Notifications:** one test.
- **Mock:** 081 section; 007's Proposals legend and filter label (agreed 2026-11-04).

No migrations, permissions, tools or contracts are added; one notification rule is added.

**Risks:**
- **Per-person time lines (AC-28).** The access rule above is a decision for the product owner (Q8 below).
- **Reading another module's audit rows.** Reading Time's audit rows from `core.audit_event` is a read of the platform audit log, not of Time's tables. Delivery already reads its own rows there.
- **Mock change.** The label change touches 007's mock section again.

### Still open (not resolved by this amendment)

| # | Question | Owner |
|---|---|---|
| Q2 | Sign-off for the permission reuse: Edit `delivery:proposal:create`, Withdraw `delivery:proposal:move`, Add task `delivery:task:done` | Product owner |
| Q3 | Backfill missing owners on existing proposals, and from what source (today they show "Unassigned") | Product owner |
| Q5 | Can a withdrawn proposal be reinstated (no tool today) | Product owner |
| FR-05 | Accept the inverted contract: Time pushes approved totals to Delivery's `setProposalHours` (R5 forbids Delivery → Time) | Product owner, architect |
| FR-07 | Accept the owner rule: a sync fills a missing owner and never replaces one; a bare CI credential sets none | Product owner |
| Q7 | Check closed-project counts on real data; 081 is tested on fixtures only | Dev, with production access |
| Q8 (new) | AC-28's rule: who sees per-person time lines. **Decided 2026-11-04: the entry's owner and holders of `time:approve` on the project** | Product owner (answered) |

## Amendment 2 (2026-11-04): agent-first proposals: pin suggestions and agent suggestions

The client asked for Proposals to be agent-first, like Time: the agent says what to do next, and a person confirms.
Time does it in three layers. Delivery had only the first (page suggestions, AC-13). This amendment adds the other
two, using the platform as Time and Allocations do: core's `pinSuggestions` slot, and `@amax/agents` suggestion kinds.
There is no new table, migration, permission or tool. AC-1 to AC-29, D1 to D3 and BR-1 to BR-6 stand. In particular,
an agent never writes without a person's confirm or accept (BR-5).

### Pin suggestions (pin a proposal, chat says what fits)

30. **AC-30** Pinning a proposal (its +, a row, a card or an Ask amax button) makes chat offer what fits its state. Up
    to two suggestions, only for tools the viewer may run on its project, each filling the box with a prompt the person
    sends and then confirms:
    - **A hand-made, open proposal:**
      - Proposed: "Move <key> to Planned". Planned: "Move <key> to Building". Building with every task done: "Move
        <key> to Verified" (`move_proposal`).
      - No tasks: "Add a task to <key>" (`add_proposal_task`).
      - No owner: "Make me the owner of <key>" (`update_proposal`).
    - **A spec proposal with no owner:** only "Make me the owner of <key>" (BR-3).
    - **Released or withdrawn:** nothing.

    The prompts are the exact strings chat's tools already parse (e.g. "Move CON-017 to planned"), so the confirm card
    names the same proposal.

    **Revised 2026-11-04 (Amendment 4).** The client found that Building and Verified cards offered nothing to move them on:
    - **Building** always offers "Move <key> to Verified". While tasks are open the label says how many, for example
      "Move CON-014 to Verified (2 tasks open)". The person decides; the agent's Ready to verify still nudges once all
      tasks are done (AC-32). While a task is open, "Mark T<n> of <key> done" comes **first** and the move second
      (revised 2026-11-05, after the move was picked by mistake in the client's demo).
    - **Verified, in no release:** "Put <key> in <KEY> <version>" comes **first** (revised 2026-11-05, after the role run
      showed it last of three, where "Make me the owner" could push it out).
    - **Verified, in a release not yet live:** Released isn't a board move (it comes from a Prod deployment), so the pin
      offers that release's next deployment first, for example "Record a deployment of CON v2.4.0 to UAT"
      (`record_deployment`, with its own permission).
    - **Demo data:** the open tasks that a hand-made proposal's counters claim now have rows, so "Mark T<n> of <key> done"
      is offered for them (CON-014: T5).
    - The pin now offers up to three suggestions (Amendment 3's limit).
31. **AC-31** A pin suggestion is checked when chat opens, against the proposal as it is now (not as it was when the
    page rendered). A proposal that moved, or a permission that changed, offers what fits now. A pin that no longer
    resolves offers nothing; it doesn't fail.

### Agent suggestions (the agent proposes, a person accepts)

32. **AC-32** Kind `delivery.proposal-verify`, "Ready to verify". When a task closes (`delivery.task.done`) and every
    task of a hand-made Building proposal is now done, the Delivery agent suggests "Move <key> to Verified":
    - for the project's PMs, scope `projectId`, permission `delivery:proposal:move`;
    - evidence: the proposal page and the last task.
    - Accepting runs the board move as the accepting person, audited and emitting `proposal.phase_changed`, so the
      owner and PM notifications fire.
    - Undo puts it back to Building, only while it's still Verified and inside the platform's undo window. A Verified
      proposal released since can't be undone.
    - Spec proposals are never suggested (their phase is the repo's, BR-3).
33. **AC-33** Kind `delivery.proposal-owner`, "Suggested owner". When a task closes on a proposal with no owner and a
    person closed it (`user:…`, or an agent or credential acting for a person), the agent suggests "Make <person> the
    owner of <key>":
    - scope `projectId`, permission `delivery:proposal:create`;
    - evidence: the task they closed.
    - Accepting sets the owner (the `update_proposal` rule, valid for spec proposals too); undo clears it again if
      nothing changed it since.
    - This suggests, never assigns: it doesn't settle Q3 (backfilling existing owners).
34. **AC-34** Suggestions don't pile up or go stale:
    - The platform keeps one open suggestion per kind and proposal (the agent can run twice; one stays).
    - "Ready to verify" is withdrawn when the proposal leaves Building. Both kinds are withdrawn when the proposal is
      withdrawn or released. Open suggestions expire after the platform's 7 days.
    - Accepting one that no longer fits is refused with a clear message, and nothing is written: the proposal moved,
      or someone else became the owner. (Amended in T15: an owner set by `update_proposal` raises no event, so a
      "Suggested owner" is refused at accept rather than withdrawn. Tasks never reopen, so there is no reopen
      trigger.)
35. **AC-35** Where people see agent suggestions:
    - **Proposal page:** a "Suggested by amax" card ("An agent suggests, a person decides") with "Ask amax to accept"
      and "Dismiss" buttons (Ask amax, pinned, confirm card), in the style Allocations and Time use.
    - **Board card:** a "✦ amax suggests" chip.
    - **Suggestions inbox:** the platform screen, with accept, query, dismiss and undo.

    Each shows only to viewers who may decide it.

### Verification

36. **AC-36** Tests:
    - Unit tests for each pin-suggestion state and permission (AC-30, AC-31).
    - Each kind's trigger, accept, undo, withdraw and stale-refusal (AC-32 to AC-34).
    - The page card and the board chip by viewer (AC-35).
    - Notifications fire on an accepted Verify, without duplicates.
    - The 081 regressions stay green.
37. **AC-37** End to end in the browser (e2e:auth, CI replica) and by hand:
    - **Pin flow:** pin CON-017, click "Move CON-017 to Planned", confirm, and the board shows it in Planned.
    - **Agent flow:** close the last open task of a hand-made Building proposal, see "Ready to verify" on its page,
      accept in chat, and see Verified, an undo window on the Suggestions screen, and the owner notified.
    - **Prerequisite:** the scripted e2e chat model learns "Accept the suggestion "…" (suggestion id …)" and "Add a
      task to <key>: <title>". These are two rules in `packages/ai/src/scripted-writes.ts`, test-only (never in
      production), and need approval as the one change outside `modules/`.
    - **By hand:** a walk-through of both flows in a locally running app, with screenshots in the PR.

**Affected:**
- **Delivery:** `pin-suggestions.ts` (new), `suggestions.ts` (two kinds, the agent's event handler, withdrawals), `module.ts` (`pinSuggestions`, `suggestions`, `events.handles`), `ui/ProposalPage.tsx`, `ui/ProjectPage.tsx`, `ui/ProposalSuggestions.tsx` (new), tests.
- **Test support:** `packages/ai/src/scripted-writes.ts` (two test-only rules).
- **Browser test:** `apps/web/tests/e2e/delivery.spec.ts`.
- **Mock:** the 081 section.

**Decided 2026-11-04:** approved; nudges "Ready to verify" and "Suggested owner"; the two scripted e2e rules in `packages/ai` are approved.

**Not included (needs the product owner):** a "stale proposal, withdraw it?" nudge. Its undo would reinstate a
withdrawn proposal, which is Q5, still open.

## Amendment 3 (2026-11-04): every Delivery pin suggests its actions

The client asked for every pin in Delivery to offer the actions that fit it, so any Delivery task can be run from a pin:
pin the record, pick the suggestion, confirm the card. Amendment 2 did this for proposals. This amendment does it for
every pinnable Delivery record and view, with the same rules:
- **Fits now:** offers are read when chat asks, from the record as it is now (AC-31).
- **Allowed only:** each offer appears only if the viewer holds its tool's permission on the record's project.
- **Confirmed:** a click fills the box, and the write waits for the confirm card (BR-5).
- **Exact prompts:** each prompt is the text that tool's chat flow already takes.
- **At most three** per pin.

There is no new tool, permission, table or migration.

| Pinned (read tool) | Offers, when they fit | Write tool |
|---|---|---|
| Project (`get_project`) | "New proposal in <Project>"; "Create release <next version> of <KEY>" (next minor after its latest); "Link <KEY>'s repo" when none is linked | create_proposal, create_release, link_project_repo |
| Proposal (`get_proposal`, AC-30 plus) | AC-30's, plus "Mark T<n> of <key> done" (its first open task), and, Verified and in no release, "Put <key> in <KEY> <version>" (the newest release not yet in Prod) | + mark_task_done, set_release_proposals |
| Release (`get_release`, `get_release_history`) | "Record a deployment of <KEY> <version> to <next environment>"; "Change the proposals in <KEY> <version>"; "Tag <KEY> <version> as" | record_deployment, set_release_proposals, tag_release |
| Environment (`get_environment`) | "Make <env> the prod environment of <KEY>" if it isn't; "Rename the <env> environment of <KEY>"; "Remove the <env> environment of <KEY>" if it has no deployments | upsert_environment, remove_environment |
| Deployment (`get_deployment`) | "Void the <env> deployment of <KEY> <version>" while it is live (the reason is typed on) | void_deployment |
| Repo sync (`get_repo_sync`) | "Relink <KEY>'s repo" / "Unlink <KEY>'s repo" when linked; "Link <KEY>'s repo" when not | link_project_repo, unlink_project_repo |
| Proposals views (`list_proposals`, `get_proposal_metrics`) | "New proposal" (in the filtered project when one is named) | create_proposal |
| Releases views (`list_releases`, `list_environments`) | "Create a release" / "Add an environment to <KEY>" for the named project | create_release, upsert_environment |
| Projects view (`list_projects`) | "New project" | create_project |

38. **AC-38** Each row above offers exactly what fits its record's state and the viewer's permissions on its project,
    and nothing else. The views offer only for a project the viewer may write to.
39. **AC-39** Every offer's prompt runs to a confirm card naming the same record, and confirming makes the write. The
    scripted e2e model learns the prompts it doesn't parse yet: create release, mark task done, put in a release, link,
    unlink and relink, rename, new proposal, and new project.
40. **AC-40** Not offered, with the reason recorded:
    - `sync_proposal`, `sync_specclaw`: CI and plugin writes, never chat cards.
    - `set_commit_time_logging`: needs the entity's people told first, an Admin's deliberate act.
    - `withdraw_proposal`: destructive, so no pin offer. Decided 2026-11-04: it gets a clean, dedicated button
      instead. On the proposal page, "Withdraw" becomes an outlined danger button (there is no card fold any more, see below),
      replacing AC-22's quiet underlined link. It still asks for a reason and needs the confirm card.
    - Activity lines and pushes: news, with nothing to act on.
41. **AC-41** Tests:
    - A unit test per row: state, permission, and the exact prompt.
    - The 081 and 054 chat-first suites stay green.
    - End to end in the browser: pin a release, then "Record a deployment … to <next>", confirm, and the release map
      shows it; pin an environment, then "Make … prod" or "Remove", confirm.
    - A hand walk-through of every row on the running app, with screenshots.

**Decided 2026-11-04: no Actions dropdown on board cards.** AC-22's Actions fold, and the Move button the card had
before 081, are removed. A board card keeps its title link, its pin (+) and its "amax suggests" chip, and its actions come
from its pin: pin the card, and chat offers the moves, tasks and owner change that fit it (AC-30, AC-38), each confirmed
on its card. The proposal page keeps its action buttons. This supersedes AC-22 for the board; on the BRD's FR-14 ("Ask
amax actions on the board card"), the board's actions are reached through the card's pin.

**Approved 2026-11-04.** **Affected:** `modules/delivery/pin-suggestions.ts` (split by record), `ui/ProposalActions.tsx`, `ui/ProjectPage.tsx` and `ui/delivery.css` (the Withdraw button, no card fold), `module.ts`,
`packages/ai/src/scripted-writes.ts` (test-only rules, as Amendment 2), tests, `apps/web/tests/e2e/delivery.spec.ts`.

## Amendment 4 (2026-11-04): the board and the proposal page, interactive like Time

The client asked for Delivery to feel as interactive as Time. Time's pages lead with what needs attention:
- **A status band:** a big figure, a segmented bar and a legend whose parts filter.
- **Folded rows:** each opens in place.
- **Live times:** they keep counting.
- **Icons:** status always has an icon as well as a colour.

The Delivery pages are flat cards of equal weight. This amendment brings Time's patterns to the two pages people use
most: the project board and the proposal page. Projects, Proposals and Releases follow in a later change (decided
2026-11-04).

All the rules still hold:
- Read-only controls only; every write is in chat, after the confirm card.
- Every new part is pinnable.
- The new parts are keyboard-complete, work in light and dark themes, and respect reduced motion.

There is no new tool, permission, table or migration. Everything shown is read from data the pages already load, plus
who closed each task (`delivery.task.done_by`: `user:<id>` for a person, anything else for an agent or CI, as the
Overview already counts it).

### Project board (`/delivery/p/<KEY>`)

42. **AC-42** A status band sits between the tabs and the board. It has two parts, and each shows only when it has
    something to show:
    - **Next release:** the release the project names as next, else the newest one not yet live in Prod. It shows the
      version (a link to its page), its proposal count and the project's health ("On track" / "At risk"), then one step
      per environment in order, each with a shape and a word: Deployed, Testing, Rolled back, Not yet. It is pinned to
      the release (`get_release`).
    - **Tasks:** "<done> of <total> done". The bar splits the done tasks into closed by agents and closed by people,
      then the open ones. The legend reads "Agents <n> · People <n> · Open <n>". Closes that weren't recorded per task
      (a synced project's counts) show as "Not recorded <n>". It is pinned to the project.

      **Who counts as what (revised 2026-11-04, the client):** git can't say whether a person or an agent wrote a
      commit, so a task closed by a person's verified commit counts as that person's. **Agents** are only closes an
      agent made through amax's tools ("Claude for Nimal"). **People** are closes in amax and by a verified commit.
      Anything else (a CI credential, another job) is **Automation**, its own part. The Overview's "by agents for them"
      uses the same rule (`server/closed-by.ts`). Reading agent authorship from commit trailers is left for a later change.

    A screen reader reads each part as one sentence, for example "v2.5.0, 2 proposals: Dev deployed, QA testing, UAT not
    yet, Prod not yet".

    **Revised 2026-11-04, at the client's request ("if the bands and the description give the same info, remove the
    description; use what best suits the module, not Time's exact UI"):**
    - The page summary under the title keeps only the sprint's dates and "Released means it reached Prod". The task
      count, the next release and its health are now the band's.
    - A "Proposals in flight" part, first drafted here, is dropped: the lanes already count each phase. The release part
      replaces it, since it's what the board couldn't show.
    - Repo sync no longer repeats "<n> recent pushes were refused"; the row's chip counts them.
43. **AC-43** ~~"Needs you" above the band~~ **Dropped 2026-11-04** (the client: "needs you is not needed as repo sync
    already has those"). It only repeated what the page already shows: refused pushes are Repo sync's rows, and agent
    suggestions are the cards' "amax suggests" chips, decided on the proposal page. AC-44 takes over its one job,
    putting a refused push first.
44. **AC-44** Repo sync folds to one row: "Repo sync · <n> pushes refused · last sync <age>" (or "No repo linked").
    It opens, by click, Enter or Space, to the table it shows today, and keeps its pin. Revised 2026-11-04, with
    AC-43 dropped:
    - **A push was refused, and the viewer may link the repo:** the row leads the board, above the band, open. This
      is the page's attention-first item (rule 6), shown once.
    - **Otherwise:** it stays folded below the board.
45. **AC-45** The board, its lanes and its cards don't change (Amendment 3), so the 001 mock and its visual test
    still hold.

### Proposal page (`/delivery/proposals/<key>`)

46. **AC-46** The header keeps two actions:
    - **"Ask amax"**, with the proposal pinned.
    - **Withdraw**, the outlined danger button, shown to those who may withdraw and only while the proposal can be
      withdrawn.

    Edit, Add a task and Move leave the header. Chat offers them from the proposal's pin: Move and a first task already
    (AC-30), and now **"Edit <key>"** too, for an open hand-made proposal (built 2026-11-04, since Edit had no other
    one-click way in). This supersedes AC-6's header buttons.

    **Facts (2026-11-04, the client: "names and important dates highlighted"):** the line under the title becomes labelled
    facts, each a small label over its value: **Project** (its colour and link), **Owner** (the name, no avatar, or an
    "Unassigned" chip), **Made by hand** or **Synced** (the date, and the spec it came from), and **Updated** (the date and
    a live age); the project's pin sits beside its link, so the header's buttons line up with the cards. History lines set the person's name off the same way. The AC-24 key note is no longer on the page.

    In the same spirit (said once): the facts line under the title drops its phase and Withdrawn chips (the stepper
    says both), and the Release card names its release and shows its environments as the board's track, without the
    "furthest" chip and "In Prod since" line it repeated.
47. **AC-47** A stage stepper sits under the header: Proposed, Planned, Building, Verified, Released. Each step's state
    shows as an icon and a word, never by colour alone:
    - **Done steps:** a tick, and the date the proposal entered that phase (from its history).
    - **Current step:** marked with `aria-current="step"`.
    - **Later steps:** muted.

    A withdrawn proposal shows a crossed-out step at the point it was withdrawn. The stepper pins to the proposal.
48. **AC-48** The agent's open suggestions (AC-35) come right after the stepper, before any other card.
49. **AC-49** The Time card reads as a band:
    - The big figure "<approved> h of <estimate> h estimated".
    - A bar of approved hours against the estimate. Hours over the estimate show as a separate segment, with an over
      icon and "<n> h over".
    - With no estimate, the card reads "<n> h approved · no estimate".
50. **AC-50** History is a timeline, newest first. Each line has an icon for its kind (created, moved, task done, time
    logged or corrected, released, withdrawn), what happened, who did it (person or "agent for person"), and a live age
    ("3 h ago") that keeps counting. The exact time is in the tooltip. AC-28's visibility rule for time lines is
    unchanged.
51. **AC-51** Tasks lists the open tasks first. The done ones fold into one row, "<n> done", that opens in place.
    A proposal with every task done shows "All <n> done" open.
52. **AC-52** The live age is shared: `ago()` and `<Since>` move from `modules/time/ui` to `@amax/ui`. Time imports
    them from there and its pages don't change.
53. **AC-53** Tests:
    - Unit tests: the band figures and their sentences, where Repo sync sits (including permission), the stepper states
      (including withdrawn) and the over-estimate figure.
    - The 081 chat-first suite stays green, with the header's AC-22 test updated to AC-46.
    - In the browser: the band's legend opens the filtered Proposals tab; the repo sync row opens with Enter; the
      stepper marks the current step; Withdraw opens chat with the confirm card; axe finds no violations.
    - A hand walk-through with screenshots, light and dark.

**Approved 2026-11-04.** **Affected:**
- **Delivery UI:** `modules/delivery/ui/ProjectPage.tsx`, `ProposalPage.tsx`, `ProposalActions.tsx` and
  `RepoSyncCard.tsx`, new `ui/BoardBand.tsx` and `ui/Stepper.tsx`, and `ui/delivery.css`.
- **Delivery server:** `modules/delivery/server/queries.ts` (tasks closed by agents and by people, and phase dates).
- **Shared:** `packages/ui` (`ago` and `Since`), and `modules/time/ui` (imports only).
- **Tests:** unit tests and `apps/web/tests/e2e/delivery.spec.ts`.


## Amendment 5 (2026-11-05): one way through Delivery: project, then its proposals and releases

The client asked for a proper flow between a project and its proposals. Today the way back depends on the page:
- **Proposal page:** the trail starts at the cross-project Proposals list, and its project link opens the project's
  Proposals tab, not the board.
- **Release page:** the trail starts at Releases, but its project link opens the board.
- **Proposal and release pages:** they drop the project's tabs, so going back to the board takes two clicks.
- **Lists:** they name projects and releases without linking them.

This amendment gives Delivery one hierarchy, the same from wherever a page is opened (the board, a list, search, chat
or a notification):

```
Projects ─► Project [ Board | Proposals | Releases | Risks and decisions | Team | Contract ]
                ├─► Proposal ──► its release
                └─► Release  ──► its proposals
```

There are no new screens, writes, tools or tables: it is links, breadcrumbs and the existing tab bar.

54. **AC-54** Breadcrumbs follow the project:
    - A proposal's page reads "Projects / <Project> / Proposals / <key>".
    - A release's page reads "Projects / <Project> / Releases / <version>".
    - Each step is a link: the portfolio, the project's board, and the project's tab.

    "Proposal not found" and "Release not found" keep a single step back to their list. This supersedes AC-6's trail.
55. **AC-55** Proposal and release pages show the project's tab bar under their heading, with **Proposals** or
    **Releases** marked as the current tab (`aria-current="page"`), so the board is always one click away.
56. **AC-56** Lists link what they name:
    - **Proposals lists** (the portfolio list and a project's Proposals tab): the project links to its board, and the
      release to its page.
    - **Releases lists:** the project links to its board.

    The links look like the text they replace (no new colour; underlined on hover and focus), so the 001 mock and its
    visual test still hold.
57. **AC-57** The sidebar keeps Projects, Proposals and Releases. The cross-project lists stay portfolio views, and a
    record opened from them still shows its project's trail and tabs (AC-54, AC-55).
58. **AC-58** Tests:
    - **Unit:** the trails and tabs on a proposal and a release page, and the list links.
    - **Browser:** board → a card → the proposal page → **Board** tab, back on the board. Proposals list → a project
      link → its board. A release page's trail → the project's Releases tab. Axe passes.
    - The 001 visual test still passes.

59. **AC-59** **Reopen a task closed by mistake** (added 2026-11-05 at the client's request; approved with "build it").
    - **In chat:** "Reopen T1 of CON-018" runs a new `reopen_task` tool (permission `delivery:task:done`). It shows a
      confirm card, "Reopen T1 of CON-018: <title>", with a **Reopen** button and the receipt "Done: reopened T1 of
      CON-018".
    - **What it changes:** the task is open again, and the counts and meters fall back. The history gets a "<ref>
      <title> reopened" line with who did it, and the audit and activity feed record it.
    - **The agent:** a `delivery.task.reopened` event makes it take back a Ready to verify that no longer fits.
    - **Where it applies:** only to a hand-made proposal that isn't released or withdrawn; a spec proposal's tasks
      follow its repo. Reopening an open task changes nothing. A Verified proposal stays Verified, and its card says so.
    - **From the pin:** a proposal's pin offers "Reopen T<n> of <key>" for the task closed most recently in the last
      day. With three suggestions at most, "Make me the owner" outranks Edit and Reopen.
    - **Tests:** `reopen-task-081`: reopen, counts, history, card, pin offer, the agent, and refusals. Plus the scripted
      chat rule.

60. **AC-60** **An environment's actions come from its pin** (client, 2026-11-05: "build").
    - **The rows:** the Environments card's rows lose their Rename, Move, Make Prod and Remove buttons, and each row
      keeps its pin. This is the same rule as board cards: a record's actions are said once, on its pin.
    - **The pin offers:** Make Prod, or Unmark Prod for the Prod one, then Rename. Third comes Remove while nothing was
      deployed there, else Move (three suggestions at most). Making an unused environment Prod stays one click, as
      056's flow needs.
    - **Adding:** an environment has no row, so the card keeps its one "Ask amax to add an environment". The card's
      own pin offers it too.
    - **Tests:** `pin-offers` AC38 covers the new offers; 056's browser test now uses the row's pin.

61. **AC-61** **A release's next deployment comes from its pin** (client, 2026-11-05: "fix that too").
    - **The Releases table:** rows lose their Promote, Retry and Finish buttons. The last column says what's next as
      text ("Next: UAT", "Retry UAT", "Finish Prod", "Live", "Building").
    - **The row's pin:** it offers "Record a deployment of <release> to <environment>", now also for Prod still
      testing (Finish).
    - **The 001 mock:** its release rows say the same, the one edit to that change's section, so the visual test
      holds.
    - **Not changed:** the release page's own Ask amax buttons and the Overview's "Retry" on its waiting list stay.

**Approved 2026-11-05.** **Affected:** `modules/delivery/ui/ProposalPage.tsx`, `ReleasePage.tsx`, `ProposalsPage.tsx`,
`ReleasesPage.tsx`, `ProjectSections.tsx` (the tabs take a current section), `delivery.css`, tests, and
`apps/web/tests/e2e/delivery.spec.ts`.

## Amendment 6 (2026-11-05): proposal owners: pick from the project team, and tell them

The product owner asked how a proposal is assigned, then had it built. It was first proposed and approved on its own,
as change 083-proposal-owner-assign, and then folded into 081 at their request (2026-11-05). There's no migration, new
table, tool or permission; one event and three notification rules are added.

**The gap:**
- **Owners aren't told.** A PM can set a proposal's owner (AC-5, AC-9), but no write that sets an owner raises an
  event, so the new owner is never told.
- **Chat never asks.** The New proposal flow quietly makes the creator the owner.
- **Anyone can be named.** Any active person in the workspace can be named owner, even someone who isn't on the
  project and can't act on the proposal.

**Mock Delta**, in 081's section: chat and the bell only, no page changes.
- **Chat:** a "Who owns it?" choice card (Me first, then the project's team).
- **Confirm cards:** they say who will be told, and an owner change shows From → To.
- **Refusal:** naming someone off the project is refused in one sentence.
- **Bell:** "You now own …" and "… has a new owner".

### Owner changes raise an event

62. **AC-62** Delivery declares a new event, `delivery.proposal.owner_changed` (`ProposalOwnerChanged`), in its
    contracts. The payload has `proposalId`, `key`, `title`, `projectId`, `from` and `to` (user ids or null), `toName`,
    `cleared` and `by`. The event is raised:
    - by `create_proposal` when the proposal gets an owner;
    - by `update_proposal` when the owner actually changes (the same owner again raises nothing);
    - when a "Suggested owner" is accepted, and when that accept is undone.

    Syncs and pushes raise nothing. They fill a missing owner only with the person they act for, and AC-66 never tells
    anyone about their own action.
63. **AC-63** No migration and no new table. The audit row for each of these writes already records the owner before
    and after; that doesn't change.

### The owner is told

64. **AC-64** A notification rule tells the **new owner**: "You now own <key>: <title>", linking to the proposal page,
    in Delivery's `releases` category like its other proposal rules.
65. **AC-65** The **previous owner** is told "<key> has a new owner: <toName>", or "<key> no longer has an owner" when
    it's cleared (an undo).
66. **AC-66** Nobody is told about their own action. That includes making yourself the owner, creating a proposal you
    own, and an agent acting for you doing either. A person never gets two notifications for one event.

### Only someone on the project can own it

67. **AC-67** On `create_proposal`, `update_proposal` and accepting a "Suggested owner", the named owner must be an
    active person who holds `delivery:task:done` on the proposal's project: a PM who manages it, or an engineer
    assigned to it. It's checked with the platform's `viewerForUser`. There's no Allocations import, since
    Allocations already depends on Delivery.
    - **Anyone else is refused before a card appears:** "<name> isn't on <Project>, so they can't own <key>. Pick
      someone on the project."
    - **Existing owners aren't touched.**
    - **Syncs and pushes keep AC-5's rule.**
68. **AC-68** A "Suggested owner" whose person is no longer on the project is refused at accept, with that message, and
    nothing is written.

### Picking the owner in chat

69. **AC-69** The New proposal chat flow (`delivery.new-proposal`) gets an optional owner step:
    - **The card:** once the project is known, chat offers the owner on a **choice card** (076's `offer_choices`). The
      options are **Me** first, then up to three of the project's team, most-allocated first, read with Allocations'
      `get_project_team`, whose rows now carry `userId`. Then "Something else…".
    - **The input:** each option is the whole `create_proposal` input with that person's `ownerUserId`.
    - **No question needed:** if the person already named an owner or said "me", chat doesn't ask.
    - **No card possible:** with no team the creator can read, the owner is Me, as before.
70. **AC-70** The `create_proposal` confirm card names the owner. When it's someone else, it adds "they'll be told".
71. **AC-71** The `update_proposal` confirm card for an owner change shows **From** and **To**, and who will be told (the
    new and the previous owner, never the person confirming). The receipt reads "<name> now owns <key>".

### Tests

72. **AC-72** Unit tests:
    - **The event:** raised for each write in AC-62, and not raised for a no-op.
    - **The rules:** AC-64 to AC-66, including self-assignment and an agent acting for the person.
    - **The project check:** an engineer assigned to the project and a PM managing it are allowed. An unassigned
      engineer, Leadership, and an inactive person are refused (AC-67). A stale "Suggested owner" is refused (AC-68).
    - **Chat:** the intent's owner step (AC-69), the cards (AC-70, AC-71) and the team's `userId`.
73. **AC-73** End to end (`e2e:auth`, with test-only scripted rules in `packages/ai/src/scripted-writes.ts`):
    - **The flow:** Maya creates a CON proposal owned by Nimal, then hands it to Kasun. Each card says who will be
      told, each write raises `owner_changed`, and someone off the project gets no card.
    - **Not the bell:** the e2e app runs no cron tick, so the bell isn't filled there. AC-64 to AC-66 are proved by
      notifications' `delivery-routing` test.
    - **CI:** `pnpm lint` (graph check), `check-module-standard`, `pnpm build` and the 081 suites stay green.

**Decisions (approved 2026-11-05):**
- **D4** The previous owner is told too (AC-65).
- **D5** Someone not on the project is refused rather than warned (AC-67).
- **D6** "On the project" means holding `delivery:task:done` there (AC-67).

**Affected:**
- **Delivery:** `contracts.ts`, `module.ts`, `chat.ts`, `mcp.ts`, `server/owner.ts`, `server/services.ts`,
  `server/lifecycle.ts`, `server/proposal-kinds.ts`, `server/proposal-card.ts`, `README.md`, tests.
- **Allocations:** `server/team.ts` (`userId` on team rows) and its test.
- **Notifications:** `delivery-routing.test.ts`.
- **Test support:** `packages/ai/src/scripted-writes.ts` (two test-only rules).
- **Browser tests:** `apps/web/tests/e2e/delivery.spec.ts` and `owner-a6.ts`.
- **Mock:** 081's section and its copy.

**Test-only change outside the amendment's code:** Delivery's test database (`tests/proposal-db.ts`) puts Nimal on CON
and FLT, as Allocations' fixtures have him. Without that, AC-67 would refuse him as an owner in 081's earlier tests.

## Amendment 7 (2026-11-05): every notification scenario covered

The product owner asked whether every notification scenario on this branch was covered, and approved three fixes on
this branch ("all 3 on this branch"). A review of Delivery's rules found three problems:
- **Withdrawing tells nobody.** A withdrawal by someone else tells the owner nothing, though their proposal leaves
  every list.
- **The rollback rule has no test.** `delivery.release-rolled-back` (030/042) is untested anywhere.
- **No test runs a real write.** The routing tests insert hand-made events, so no test takes a write through to a
  notification. Released and a void's way back are never checked.

There's no migration, tool or permission. One payload field and one rule are added.

74. **AC-74** A withdrawal by someone else tells the owner.
    - **The payload:** `ProposalWithdrawn` gains `ownerUserId` (null for none) and `title`.
    - **The rule:** `delivery.proposal-withdrawn` tells the owner "<key> was withdrawn: <reason>", linking to the
      proposal page, which stays readable.
    - **Never for your own action** (AC-66's rule), an agent's for you included.
75. **AC-75** The rollback rule is tested as it stands:
    - **Told:** a release rolled back in an environment reaches the PMs who manage that project, and Admins, who
      record deployments everywhere, with "Release <version> rolled back in <environment>" (Admins found while testing).
    - **Not told:** other projects' PMs.
    - **Nothing:** a deployed or testing status notifies no one.
76. **AC-76** One test runs real writes, through the MCP tools as Maya, all the way to the bell. Nimal is the owner:
    1. **Creating** a CON proposal owned by Nimal tells him "You now own …".
    2. **Moving** it to Planned, Building and Verified tells him each move. Maya, the PM who moved it, gets no "verified".
    3. **Closing** its task tells him "Task T1 … is done".
    4. **A Prod deployment** of a release holding it tells him "… moved from verified to released".
    5. **Voiding** that deployment tells him "… moved from released to verified".
    6. **Withdrawing** a second proposal he owns tells him "… was withdrawn: …".
77. **AC-77** Mock: the Amendment 6 bell in 081's section gains the withdrawn line.

**Not changed, recorded (for the product owner, if wanted later):**
- **Reopening a task** tells nobody.
- **New agent suggestions** notify no one. That's platform-wide: Suggestions has no rule in any module.
- **Edits, renames by a sync, and time logged** tell nobody.
- **The rollback rule has no `except`,** so a PM who records a rollback is told too. Its payload has no `by`, and a
  rollback usually comes from CI.

**Approved 2026-11-05.**

**Affected:**
- **Delivery:** `contracts.ts` (the payload), `module.ts` (the payload declaration and the rule),
  `server/lifecycle.ts` (the withdraw event), `README.md`.
- **Notifications:** `delivery-routing.test.ts` (AC-74, AC-75) and a new `delivery-flow.test.ts` (AC-76).
- **Mock:** 081's section and its copy.

## Amendment 8 (2026-11-05): the owner choice offers who can own it now, with their spare capacity

The product owner asked that a new proposal's owner be picked from the project's available team, and approved two
refinements to AC-69 ("build it").

**The mismatch:** the "Who owns it?" card read `get_project_team`, which lists anyone allocated in this month or the next
two. AC-67 accepts only people on the project this month, so the card could offer someone it would then refuse.

**What "available" means here:** spare capacity this month is shown on each option, not used to hide people. Someone
100% on this very project has 0% free, but is often the best owner. Hiding them would drop the likeliest pick, so
the PM sees the figure and decides (recorded in build, 2026-11-05).

There's no migration, tool, permission or new card.

78. **AC-78** The choice card offers only teammates allocated to the project **this month**, the people AC-67 accepts.
    Someone allocated only from a later month isn't offered.
79. **AC-79** Each option shows the person's spare capacity this month:
    - **The label:** "<name> · <role> · <n>% free this month", "· fully allocated" at 0, or "· over-allocated by
      <n>%" past it.
    - **The figure:** their capacity (FTE, from HR) minus all their allocations that month, as the allocations grid
      counts it.
    - **The order is unchanged:** the most allocated to this project first.
80. **AC-80** `get_project_team` rows carry `freeThisMonth` (null when the reader can't see the person's employment),
    next to AC-69's `userId`.
81. **AC-81** Tests:
    - **Allocations' `team` test:** `freeThisMonth` equals capacity minus this month's total, for each person.
    - **The intent test:** the owner step offers only people allocated this month, and shows the capacity label.
    - The 081 suites stay green.

82. **AC-82** The owner is asked about every time a proposal is made in chat without one, whether it was started from
    the New proposal button or typed. Found by the product owner's run (2026-11-05): real Claude skipped the optional
    step and showed "Owner: You".
    - **`create_proposal`'s own description** carries the rule, so chat sees it without the button's flow.
    - **The button's owner step** says to settle the owner even though it defaults.
    - **Skipped** only when the person named an owner or said "me", or the team can't be read.

**Affected:**
- **Allocations:** `server/team.ts` and its test.
- **Delivery:** `chat.ts` (the owner step's instructions), `mcp.ts` (`create_proposal`'s description) and
  `tests/owner-chat-a6.test.ts`.
- **Mock:** 081's choice card labels, and its copy.

## Amendment 9 (2026-11-05): my proposals: what I own, and logging time against it

The product owner found two gaps and approved the fix ("ok build it"):
- **Logging time doesn't ask which proposal.** AC-26's question was optional, in the Log time flow's first turn only,
  so real Claude skipped it, and a typed "log 2 h on CON" never saw it.
- **Nowhere says what you own.** An engineer finds out piecemeal: a notification, the Owner column, initials on a
  card.

This amendment uses 084's quick replies. There's no migration, table, tool or permission.

### Logging time against a proposal

83. **AC-83** Chat asks which proposal every time time is logged without one, whether started from Log time or typed.
    `log_time`'s own description and the flow both say so.
    - **It doesn't ask** when the person named a proposal or said "none", a proposal is pinned or its page is open (that
      one is used), the project has no open proposals, or the entry comes from a commit.
84. **AC-84** The question is "Which proposal is it for?" with quick replies.
    - **The answers:** up to five open proposals of that project from `list_proposals` with `likelyForMe`, then
      **None**.
    - **Each answer:** "<proposal key> · <title>", at most 60 characters, for example "CON-014 · Invoice export to PDF".
      Only the title is shortened. The why orders the answers and isn't shown (product owner, 2026-11-05; first built
      with "(yours · Building)" after the title). The end-to-end run (2026-11-05) showed "<KEY>" read as the
      project key ("CON · …"), so the rule now names the full proposal key with an example.
    - **No shortcut** (revised 2026-11-05, the product owner's run). As first built, when exactly one was the person's
      own and Building, chat put it straight on the card. Kasun's "Log 2 hrs on contoso project" went to CON-011
      without a question. Chat now always asks, and the likeliest proposal is the first answer.
85. **AC-85** `list_proposals` takes two new options:
    - **`mine`:** the viewer's own proposals.
    - **`likelyForMe`,** with a project key: its open proposals (not released or withdrawn), most likely first. The
      order is yours and Building, then yours, then ones you closed a task on in the last 14 days, then Building,
      Verified, Planned and Proposed. Each row says `why`: "yours · Building", "you closed T3 on Nov 4", or its phase.
86. **AC-86** A proposal's pin offers **"Log time on <key>"** to anyone who may log their own time, while the proposal
    is open. It fills "Log time on <key> (<Project>): " for the person to finish, and comes second for a Planned or
    Building proposal.

### What I own

87. **AC-87** The Proposals list (the portfolio list and a project's Proposals tab) has a **Mine** filter (`?owner=me`).
    - **It keeps** the phase, project and search filters, and they keep it.
    - **The portfolio's counts and chart follow it,** as they follow the project filter (AC-16).
    - **It's a read-only link** in the Filter menu, **second, right below All projects** (product owner, 2026-11-05).
      A "Mine" chip clears it, so the filter bar is unchanged until it's on.
88. **AC-88** Chat on the Proposals pages suggests **"What proposals do I own?"**, answered with `list_proposals`
    using `mine`.
89. **AC-89** The Overview shows **"Your proposals"** to anyone who owns an open proposal: up to five, what needs them
    first.
    - **The order:** ready to verify (Building, every task done), over its estimate, then open tasks.
    - **Each row** is pinnable.
    - **It links** to the list with Mine on.
90. **AC-90** A board card the viewer owns shows a **Yours** marker beside the owner's initials, or beside the agent
    that made it (an agent-made card shows the agent, not initials; found in the end-to-end demo, 2026-11-05). Nothing else on the
    board changes, so 001's board comparison (Maya owns no demo proposal) still holds.

### Tests

91. **AC-91** Tests:
    - **Units:** `likelyForMe`'s order and `why`, `mine`, the Mine filter keeping the other filters and the counts
      following it, the pin offer and where it sits, the Overview panel and its order, the board marker, and Time's
      instructions (AC-83, AC-84).
    - **Browser:** Mine on the Proposals list, the Overview panel as Nimal, axe.
    - The 081 and 084 suites stay green.

**Affected:**
- **Delivery:** `server/queries.ts`, `mcp.ts`, `server/overview.ts`, `server/pin-offers.ts`, `chat-suggestions.ts`,
  `ui/ProposalsPage.tsx`, `ui/ProjectLists.tsx`, `ui/ProjectPage.tsx`, `ui/delivery.css`, `README.md`, tests.
- **Time:** `chat.ts`, `mcp.ts`, tests.
- **Mock:** 081's section, and its copy.
- **Browser tests:** `apps/web/tests/e2e/delivery.spec.ts`.

## Amendment 10 (2026-11-07): the release page's Tag and proposals card, aligned

The product owner found the release page's "Tag and proposals" card (`/delivery/releases/CON/v2.5.0`) looked broken
and asked for it aligned, without the scroll bar. Three causes:
- **The list scrolls inside the card:** it was capped at 280 px with its own scroll bar, which also clipped the row pins.
- **Rows run together:** key, title, phase chip and pin sat inline, so long titles wrapped under the key, and each
  row's pin (absolutely placed, top right) covered the phase chip.
- **The tag isn't shown:** the card is called "Tag and proposals", but the tag (the version) appeared only in the title.

92. **AC-92** The card shows the tag first ("Tag", then the version as a chip, then the count of proposals).
93. **AC-93** The proposals list has no height cap and no scroll bar of its own; the page scrolls.
94. **AC-94** Each proposal is one aligned row: the key in a fixed column, the title (wrapping within its column), the
    phase chip on the right, and room saved for the row's pin so it never covers the chip. Rows are divided by a hairline.
    On a phone the chip drops under the title. The link, its target and the pins are unchanged.

There's no data, tool or permission change. **Affected:** `modules/delivery/ui/ReleasePage.tsx`,
`modules/delivery/ui/delivery.css`. The mock has no release detail screen, so it's unchanged.

## Amendment 11 (2026-11-07): the proposal screens, attention first and aligned

A UI review of the proposal screens found the gaps below, and the product owner asked for all of them fixed in one
amendment ("fix everything in 081 single amendment").

### What needs attention leads

95. **AC-95** An open proposal (not Released, not withdrawn) **needs attention** for any of four reasons, in this order:
    **amax suggests** (an open Delivery suggestion the viewer may decide), **Ready to verify** (Building, with every
    task done), **Over the estimate** (approved hours past it) and **Unassigned** (no owner).
96. **AC-96** The Proposals list (the portfolio list, before its charts, and a project's Proposals tab, above the table)
    opens with an **attention strip**: one tile per reason with a count, for the proposals the other filters show.
    - **A tile** is a read-only link that filters the table to that reason (`?need=suggested|ready|over|unassigned`).
      The other filters keep it and it keeps them; a chip names it and clears it.
    - **Each tile is pinnable.** Its pin resolves through `list_proposals`, which takes a new `need` option.
    - **A reason with none** is left out. When nothing needs attention, the strip says so in one quiet line.
97. **AC-97** The table puts proposals that need attention first, in AC-95's order, then the rest as before (newest
    change first). Each Proposal cell shows the reason's chip ("amax suggests", "Ready to verify", "Over the estimate",
    "Unassigned") and a **Yours** chip on the viewer's own proposals, as the board card does (AC-90).
98. **AC-98** A withdrawn proposal's page shows a **Withdrawn** band straight under its title, before the tabs, as a
    warning; it no longer sits after the stepper and suggestions.

### Every record pinnable

99. **AC-99** Each task on the proposal page, open or done, has its own pin. It resolves through a new read tool,
    **`get_proposal_task`** (by `taskId`; a proposal key only narrows), to that task. The pin offers **"Mark <T> of
    <key> done"** while it's open, and **"Reopen <T> of <key>"** for a day after it was closed (AC-59's window), to
    whoever may close tasks on that project.

### Aligned, and no empty tables

100. **AC-100** The key sits in a fixed column, with the title wrapping beside it, in the table's Proposal cell and in
     the proposal page's task rows, as on the release page (AC-94).
101. **AC-101** A table that matches nothing shows one row inside it ("No proposals match …", "No proposals need this",
     "No proposals yet"), as the deployment history does.
102. **AC-102** The table's head is two rows: the phase tabs on the first, the filter, its chips, search and Export on
     the second, right-aligned. A project tab's title stays at the start of the first row.
103. **AC-103** A description written in Markdown reads as text: paragraphs, `-` or `*` lists, `#` headings,
     `**bold**` and `` `code` `` (rendered as React elements, never as HTML). The page's inline styles move into
     `delivery.css` classes.

### Tests

104. **AC-104** Unit tests: the four reasons and their order, the tile counts following the filters, `need` on
     `list_proposals`, the table order and chips, the empty row, `get_proposal_task` and its offers, the Withdrawn band's
     place, the Markdown rendering. The 081 suites stay green.

There's no migration, write tool or permission. **Affected:** Delivery `server/attention.ts` (new),
`server/queries.ts`, `server/pin-offers.ts`, `pin-suggestions.ts`, `pins.ts`, `mcp.ts`, `ui/Attention.tsx` (new),
`ui/ProposalsPage.tsx`, `ui/ProjectLists.tsx`, `ui/ProposalPage.tsx`, `ui/ProposalSearch.tsx`, `ui/ProposalSuggestions.tsx`,
`ui/Markdown.tsx` (new), `ui/delivery.css`, `README.md`, tests; the mock's 081 section and its copy.

## Tasks

Order follows the commit phases (backend before UI, because the screens read the new contracts). One commit per phase.

- [x] `T1` — Phase 1 (data model and contracts): migrations `time.entry.proposal_id`, `delivery.proposal.owner_user_id`, `withdrawn_at`/`withdrawn_by`/`withdraw_reason`, `description`, drop `hours`; Delivery contract `getProposalRef`, `proposalHref`, `ProposalWithdrawn` event; Time contract `proposalHours` (AC-1, AC-4, AC-5, AC-7, AC-10)
  Files: modules/time/db/migrations/0009_entry_proposal.sql, modules/delivery/db/migrations/0019_proposal_lifecycle.sql, modules/delivery/contracts.ts, modules/time/contracts.ts, modules/time/server/totals.ts, modules/delivery/fixtures/index.ts, modules/time/fixtures/*, modules/time/tests/contracts.test.ts, modules/delivery/tests/proposal-contract.test.ts
- [x] `T2` — Phase 2 (time association and ownership): `log_time`/`correct_time_entry` take `proposalKey`; commit draft keeps it; owners on create, sync and push; retention (AC-1..AC-5)
  Files: modules/time/server/log.ts, modules/time/server/correct.ts, modules/time/suggestions.ts, modules/time/mcp.ts, modules/delivery/server/queries.ts, modules/delivery/server/services.ts, modules/delivery/server/push.ts, modules/delivery/mcp.ts, modules/delivery/module.ts, modules/time/tests/proposal-time.test.ts, modules/delivery/tests/proposal-owner.test.ts
  Depends: T1
- [x] `T3` — Phase 3 (detail page and navigation): `/delivery/proposals/:key` page with history from the audit log; links from lists, board, search; `get_proposal` reads one row (AC-6, AC-7, AC-8)
  Files: modules/delivery/ui/ProposalPage.tsx, modules/delivery/server/proposal-detail.ts, modules/delivery/module.ts, modules/delivery/mcp.ts, modules/delivery/ui/ProposalsPage.tsx, modules/delivery/ui/ProjectPage.tsx, modules/delivery/ui/delivery.css, modules/delivery/tests/proposal-detail.test.ts
  Depends: T2
- [x] `T4` — Phase 4 (lifecycle): `update_proposal`, `withdraw_proposal`, `add_proposal_task` services and tools; withdrawn excluded everywhere; detail-page actions (AC-9..AC-12, AC-18)
  Files: modules/delivery/server/lifecycle.ts, modules/delivery/server/tasks.ts, modules/delivery/server/services.ts, modules/delivery/mcp.ts, modules/delivery/ui/ProposalPage.tsx, modules/delivery/tests/proposal-lifecycle.test.ts, modules/delivery/tests/mcp-registry.test.ts
  Depends: T3
- [x] `T5` — Phase 5 (creation and chat): New proposal on the global page, project-carrying intent button, Delivery `chatSuggestions`, create card inputs (AC-13, AC-14)
  Files: packages/ui/src/components/PinButton.tsx, modules/delivery/chat.ts, modules/delivery/chat-suggestions.ts, modules/delivery/module.ts, modules/delivery/mcp.ts, modules/delivery/ui/ProposalsPage.tsx, modules/delivery/ui/ProjectPage.tsx, modules/delivery/tests/chat-081.test.ts
  Depends: T4
- [x] `T6` — Phase 6 (filters, metrics, pins, export): Planned filter, closed-project and project-filter consistency, search, 20 a page, `get_proposal_metrics` and its pins (AC-15..AC-17)
  Files: modules/delivery/server/queries.ts, modules/delivery/mcp.ts, modules/delivery/pins.ts, modules/delivery/ui/ProposalsPage.tsx, modules/delivery/ui/ProjectLists.tsx, modules/delivery/tests/proposal-metrics.test.ts
  Depends: T5
- [x] `T7` — Phase 7 (notifications and lifecycle consistency): owner notifications for phase changes and tasks done by others; regression tests for release, void, sync and push rules with withdrawn rows (AC-18, AC-19, AC-20)
  Files: modules/delivery/contracts.ts, modules/delivery/module.ts, modules/delivery/server/services.ts, modules/delivery/server/tasks.ts, modules/notifications/tests/delivery-routing.test.ts, modules/delivery/tests/proposal-regression.test.ts
  Depends: T6
- [x] `T8` — Phase 8 (tests and verification): e2e opens a proposal from the list, board and search; lint, unit tests, build, `e2e:auth` delivery; README and audit progress (AC-21)
  Files: apps/web/tests/e2e/delivery.spec.ts, modules/delivery/README.md, modules/time/README.md, modules/delivery/ui/delivery.css, modules/delivery/ui/ProposalSearch.tsx, .specclaw/mock/index.html, apps/mock/public/mock/index.html, .specclaw/changes/081-proposals-end-to-end/audit.md, .specclaw/changes/081-proposals-end-to-end/change.md
  Depends: T7
- [x] `T9` — Amendment 1, board and list: one actions component on the card and the page; task meter in every phase but Released; key note; "Released in <Month>" / "Released, all time" (AC-22 to AC-25)
  Files: modules/delivery/ui/ProposalActions.tsx, modules/delivery/ui/ProjectPage.tsx, modules/delivery/ui/ProposalsPage.tsx, modules/delivery/ui/ProposalPage.tsx, modules/delivery/mcp.ts, modules/delivery/tests/proposal-board-081.test.ts, .specclaw/mock/index.html, apps/mock/public/mock/index.html
  Depends: T8
- [x] `T10` — Amendment 1, Log time asks for the proposal (AC-26)
  Files: modules/time/chat.ts, modules/time/tests/proposal-time.test.ts, modules/time/tests/contracts.test.ts
  Depends: T8
- [x] `T11` — Amendment 1, PM hears of Verified (AC-27)
  Files: modules/delivery/module.ts, modules/notifications/tests/delivery-routing.test.ts
  Depends: T8
- [x] `T12` — Amendment 1, time in the proposal's history, by id, for whom may see it (AC-28)
  Files: modules/time/server/log.ts, modules/time/server/correct.ts, modules/delivery/server/proposal-detail.ts, modules/delivery/tests/proposal-detail.test.ts, modules/time/tests/proposal-time.test.ts
  Depends: T10
- [x] `T13` — Amendment 1, e2e, READMEs, audit traceability, CI replica (AC-29)
  Files: apps/web/tests/e2e/delivery.spec.ts, modules/delivery/README.md, modules/time/README.md, .specclaw/changes/081-proposals-end-to-end/audit.md, .specclaw/changes/081-proposals-end-to-end/change.md
  Depends: T9, T11, T12
- [x] `T14` — Amendment 2, pin suggestions for proposals (AC-30, AC-31)
  Files: modules/delivery/pin-suggestions.ts, modules/delivery/module.ts, modules/delivery/tests/proposal-suggestions.test.ts
  Depends: T13
- [x] `T15` — Amendment 2, the two agent suggestion kinds, their trigger and withdrawals (AC-32 to AC-34)
  Files: modules/delivery/suggestions.ts, modules/delivery/server/agent.ts, modules/delivery/module.ts, modules/delivery/tests/proposal-agent.test.ts
  Depends: T14
- [x] `T16` — Amendment 2, the page card and board chip, mock (AC-35)
  Files: modules/delivery/ui/ProposalSuggestions.tsx, modules/delivery/ui/ProposalPage.tsx, modules/delivery/ui/ProjectPage.tsx, modules/delivery/ui/delivery.css, .specclaw/mock/index.html, apps/mock/public/mock/index.html, modules/delivery/tests/proposal-agent.test.ts
  Depends: T15
- [x] `T17` — Amendment 2, end to end: scripted e2e rules, browser tests, hand walk-through, READMEs, traceability, CI replica (AC-36, AC-37)
  Files: packages/ai/src/scripted-writes.ts, apps/web/tests/e2e/delivery.spec.ts, modules/delivery/README.md, .specclaw/changes/081-proposals-end-to-end/audit.md, .specclaw/changes/081-proposals-end-to-end/change.md
  Depends: T16

- [x] `T18` — Amendment 3: pin suggestions for projects, releases, environments, deployments, repo sync and views; proposal additions; no Actions fold on cards; a clean Withdraw button (AC-38, AC-40)
  Depends: T17
  Files: modules/delivery/pin-suggestions.ts, modules/delivery/pins-offer/*.ts, modules/delivery/module.ts, modules/delivery/tests/pin-offers.test.ts
- [x] `T19` — Amendment 3: scripted e2e rules, browser tests, walk-through, docs, CI replica (AC-39, AC-41)
  Files: packages/ai/src/scripted-writes.ts, packages/ai/tests/scripted-writes.test.ts, apps/web/tests/e2e/delivery.spec.ts, modules/delivery/README.md, .specclaw/changes/081-proposals-end-to-end/audit.md, modules/delivery/server/write-cards.ts, modules/delivery/mcp.ts, modules/delivery/tests/chat-081.test.ts, apps/web/lib/page-context.ts, apps/web/tests/page-context.test.ts
  Depends: T18

- [x] `T20` — Amendment 4 groundwork: `ago` and `Since` move to @amax/ui (Time imports them); the board's band figures (proposals by phase, tasks closed by agents and by people) and the proposal's phase dates read on the server, with unit tests (AC-42, AC-47, AC-52)
  Files: packages/ui/src/age.ts, packages/ui/src/components/Since.tsx, packages/ui/src/index.ts, packages/ui/tests/age.test.ts (moved from modules/time), modules/time/ui/RequestFold.tsx, modules/time/ui/SentBack.tsx, modules/time/ui/Timesheets.tsx, modules/delivery/server/queries.ts, modules/delivery/server/proposal-detail.ts, modules/delivery/ui/band.ts, modules/delivery/tests/board-band-081.test.ts, modules/delivery/tests/proposal-detail.test.ts
  Depends: T19
- [x] `T21` — Amendment 4, the board: status band, folded repo sync, first when a push was refused (AC-42 to AC-45; AC-43 dropped)
  Files: modules/delivery/ui/ProjectPage.tsx, modules/delivery/ui/BoardBand.tsx, modules/delivery/ui/RepoSyncCard.tsx, modules/delivery/ui/delivery.css, modules/delivery/tests/board-a4.test.ts, modules/delivery/tests/proposal-board-081.test.ts
  Depends: T20
- [x] `T22` — Amendment 4, the proposal page: header, stepper, suggestions first, Time band, history timeline, folded done tasks (AC-46 to AC-51)
  Files: modules/delivery/ui/ProposalPage.tsx, modules/delivery/ui/ProposalActions.tsx, modules/delivery/ui/Stepper.tsx, modules/delivery/ui/BoardBand.tsx, modules/delivery/ui/delivery.css, modules/delivery/server/pin-offers.ts, modules/delivery/tests/proposal-page-a4.test.ts, modules/delivery/tests/proposal-detail.test.ts, modules/delivery/tests/proposal-board-081.test.ts, modules/delivery/tests/proposal-suggestions.test.ts
  Depends: T20
- [x] `T23` — Amendment 4: browser tests, axe, hand walk-through light and dark, CI replica (AC-53)
  Files: apps/web/tests/e2e/delivery.spec.ts, apps/web/tests/e2e/delivery-visual.spec.ts, apps/web/tests/e2e/ai-usage.spec.ts, packages/ai/src/scripted-writes.ts, packages/ai/tests/scripted-writes.test.ts, modules/delivery/server/pin-offers.ts, modules/delivery/server/closed-by.ts, modules/delivery/server/queries.ts, modules/delivery/server/overview.ts, modules/delivery/fixtures/index.ts, modules/delivery/ui/band.ts, modules/delivery/ui/BoardBand.tsx, modules/delivery/ui/delivery.css, modules/delivery/tests/*.test.ts, modules/delivery/README.md, .specclaw/changes/081-proposals-end-to-end/audit.md
  Depends: T21, T22

- [x] `T24` — Amendment 5: project-first breadcrumbs, the project's tabs on proposal and release pages, list links, reopen a task, environment and release actions on the pin; unit and browser tests (AC-54 to AC-61)
  Files: modules/delivery/ui/ProposalPage.tsx, modules/delivery/ui/ReleasePage.tsx, modules/delivery/ui/ProposalsPage.tsx, modules/delivery/ui/ReleasesPage.tsx, modules/delivery/ui/delivery.css, modules/delivery/contracts.ts, modules/delivery/module.ts, modules/delivery/mcp.ts, modules/delivery/server/tasks.ts, modules/delivery/server/agent.ts, modules/delivery/server/proposal-detail.ts, modules/delivery/server/write-cards.ts, modules/delivery/server/pin-offers.ts, modules/delivery/ui/EnvironmentsCard.tsx, modules/delivery/ui/ReleasesPage.tsx, modules/delivery/tests/ui-logic.test.ts, .specclaw/mock/index.html, packages/ai/src/scripted-writes.ts, apps/web/tests/e2e/releases.spec.ts, modules/delivery/tests/navigation-081.test.ts, modules/delivery/tests/reopen-task-081.test.ts, apps/web/tests/e2e/delivery.spec.ts
  Depends: T23

- [x] `T25` — Amendment 6, chat: the owner step on New proposal (a choice card, Me first, then the team), the create card's "they'll be told", the owner-change card's From/To and who's told, and `userId` on Allocations' team rows (AC-69 to AC-71)
  Files: modules/delivery/chat.ts, modules/delivery/server/proposal-card.ts, modules/allocations/server/team.ts, modules/allocations/tests/team.test.ts, modules/delivery/tests/owner-chat-a6.test.ts, modules/delivery/tests/chat-081.test.ts
  Depends: T24
- [x] `T26` — Amendment 6, the `delivery.proposal.owner_changed` event from create, an owner change, and a Suggested owner accept or undo (AC-62, AC-63)
  Files: modules/delivery/contracts.ts, modules/delivery/module.ts, modules/delivery/server/owner.ts, modules/delivery/server/services.ts, modules/delivery/server/lifecycle.ts, modules/delivery/server/proposal-kinds.ts, modules/delivery/tests/proposal-owner-a6.test.ts, modules/delivery/tests/delivery.test.ts
  Depends: T25
- [x] `T27` — Amendment 6, only someone on the project can own a proposal: checked before the card, in the services, and at a Suggested owner's accept (AC-67, AC-68)
  Files: modules/delivery/server/owner.ts, modules/delivery/server/services.ts, modules/delivery/server/lifecycle.ts, modules/delivery/server/proposal-kinds.ts, modules/delivery/server/proposal-card.ts, modules/delivery/mcp.ts, modules/delivery/tests/proposal-owner-a6.test.ts, modules/delivery/tests/proposal-db.ts
  Depends: T26
- [x] `T28` — Amendment 6, the new and previous owner are told, never for their own action (AC-64 to AC-66)
  Files: modules/delivery/module.ts, modules/notifications/tests/delivery-routing.test.ts
  Depends: T26
- [x] `T29` — Amendment 6, end to end: scripted e2e rules, the browser test, the README, both mock copies, the Linux CI replica (AC-72, AC-73)
  Files: packages/ai/src/scripted-writes.ts, packages/ai/tests/scripted-writes.test.ts, apps/web/tests/e2e/delivery.spec.ts, apps/web/tests/e2e/owner-a6.ts, modules/delivery/README.md, .specclaw/mock/index.html, apps/mock/public/mock/index.html
  Depends: T27, T28

- [x] `T30` — Amendment 7, the owner hears of a withdrawal: payload `ownerUserId` and `title`, rule `delivery.proposal-withdrawn`, mock bell line (AC-74, AC-77)
  Files: modules/delivery/contracts.ts, modules/delivery/module.ts, modules/delivery/server/lifecycle.ts, modules/delivery/README.md, modules/notifications/tests/delivery-routing.test.ts, .specclaw/mock/index.html, apps/mock/public/mock/index.html
  Depends: T29
- [x] `T31` — Amendment 7, the rollback rule's test (AC-75)
  Files: modules/notifications/tests/delivery-routing.test.ts
  Depends: T29
- [x] `T32` — Amendment 7, real writes to the bell: create, moves, task, Prod deployment, void, withdraw; then the Linux CI replica (AC-76)
  Files: modules/notifications/tests/delivery-flow.test.ts
  Depends: T30
- [x] `T33` — Amendment 8, the owner choice offers this month's team with their spare capacity: `freeThisMonth` on team rows, the owner step's instructions, the mock labels (AC-78 to AC-82)
  Files: modules/allocations/server/team.ts, modules/allocations/tests/team.test.ts, modules/delivery/chat.ts, modules/delivery/mcp.ts, modules/delivery/tests/owner-chat-a6.test.ts, .specclaw/mock/index.html, apps/mock/public/mock/index.html
  Depends: T32
- [x] `T34` — Amendment 9, reads: `list_proposals` `mine` and `likelyForMe`; the Mine filter on both lists and the counts; Overview "Your proposals"; the board's Yours marker; the "Log time on" pin offer; the "What do I own?" chat suggestion (AC-85 to AC-90)
  Files: modules/delivery/server/queries.ts, modules/delivery/mcp.ts, modules/delivery/server/overview.ts, modules/delivery/server/pin-offers.ts, modules/delivery/chat-suggestions.ts, modules/delivery/ui/ProposalsPage.tsx, modules/delivery/ui/ProjectLists.tsx, modules/delivery/ui/ProjectPage.tsx, modules/delivery/ui/delivery.css, modules/delivery/tests/mine-a9.test.ts
  Depends: T33
- [~] `T35` — Amendment 9, Time asks which proposal with quick replies on every log (AC-83, AC-84)
  Files: modules/time/chat.ts, modules/time/mcp.ts, modules/time/tests/proposal-time.test.ts
  Depends: T34
- [x] `T36` — Amendment 9, browser tests, README, mock, CI replica (AC-91)
  Files: apps/web/tests/e2e/delivery.spec.ts, modules/delivery/README.md, .specclaw/mock/index.html, apps/mock/public/mock/index.html
  Depends: T35

- [x] `T37` — Amendment 10, the release page's Tag and proposals card: the tag shown, aligned rows, no inner scroll bar (AC-92 to AC-94)
  Files: modules/delivery/ui/ReleasePage.tsx, modules/delivery/ui/delivery.css
  Depends: T24
- [x] `T38` — Amendment 11, reads: the four reasons, `need` on `list_proposals`, `get_proposal_task` and its pin offers (AC-95, AC-99)
  Files: modules/delivery/server/attention.ts, modules/delivery/server/queries.ts, modules/delivery/server/pin-offers.ts, modules/delivery/pin-suggestions.ts, modules/delivery/pins.ts, modules/delivery/mcp.ts, modules/delivery/tests/attention-a11.test.ts
  Depends: T37
- [x] `T39` — Amendment 11, screens: the attention strip, table order and chips, two-row head, empty row, key column, Withdrawn band, task pins, Markdown, classes for inline styles; mock (AC-96 to AC-98, AC-100 to AC-103)
  Files: modules/delivery/ui/Attention.tsx, modules/delivery/ui/ProposalsPage.tsx, modules/delivery/ui/ProjectLists.tsx, modules/delivery/ui/ProposalPage.tsx, modules/delivery/ui/ProposalSearch.tsx, modules/delivery/ui/ProposalSuggestions.tsx, modules/delivery/ui/Markdown.tsx, modules/delivery/ui/delivery.css, .specclaw/mock/index.html, apps/mock/public/mock/index.html
  Depends: T38
- [x] `T40` — Amendment 11, tests and README (AC-104)
  Files: modules/delivery/tests/attention-a11.test.ts, modules/delivery/README.md, apps/web/tests/e2e/delivery.spec.ts
  Depends: T39

## Verify

**Verdict:** PASS

- AC-1 to AC-4 (time and hours): pass — Time `proposal-time`, `proposal-hours`; e2e `delivery.spec`.
- AC-5, AC-62 to AC-71, AC-78 to AC-82 (owners): pass — `proposal-owner`, `proposal-owner-a6`, `owner-chat-a6`, Allocations `team`.
- AC-6 to AC-8, AC-46 to AC-53 (proposal page): pass — `proposal-detail`, `proposal-page-a4`; e2e `delivery.spec`, `delivery-visual`.
- AC-9 to AC-12, AC-18 to AC-20, AC-59 (lifecycle): pass — `proposal-lifecycle`, `reopen-task-081`, `proposal-regression`.
- AC-13, AC-14, AC-30, AC-31, AC-38 to AC-41 (chat and pin suggestions): pass — `chat-081`, `proposal-suggestions`, `pin-offers`.
- AC-15 to AC-17 (lists and metrics): pass — `proposal-metrics`; AC-32 to AC-35 (agent): pass — `proposal-agent`.
- AC-42 to AC-45 (project board): pass — `board-a4`, `board-band-081` (AC-43 dropped 2026-11-04).
- AC-54 to AC-61 (one way through Delivery): pass — `navigation-081`, `ui-logic`; e2e `delivery.spec`, `releases.spec`.
- AC-64 to AC-66, AC-74 to AC-77 (notifications): pass — Notifications `delivery-routing`, `delivery-flow`.
- AC-83 to AC-91 (time against a proposal, what I own): pass — `mine-a9`, Time `proposal-time`; e2e `delivery.spec`.
- AC-92 to AC-94 (release page card): built in T37; no test names them, and they were not checked again here.
- AC-95 to AC-104 (attention first, pinnable, aligned): pass — `attention-a11`, `readiness-081`, `proposal-detail`.
- AC-21 to AC-29, AC-36, AC-37, AC-72, AC-73 (the test plan): pass — the suites above, all passing in the replica below.

Commands (Linux replica of CI over `0bbdd63c`, the head the final review pass ran on):
- `pnpm install --frozen-lockfile`, `pnpm db:migrate`, `pnpm lint`, `node scripts/check-module-standard.mjs`, `pnpm build`: exit 0.
- `pnpm turbo run test --concurrency=2`: exit 0, 35/35 packages.
- `pnpm --filter @amax/web e2e`: 9 passed. `pnpm --filter @amax/web e2e:auth`: 95 passed.

Notes:
- Also carries, reviewed in the same loop (`covered-by`): 082-dev-fresh-cache, 083-profile-menu-closes,
  084-chat-quick-replies, 085-time-my-week-first, 086-rail-logo-aligned.
- Review: one loop over 081 to 086 against `upstream/main`, stopped at the five-pass cap (AGENTS.md) with 0 blockers and
  2 majors open, both in 081: "has no owner" decided two ways, and `mark_task_done` on a withdrawn proposal. Details below.
- `specclaw-preset-check .`: exit 1 from the repo-wide comment backlog. `specclaw-quality-scan`: not_run (jq "Argument list
  too long", as in 066–080).

### Review loop (2026-11-07)

**Stopped with these open**, for a follow-up change (also in `follow-ups.md`):
- **Major B4:** "has no owner" has two rules. `needsOf` checks `owner_user_id` and `owner_name`. The pin's "Make me the
  owner", the agent's Suggested owner and its accept guard check `owner_user_id` alone. So a row with only `owner_name`
  shows a named owner, yet gets a suggestion, and accepting it replaces that owner. Fix: one rule in `readiness.ts` for
  all four.
- **Major B1:** `mark_task_done` doesn't refuse a withdrawn proposal, though every other write does. Fix: refuse it as
  `reopen_task` does, with a variant test.
- **Minors:**
  - The list's "New proposal" chat suggestion isn't gated on `delivery:proposal:create`.
  - The one-day reopen window is written twice, against two clocks.
  - A malformed `%` escape in a proposal URL gives a server error.
  - Earlier minors: the time FK into Delivery's schema, and "Log time" offered without `hasModule('time')`.
  - The hours write uses a second connection.
  - The unread-slot state.
  - The unbounded time-line read for a viewer who sees few lines.
  - The `unavailable` code when Time is off.

**Scope.** One loop over the whole stack against `upstream/main` (`git.base_branch` set for the run, then restored): 081
and the changes it covers, 082-dev-fresh-cache, 083-profile-menu-closes (its work is in 081's commit `da337a8e`),
084-chat-quick-replies, 085-time-my-week-first and 086-rail-logo-aligned.
Each of those declares `**Review:** covered-by 081-proposals-end-to-end` and has no rounds of its own.

| Round | Pass | Since | Result |
|---|---|---|---|
| 1 | 1 | whole stack | 1 blocker, 6 majors, 3 minors |
| 2 | — | `6089b5b6` | not_run (reviewer hit 20 turns; `review.max_turns` raised to 30, as 064 did) |
| 3 | 2 | `6089b5b6` | 2 majors, 5 minors |
| 4 | 3 | `5b2b86b7` | 1 major, 3 minors |
| 5 | 4 | `c48088de` | clean, 1 minor |
| 6 (final) | 5 | whole stack, head `0bbdd63c` | 2 majors, 3 minors |

`specclaw-review verdict`: `Review: OPEN — 6 rounds, final pass missing, models opus/opus; last round 0/2/3 b/M/m`.
"Final pass missing" is the plugin's word for a final pass that isn't clean. Per AGENTS.md, the loop stops after five
passes; no blocker is open, so the PR goes ahead.

**Fixed in the loop** (each with a table-driven variant test):
- **Round 1:**
  - Blocker: proposal hours are now Delivery's service `delivery.proposal.hours`, run by Time's job and audited by count.
  - Hours refreshes for one project no longer race: Time takes a per-project lock.
  - Delivery's refusals carry their code: one helper, `server/refusal.ts`, over 30 throws.
  - One readiness rule (`server/readiness.ts`) for the list, the agent and the Overview panel.
  - Time supplies a proposal's time lines under its own rule, through a new core mechanism: a module fills another
    module's named slot (`provides`, `setProvided`, `provided`; `docs/architecture.md`, "Module slots").
  - Every stage step and history line has its own pin; the new read tool is `get_proposal_event`.
  - The `withdrawn_by` erasure finding was checked and is already handled (retention matches `… for user:<id>`), now
    covered by a test.
- **Round 3:**
  - A pinned history line is read directly, with no window.
  - An owner's time lines survive the 100-line cap.
  - Only Time's job may write hours.
- **Round 4:**
  - A time-line pin with Time switched off is refused, never "gone".
  - Other writers of hours are denied with `ForbiddenError`.
  - The paging test crosses a batch.

**Linux replica of CI** over `0bbdd63c` (`git archive HEAD`, fresh postgres:16-alpine with the `amax_app` role):

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile`, `pnpm db:migrate` | pass |
| `pnpm lint` | pass |
| `pnpm turbo run test --concurrency=2` | pass, 35/35 packages |
| `node scripts/check-module-standard.mjs` | pass |
| `pnpm build` | pass |
| `pnpm --filter @amax/web e2e` | 9 passed |
| `pnpm --filter @amax/web e2e:auth` | 95 passed, including the delivery visual comparison that amendment 11 left to run here |

The replica also passed on `6089b5b6` (before the loop) and `5b2b86b7` (after round 1). The work after round 6 touches
only `.specclaw/`: these records, and `git.base_branch` set back to `""`.

### Earlier runs

Run 2026-11-03 on Linux: the Docker replica of CI's `checks` job (node:24-bookworm, fresh postgres:16-alpine), over the
working tree at T8.

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile`, `pnpm db:migrate` (delivery 0019, time 0009) | pass |
| `pnpm lint` (35 type checks + graph check) | pass |
| `pnpm turbo run test --concurrency=2` | pass, every package; Delivery 27 files, Time 49, Notifications 6, web 34 |
| `node scripts/check-module-standard.mjs` | pass (22 modules) |
| `pnpm build` | pass |
| `pnpm --filter @amax/web e2e` | pass |
| `pnpm --filter @amax/web e2e:auth` | 83 passed, including the 081 proposal page test and the delivery visual test |

- First pass: Time's `grid-perf` took 2.23 s against its 2 s limit, with two packages testing at once in Docker on
  Windows. It passed alone. 081 doesn't change the Team grid's queries.
- The delivery visual test failed against 007's mock section. The page changed by design, and the section was updated
  with the product owner's agreement (Mock Delta). The search box's `.search` class also clashed with the shell's top
  bar; it is now `.proposal-search`.
- The 081 e2e test first looked for CON-014 on page 1. The e2e tenant's imported AMX specs fill that page, so the test
  now finds it through the new search.
- Host-only on Windows, passing on Linux: Delivery `releases.test` (backslash paths), Notifications `time-routing`
  (other modules' agents never settle), and graph check R7 on `packages/testing/boundaries`.
- After T8 (product owner walkthrough, 2026-11-03): clearing the search box with its ✕ left the list searched, because
  only Enter navigated. Emptying the box while a search is on now goes back to the list without `q`, keeping the phase
  and project filters (`ProposalSearch.tsx`); the 081 e2e test checks it. Checked in Chromium against `dev`: ✕, clearing
  by hand, and an empty box with no search on (stays). Then, asked and agreed (AC-16 amended), the box completes typing in place
  (a native `<datalist>` was tried first and dropped: the product owner wants no dropdown). The 081 e2e test types
  `inv`, gets "invoice export to PDF" with the guess selected, Backspace drops it, Tab keeps it, Enter searches. Then the project filter chip
  (asked and agreed): checked in Chromium, it appears after picking Contoso Portal from Filter, its ✕ (keyboard too)
  goes from `/building?project=CON&q=search` to `/building?q=search`, axe (WCAG 2.2 AA) clean, light and dark checked by
  eye. The 081 e2e test closes it and runs axe. `e2e:auth` not rerun yet.
- Review loop: not run. The specclaw-review MCP server didn't connect this session; run `/specclaw:verify` (or the
  review loop) before the PR.


### Amendment 1 verification (2026-11-04)

Linux replica of CI's `checks` job over the working tree at T13:

| Check | Result |
|---|---|
| install, `db:migrate` (no new migration) | pass |
| `pnpm lint` (type checks + graph check) | pass |
| `pnpm turbo run test --concurrency=2 --continue` | pass, every package, Time `grid-perf` included |
| `check-module-standard` | pass (22 modules) |
| `pnpm build` | pass |
| `e2e` | pass |
| `e2e:auth` | 84 passed after one fix: the 081 list test's `name: "All"` link matched "Released, all time" too; now `exact: true` |

- New tests: `delivery/tests/proposal-board-081.test.ts` (AC-22 to AC-25); AC-26 and AC-28 in `time/tests/proposal-time.test.ts`; AC-27 in `notifications/tests/delivery-routing.test.ts`; AC-28 in `delivery/tests/proposal-detail.test.ts`; e2e "081 AC-22" in `delivery.spec.ts`.
- Updated for the new labels: `delivery.test` (`month` in `phaseCounts`), `proposal-metrics` AC15, the legend e2e, and the board Move e2e (opens the Actions fold).
- Review loop: still not run. The specclaw-review MCP server isn't connected; run it before the PR.

### Amendment 2: what the hand walk-through found (2026-11-04)

The production build was run against a freshly seeded database (`amax_walk`) and driven as Maya in Chromium, with the
real job tick (`POST /api/jobs/tick`, a `CRON_SECRET` set for that run only) delivering the outbox, as production's cron
does. CI's side (closing a task from a commit) went through Delivery's services as a credential acting for a person.
- **Bug, fixed:** the tick delivered an older "moved to Planned" event after the "last task done" event, and the agent
  withdrew a "Ready to verify" that still fitted. The outbox doesn't promise order. The withdraw handlers now re-read
  the proposal and take back only what no longer fits it. There's a regression test (AC34 out of order).
- **Fixed:** a move confirmed from a pin suggestion said "Done: CON-016 added." Delivery's move, add-task and edit
  tools now have cards: "Move to Planned" → "Moved CON-016 to Planned", "Add the task" → "Added T1 to CON-018", and
  "Change owner" → "Kasun Dias now owns CON-019".
- **Fixed (approved, in `packages/agents`):** accepting a suggestion showed "Accept an agent suggestion: runs its
  change: <uuid>" with an "Add it" button. The four decision tools now show the suggestion's title, kind, agent and
  why, with Accept, Dismiss, Undo or Ask the agent on the button and in the receipt. It applies to every module's
  suggestions. Test: `packages/agents/tests/cards.test.ts`.
- **Fixed:** a double spark on the board chip, "0 of 0 tasks" on a Planned card with no tasks (now "No tasks yet"),
  and "All 1 task … are done" (now "The only task of CON-018, T1, is done").
- **Final pass, clean:**
  - Pin CON-016, then "Move CON-016 to Planned", confirm, and it's in Planned.
  - New proposal CON-018: Add a task, Planned and Building, all through pin suggestions.
  - CI closes the task; the tick runs the agent; the board shows the "amax suggests" chip and the page "Ready to
    verify".
  - Accept in chat makes it Verified, the Suggestions screen shows it undoable, and Undo puts it back in Building.
  - CI creates an ownerless CON-019 and Kasun's CI closes its task; the agent suggests Kasun as owner; accepting makes
    him the owner.
  - No page errors.
- **Not changed:** chat's "Here's what I'll add" line comes from the scripted e2e model; real Claude writes its own.

### Amendment 2 verification (2026-11-04)

Linux replica of CI's `checks` job over the final tree:

| Check | Result |
|---|---|
| install, `db:migrate` (no new migration), `lint`, `check-module-standard` (22 modules), `build` | pass |
| `pnpm turbo run test --concurrency=2 --continue` | pass, every package. New: `proposal-suggestions` (AC30, AC31), `proposal-agent` (AC32 to AC35, plus out of order), `chat-081` AC30 cards, `packages/agents/tests/cards.test.ts`, `packages/ai` scripted rules |
| `e2e` | pass |
| `e2e:auth` | 86 passed, including "081 AC-37 pin a proposal" and "081 AC-37 the agent suggests Ready to verify" |

On the way to green, all in the e2e helper and tests:
- **The spec didn't load.** The helper imported the module manifest, which pulls in its CSS; Playwright can't load
  that, so it now imports only server code.
- **The agent test hung.** The helper's pool had one connection, and the agent handler's transaction blocked
  `createSuggestion`'s; it now has four.
- **The Overview feed test failed.** The helper's CI task close left its feed line, which the Overview e2e then
  read; the helper now removes it.
- **The pin test checked the wrong text.** It now checks the card's From/To lines.

`auth.spec` AC5 failed once and passed on the rerun; this change doesn't touch it.
Review loop: still not run (the specclaw-review server isn't connected).

### Amendment 3 verification (2026-11-04)

Hand walk-through on the real app (`next start`, scripted model, as Maya):
- Each Delivery pin offered its actions: project, release, deployment, environments, one environment, repo sync, a
  proposal card. Each one ran from chat, and each receipt said what was done ("Done: added Sandbox to FLT").
- Board cards have no Actions menu. The proposal page shows Withdraw as an outlined danger button.
- No page errors.

Two fixes came out of it:
- **A testing release was offered QA again.** Offers now treat a release as reached once it's in testing or deployed.
- **The environment card said "add or change".** The card now checks whether the environment exists and says which.

After the walk-through, the person reported a console error: "two children with the same key, `New proposal`".
The pin's offer and the Proposals page's own suggestion had the same label. The shell's page context now shows each
label once, the pin's (`apps/web/lib/page-context.ts`; the new case is in `apps/web/tests/page-context.test.ts`).

Linux replica of CI's `checks` job over the final tree:

| Check | Result |
|---|---|
| install, `db:migrate`, `lint`, `check-module-standard`, `build` | pass |
| `pnpm turbo run test --concurrency=2 --continue` | pass, every package. New: `pin-offers` (AC38), `chat-081` AC39 cards, `packages/ai` scripted rules |
| `playwright install` | failed on a Debian download timeout; passed on the retry |
| `e2e` | 8 passed |
| `e2e:auth` | 87 passed, including the pin-driven board move and the "081 AC-39" release and environment flows |

The page-context fix came after that run. It's covered by its unit test (2 passed) and the web typecheck.
Review loop: still not run (the specclaw-review server isn't connected).

### Amendment 4 verification (2026-11-04)

**Hand walk-through** on the real app (`next start`, scripted model, as Maya), light and dark:
- **Board:** Repo sync leads, open, when a push was refused; Enter folds it. Then the band (next release stage by
  stage, tasks by who closed them), then the unchanged lanes.
- **Proposal page:** labelled facts, the stepper, Ask amax and Withdraw, the Time band, the release track, folded done
  tasks and the timeline. Checked on CON-016, CON-014 and CON-009.
- **Pins:** Building cards offer "Move to Verified (n tasks open)" and the next task. Verified cards in a release offer
  its next deployment. Both ran end to end: CON-014 moved to Verified, and CON v2.4.0 was recorded in UAT.
- **Checks:** axe found nothing on any page in either theme, and there were no page errors.

**Found and fixed on the way:**
- **Board:** Needs you only repeated the page, so AC-43 was dropped and Repo sync leads instead (AC-44 revised).
- **Duplicate information:** removed where the band repeated it (the page summary, the lane counts, the refused-push
  line).
- **Proposal page:**
  - The key note was removed (AC-24 revised), and the owner avatar dropped.
  - The facts became labelled names and dates, and header alignment was fixed: the project pin sits in its fact, and
    wrapped actions stay right-aligned.
  - Links meet contrast in dark mode.
- **Pins:** Building and Verified cards offered nothing to move them on (AC-30 revised). The demo data had no rows for
  the open tasks its counters claimed.
- **Who counts as an agent:** a person's verified commit was counted as an agent's. Now only closes an agent made
  through amax's tools count as agents, and CI and other jobs count as Automation (AC-42). The Overview uses the same
  rule.
- **Board on whole pixels:** Repo sync and the band ended at fractional heights, so at 390 px the board's lanes
  rendered half a pixel off the mock. Their heights are now rounded to whole pixels. The board comparisons also use a
  window tall enough that nothing scrolls.

**Linux replica of CI** over the final tree. The replica creates the `amax_app` role first, as `ci.yml` does:

| Check | Result |
|---|---|
| install, `db:migrate`, `lint`, `check-module-standard`, `build` | pass |
| `pnpm turbo run test` | every package passes except two tests unrelated to 081, below |
| `playwright install` | pass (the Debian mirror timed out once; passed on retry) |
| `e2e` | 8 passed |
| `e2e:auth` | **89 passed**, including "081 amendment 4" for the board and the proposal page, AC-37 (now reading the stepper), and the board and visual comparisons against the 001 mock |

Not caused by 081:
- `delivery/create-project-surfaces` times out under load (5.4 s against 5 s), as it does on Windows.
- `notifications/time-routing` fails because its shared setup loads every module's fixtures but not the finance,
  inbox and recruitment suggestion kinds. Their events retry until the drain loop gives up. It is worth its own small
  change.

Test-only fix in another change's file:
- `ai-usage.spec.ts` (048) checked that the "Unknown cost" tile doesn't contain "0 calls". With 081's new chat calls the
  count reached 20, and "20 calls" contains "0 calls". It now checks that the number of calls isn't zero.

**Plugin check:** the amax plugin (062) was installed from this branch and run as `/amax:sync-specclaw` runs, against a
local amax, not amaxerp.com:
- Preview: 1 created, 81 ignored (a branch push covers only its own change).
- Apply, then a second push: unchanged.
- AMX-081 shows on the Repo sync card and its page.

**Found preparing the demo (2026-11-05):** a dry run of the walk-through showed Withdraw's confirm card fell back to
chat's generic card: an "Add it" button and a "Done: CON-018 added." receipt. Withdraw now has its own card ("Withdraw
CON-018 …", button **Withdraw**, receipt "Done: withdrew CON-018"). Amendment 3's cards now name their verb on the
button (Create, Record, Void, Re-tag, Save, Add, Remove, Close the task, Link, Unlink) instead of "Add it".
`chat-081` AC39 checks every label; the AC-39 browser tests click them by name.

**Full demo rehearsal (2026-11-05):** the person's walk-through script was run step by step in the browser as Maya,
then Nimal. It covered the board, the pins, the proposal pages, a hand-made proposal from creation to withdrawal (with
the agent's Ready to verify, accept and undo), the proposals list, releases and environments, the Overview and Nimal's
bell. **48 of 48 checks passed**, with axe clean on every page checked and no page errors. It found three fixes:
- **Withdrawn banner:** it ran the reason into the next sentence ("Withdrawn. demo only It no longer…"). It now reads
  "Withdrawn: Demo only. It no longer…".
- **Next release heading:** its text read "v2.5.03 proposals" to screen readers and copy-paste. It now has spaces.
- **Demo proposals' dates:** they were dated the day the demo data loads ("Made by hand Nov 5, updated Oct 16"). They
  are now made on Sep 14, before any demo release and before their Oct 16 update.

**Test-only fix in another change's file (2026-11-05):** `modules/compliance/tests/registers.test.ts` AC2 reported a
breach due 72 h from the real now, then checked its last-week reminder from a fixed Nov 1. From 2026-11-05 that deadline
fell 8 days after Nov 1, so the test failed on every branch, `main` included (date drift, not 081's code). It now checks
from 6 days before the breach's own deadline. 5 of 5 pass.

### Amendment 5 verification (2026-11-05)

**On the running app (dev database, read-only checks):**
- **Trail and tabs:** board → card → proposal (trail "Projects / Contoso Portal / Proposals / CON-014", tabs with
  Proposals current) → **Board** in one click. A release's trail leads to the project's Releases tab.
- **Lists:** they link the project and the release, and the links look like the text they replace.
- **Environments and releases:** the rows have no buttons, and their pins offer the actions (AC-60, AC-61).
- **Reopen:** a task is reopened from the pin, and the history records it (AC-59).
- **Checks:** axe clean, no page errors.

**Roles:** with one role per person (Sahan Admin; Maya PM, managing CON and FLT; Kasun, Nimal, Ayesha and Tharushi
Engineer), each person's pins offer exactly their permissions. The PM gets nothing to deploy on HRI, which she doesn't
manage. An engineer allocated to CON and FLT can move proposals and close tasks there, but can't deploy. An engineer
with no allocation gets nothing. Checked in the browser, and confirmed on the server where the dev server was still
compiling.

**Linux replica of CI** over the final tree:

| Check | Result |
|---|---|
| install, `db:migrate`, `lint`, `check-module-standard`, `build`, `e2e` | pass (`e2e` 8 passed) |
| `pnpm turbo run test` | every package passes except `onboarding/exit` (a 5 s timeout under load), unrelated to 081 |
| `e2e:auth` | **91 passed**, including "081 amendment 5" (navigation, reopen), the pin-driven release and environment flows, and the 001 visual test |

Fixed on the way:
- **The navigation browser test** searched the list, because AMX's imported specs fill the first page.
- **The reopen browser test** now removes its two feed lines, which had displaced the Overview test's demo data.
- **`auth.spec` AC5** failed once (known flaky) and passed on the rerun.

Review loop: still not run (the specclaw-review server isn't connected).

### Amendment 6 verification (2026-11-05)

Built first as change 083 and folded into 081 the same day. The tests and labels were renamed to 081 amendment 6
(AC-62 to AC-73) after the full replica run, and then rechecked: Delivery's Amendment 6 suites, the type checks for
delivery, web and allocations, and the Delivery browser tests.

**Unit tests** (Windows host, local Postgres): `proposal-owner-a6` (AC62, AC67, AC68), `owner-chat-a6` (AC69 to AC71),
Allocations' `team` (AC69, the team's `userId`), notifications' `delivery-routing` (AC64 to AC66), `packages/ai`'s
scripted rules, and the 081 owner, lifecycle, agent and chat suites all pass.
- **Updated for the new rules:** `chat-081` (the cards' From/To and "they'll be told") and `delivery.test` (the event list).
- **Delivery's test database** puts Nimal on CON and FLT, as Allocations' fixtures do.

**Linux replica of CI** over the working tree, against a fresh Postgres with the `amax_app` role:

| Check | Result |
|---|---|
| install, `db:migrate`, `lint` (graph check: 22 modules, 11 packages), `check-module-standard`, `build`, `e2e` | pass |
| `pnpm turbo run test` | every package passes except three timeouts under load, unrelated to 081: `web` `pin-refs` (30 s), `web` `review-052` (5 s), `experience` `pulse` (5 s). All three pass when rerun alone |
| `e2e:auth` | **92 passed** on the rerun |
| `e2e:auth` Delivery, after the renames | 22 passed |

Fixed on the way:
- **The browser test's refusal check.** A refusal before the card reaches chat as a `not_proposed` note, and the
  scripted model only summarises tool results. The test now checks that no third card appears and the owner is
  unchanged. AC-67's wording is checked by its unit test.
- **`auth.spec` AC5** (known flaky) failed once and passed on the rerun.

**Not covered in the browser:** the bell itself. The e2e app runs no cron tick, so AC-64 to AC-66 rest on
`delivery-routing`. The choice card (AC-69) needs a real model to call `get_project_team` and `offer_choices`. The
scripted model only takes the owner as a typed id, so AC-69 is checked through the intent's instructions and the
team's `userId`, not in the browser.

Review loop: still not run (the specclaw-review server isn't connected).

### Amendment 7 verification (2026-11-05)

**Unit tests:**
- `delivery-routing` AC74 (withdrawal: the owner is told, not for their own action or an agent's for them) and AC75
  (rollback). The test found that Admins are told of every project's rollback, since they record deployments
  everywhere, so AC-75 says so.
- A new `delivery-flow` AC76 runs real writes as Maya through the MCP tools. Nimal hears all seven steps of one
  proposal (owned, three moves, its task, released, the void's way back), then "You now own" and "was withdrawn" for a
  second. Maya hears nothing for her own actions.
- The 081 lifecycle, agent and contract suites stay green.

**Linux replica of CI** over the working tree, with change 083-profile-menu-closes in it too, against a fresh Postgres:

| Check | Result |
|---|---|
| install, `db:migrate`, `lint` (graph check: 22 modules, 11 packages), `check-module-standard`, `build` | pass |
| `pnpm turbo run test` | every package passes except AC76. Its two notifications to Nimal for one proposal were delivered in one pass and compared in order. The check is now order-independent and passes in the replica (`delivery-flow` and `delivery-routing`, 6 of 6) |
| `e2e` | 8 passed |
| `e2e:auth` | **93 passed** |

Review loop: still not run (the specclaw-review server isn't connected).

### Covers 084-chat-quick-replies

`084-chat-quick-replies` is `**Review:** covered-by 081-proposals-end-to-end`. Its work went into this branch in
081's commit `5ddc6561` (amendments 8 and 9, with 084), so 081's review loop reviews it, and the review gate judges it
by 081's final pass.

### Amendments 8 and 9 verification (2026-11-05)

**Linux replica of CI** over commit `5ddc6561` (`git archive HEAD`), against a fresh Postgres with the `amax_app` role:

| Check | Result |
|---|---|
| install, `db:migrate`, `lint` (graph check: 22 modules, 11 packages), `check-module-standard`, `build` | pass |
| `e2e` | 8 passed |
| `e2e:auth` | **95 passed**, including "081 amendment 9" (My proposals, Your proposals, Yours) and 084's quick replies |
| `pnpm turbo run test` | every package passes except five that ran out of time under load. Rerun alone in the same image, all pass: Time `utilisation-no-leave` (its 60 s setup) and `grid-perf`, Delivery `create-project-surfaces`, core `ac4-jobs` and `secrets-ac2-leaks` (3, 7 and 9 tests) |

**End to end with real Claude** (2026-11-05): a fresh seeded database, the built app and real Claude, driven in a browser.
14 of 14 steps and 39 of 39 checks passed. It covered:
- **Owners and notifications:** creating a proposal with Who owns it?, the refused owner, a change of owner, a withdrawal,
  and Ready to verify accepted.
- **Bells:** Nimal's and Kasun's.
- **084:** Which project?, "today" understood, Which proposal? with quick replies.
- **Amendment 9:** My proposals, Your proposals and Yours.

It found and fixed one gap: Yours was missing on agent-made cards (AC-90 revised). It also recorded two items:
- **The proposal buttons when logging time** showed "CON" for the proposal key (a wording fix for `log_time`'s rule).
- **The one-project case:** Claude widened the buttons to every project. This one is for the product owner.

Review loop: still not run (the specclaw-review server isn't connected).

### Amendment 11 verification (2026-11-07, Windows host)

- **Unit tests** against the local dev Postgres (`DATABASE_MIGRATE_URL` set): `attention-a11` 7/7 (AC-95 to AC-104).
  Delivery, Notifications and the web app's nav and page-context suites: 356 of 357; the one failure is the known
  host-only backslash path in `releases.test.ts` ("assignProposals ... two call sites"). Web and AI unit suites 416/416.
- **Type checks:** Delivery and the web app, clean. The graph check finds 0 modules on this host, so it proves nothing
  here; it runs on Linux CI.
- **On the running app** as Maya, 1440 and 390 px: the strip (nothing needs Maya in the dev data), the two-row head,
  the key column, the task rows. The 390 px pass found the two-row head sized to its widest content (it inherited
  `flex-wrap:wrap`) and the search box overflowing; both fixed.
- **e2e:** one assertion now reads the Proposal cell's link, not the whole cell, since the cell can carry chips.
  **Not yet run:** `e2e:auth`, including the delivery visual comparison. 001's Proposals mock section now shows the
  strip line, the two-row head and the key column, with the same CSS; run the Linux CI replica to confirm it's within 2%.
