# 081 audit: Delivery → Proposals, as built at `64c6bbc9`

Each finding below was checked against the code. Where a path is cited, it was read. This is also the progress log:
`## Progress` at the end is updated as phases land.

## Architecture map

| Layer | Where | Notes |
|---|---|---|
| Registration | `modules/delivery/module.ts` | nav `proposals`; routes `proposals`, `proposals/:phase`, `p/:key/proposals[/:phase]`; no detail route |
| Schema | `delivery.proposal` (0001, 0012 created_at, 0013, 0015 tasks, 0017 synced_commit_at) | `hours numeric` static, `owner_name text` only, `meta.withdrawn` used by specclaw only |
| Reads | `server/queries.ts` `listProposals`, `getProject`, `getProposal` (filters full list), `phaseCounts`, `shippedPerWeek` | `ACTIVE` = not `meta.withdrawn`; no project-status filter |
| Writes | `server/services.ts` `createProposal`, `moveProposal`, `syncProposal`/`upsertSpecProposal`, release + deployment services; `server/tasks.ts` `markTaskDone`; `server/push.ts` `sync_specclaw` | all `defineService` (permission, audit, events) |
| MCP | `mcp.ts` | `create_proposal` input has no owner; no update/withdraw/add-task |
| Chat | `chat.ts` intents; no `chatSuggestions` | `delivery.new-proposal` always asks "Which project?" |
| UI | `ui/ProposalsPage.tsx` (global + shared `ProposalsTable`), `ui/ProjectLists.tsx`, `ui/ProjectPage.tsx` board | rows and cards not linked |
| Events | `contracts.ts` `EVENTS` | `proposal.phase_changed`, `task.done` emitted; no notification uses them |
| Time | `modules/time/server/log.ts` `logEntry`; `suggestions.ts` `commitDraft`; `contracts.ts` | `time.entry` has `project_id` only |

### Operation traces

- **Create (UI/chat):** `IntentButton delivery.new-proposal` → chat fills `create_proposal` → confirm card →
  `createProposal` (`delivery:proposal:create`, `scoped` on project) → insert row with `owner_name = input.ownerName`
  (never passed by the tool, so it's always null) → audit `delivery.proposal.create` → no event. The page refreshes on
  the next navigation.
- **Move:** `AskButton Move` (board card) → `move_proposal` → `moveProposal` refuses Released and any `source` → update
  phase → `proposal.phase_changed`.
- **Sync (CI):** `sync/bin.ts` → `syncSpecclaw` → `syncProposal` per changed record (service principal, acting for
  nobody) → `upsertSpecProposal` (Released sticky, rekeys a hand-made row on a spec key) → tasks `writeTasks`. Folders
  that are gone get `meta.withdrawn`.
- **Push (plugin):** `sync_specclaw` → `pushSpecclaw` (repo link, `delivery:proposal:push`, stale/back/released checks,
  dry-run via rollback) → same upsert. No owner either way.
- **Commit ingest:** `inbound` → `ingestPush` → `markTaskDone` per `T<n>`. `Time: 1.5h` → `draftCommitTime` → event
  `delivery.commit.time {proposalKey}` → Time `commitTimeHandler` → suggestion → accept → `logEntry` with `note =
  "<key>, commit …"`. **The proposal link is lost here.**
- **Release:** `record_deployment` on Prod → proposals in release → `released` + `prior_phases`; `void_deployment`
  restores them. Rollback notification to PMs.

## Findings

| # | Finding | Evidence | Status |
|---|---|---|---|
| F1 | Proposal hours never change: `delivery.proposal.hours` is written only by fixtures | `grep hours modules/delivery` (only fixtures/UI read it) | **broken** → AC-1..4 |
| F2 | `time.entry` can't name a proposal; `log_time` has no proposal input | `time/db/migrations/0001_time.sql`, `time/server/log.ts` input | **missing** → AC-1 |
| F3 | Accepting a commit-time suggestion drops `proposalKey` into the note | `time/suggestions.ts:31` | **broken** → AC-2 |
| F4 | No Time contract for hours per proposal | `time/contracts.ts` | **missing** → AC-4 |
| F5 | No owner on hand-made (tool lacks it), synced or pushed proposals; no `owner_user_id` at all | `services.ts createProposal`, `upsertSpecProposal` insert | **broken** → AC-5 |
| F6 | No single-proposal page; search hit, rows and cards go to the board or nowhere | `module.ts` routes, `mcp.ts search` | **missing** → AC-6, AC-7 |
| F7 | `get_proposal` loads every proposal to find one; hides withdrawn | `queries.ts getProposal` | **inefficient/incomplete** → AC-8 |
| F8 | Hand-made proposals can't be edited, withdrawn or given tasks | `mcp.ts` | **missing** → AC-9..11 |
| F9 | Global and project lists have no Planned filter | `ProposalsPage.tsx FILTERS` | **broken** → AC-15 |
| F10 | Shipped-per-week pin opens `list_proposals` | `ProposalsPage.tsx` pin | **wrong** → AC-17 |
| F11 | Phase counts ignore the project filter; counts, list and shipped include closed projects while the project filter offers only active ones | `phaseCounts`, `shippedPerWeek`, `listProposals` | **inconsistent** → AC-16 |
| F12 | Global page has no New proposal; project page's button doesn't carry the project | `ProposalsPage.tsx`, `ProjectPage.tsx IntentButton` | **UX** → AC-13 |
| F13 | Delivery has no `chatSuggestions` | `module.ts` vs `time/module.ts` | **missing** → AC-13 |
| F14 | No notification for `proposal.phase_changed` / `task.done` | `module.ts notifications` | **missing** → AC-19 |
| F15 | Five rows per page; no search; CSV exports only the current filter (fine) | `ProposalsTable PAGE = 5` | **UX** → AC-16 |
| F16 | Engineers can move a proposal to Planned; PRODUCT.md says PMs approve proposals | `module.ts grants`, PRODUCT.md:19 | **decision** D1 |
| F17 | No phase-history store; the audit log has every move, sync and release | `appendAudit` via `defineService` | use audit (AC-6) |
| F18 | Retention lists `owner_name`; an `owner_user_id` must join it | `module.ts retention` | → AC-5 |

### Verified working (kept, regression-tested in AC-18)

- Released only from a Prod deployment; `moveProposal` refuses Released and synced rows.
- `void_deployment` restores `prior_phases`; falls back to Verified for old records.
- Sync and push never move Released back; push refuses a step back, stale commits, and other repos.
- Hand-made proposals rekey to the `-H` series when a spec change claims their key; the event and audit fire.
- Tasks closed by commits stay closed across syncs.
- Tenant isolation: every table is tenant-RLS (`core.enable_tenant_rls`); reads go through `withTenant`.

## Progress

- [x] Phase 1: data model and contracts: migrations (delivery 0019, time 0009); Delivery `getProposalRef`, `setProposalHours`, `proposalHref`, `proposal.withdrawn` event; Time `refreshProposalHours` and its handlers. Decision: Time pushes approved totals to Delivery (R5 forbids Delivery → Time)
- [x] Phase 2: time association and ownership: `log_time`, `correct_time_entry` (and change requests) take `proposalKey`, checked through `getProposalRef`; commit drafts keep it (unless withdrawn since); owners from the acting person on create, sync and push (a later sync fills a missing owner, never replaces one); "Unassigned" shown; creating in a closed project is refused
- [x] Phase 3: detail page and navigation: `/delivery/proposals/:key` (shares the `:phase` segment; a non-phase is a key), history from `core.audit_event` + `proposal.phase_changed` events, linked from list rows, board cards, release page, search; `get_proposal` reads one row and returns tasks, stages, history and `href`
- [x] Phase 4: update, withdraw and add-task: `update_proposal`, `withdraw_proposal` (destructive, reason, leaves its release; release row locked first), `add_proposal_task`; spec proposals refused except owner; withdrawn ones refused by move, release assignment and Prod release; page actions by permission
- [x] Phase 5: creation and chat: New proposal on the global page (carries a filtered project) and the project page (carries the project, shown only to who may create there); intent asks no project when one is pinned; Delivery `chatSuggestions` and `pageLabel`; `create_proposal` gets `propose` (no card for unknown, closed or out-of-scope projects) and a card with project, title, description, estimate, owner
- [x] Phase 6: filters, metrics, pins, export: Planned filter on both lists; one filter (`scope` in queries.ts) for list, counts and shipped chart: never withdrawn, active projects unless a project is named, project filter, `q` search; Overview proposal counts follow it; 20 a page; CSV = every filtered row; `get_proposal_metrics` backs both card pins
- [x] Phase 7: notifications and lifecycle consistency: `ownerUserId` added to `proposal.phase_changed` and `task.done` payloads; rules `delivery.proposal-phase` and `delivery.proposal-task-done` tell the owner (not when they or an agent for them acted), linking the proposal page; regression test for Prod release, void, sync and withdrawn-in-release. Open: notifications `time-routing.test` fails here on unrelated it-access/recruitment handlers; compare on main in the Linux CI replica (T8)
- [x] Phase 8: tests, verification, docs: e2e (search, list, board, reload, axe, not found); READMEs; 007's Proposals mock section updated (agreed); search class fix; Linux CI replica all green (see change.md `## Verify`). The notifications `time-routing` open item is closed: it passes on Linux and only fails on Windows
- [x] Amendment 3 (2026-11-04): T18 every pin's offers, no card dropdown, clean Withdraw button; T19 scripted rules, browser tests, walk-through, CI replica
- [x] Amendment 2 (2026-11-04): T14 pin suggestions; T15 the Delivery agent's two kinds; T16 page card and board chip; T17 scripted e2e rules, browser tests, hand walk-through, CI replica
- [x] Amendment 1 (2026-11-04): T9 board card actions in Time's style, meters while Proposed, key note, Released labels; T10 Log time asks for the proposal; T11 PMs hear Verified; T12 time in the proposal's history; T13 e2e, READMEs, this matrix

## Traceability: Proposals BRD (Nov 3, 2026) → 081

| BRD | Status | Where (AC · code · test) |
|---|---|---|
| FR-01 time entry carries a proposal | Done | AC-1 · `time/0009_entry_proposal.sql`, `time/server/log.ts` · `proposal-time` AC1 |
| FR-02 commit suggestion keeps the proposal | Done | AC-2 · `time/suggestions.ts` · `proposal-time` AC2 |
| FR-03 log time against a proposal from chat | Done | AC-1, AC-26 · `time/chat.ts`, `entry-card.ts` · `proposal-time` AC26 |
| FR-04 approved hours on tab and board | Done | AC-4 · `time/server/proposal-hours.ts` · `proposal-hours` AC4 |
| FR-05 Delivery reads hours through Time's contract | Done, inverted; **needs sign-off** | AC-4 · Time pushes totals to Delivery's `setProposalHours` (graph rule R5 forbids Delivery → Time) |
| FR-06 owner defaults to the creator | Done | AC-5 · `delivery/server/owner.ts` · `proposal-owner` AC5 |
| FR-07 owner from the push's person | Done; **rule needs sign-off** | AC-5 · a sync fills a missing owner, never replaces one; a bare CI credential sets none |
| FR-08 detail page | Done | AC-6 · `ui/ProposalPage.tsx`, `server/proposal-detail.ts` · `proposal-detail` AC6, e2e 081 |
| FR-09 rows and search link to it | Done | AC-7 · `proposal-detail` AC7, e2e 081 |
| FR-10 pinnable, Ask amax | Done | AC-6 · `ProposalPage.tsx` · e2e pins |
| FR-10a key change explained | Built, then removed at the client's request (Amendment 4, 2026-11-04) | AC-24 revised · the rekey itself is unchanged and its history line stays · `proposal-board-081` AC24 (no note) |
| FR-11 `update_proposal` | Done | AC-9 · `server/lifecycle.ts` · `proposal-lifecycle` AC9 |
| FR-12 `withdraw_proposal` | Done | AC-10 · `proposal-lifecycle` AC10 |
| FR-13 `add_proposal_task`, meter instead of "–" | Done | AC-11, AC-23 · `proposal-lifecycle` AC11, `proposal-board-081` AC23 |
| FR-14 Ask amax actions on card and page | Done, via pins | AC-22, AC-38, AC-46 · the card's and the page's pin offer Move, Edit and tasks; the page keeps Ask amax and Withdraw · `proposal-board-081` AC22, `proposal-suggestions` AC30, e2e amendment 4 |
| FR-15 Planned filter | Done | AC-15 · `proposal-metrics` AC15 |
| FR-16 weekly pin opens the weekly metric | Done | AC-17 · `get_proposal_metrics` · `proposal-metrics` AC17 |
| FR-17 New proposal with the project | Done | AC-13 · `ui/NewProposalButton.tsx`, `chat-suggestions.ts` · `chat-081` AC13 |
| FR-18 notifications (PM at Verified, owner on phase) | Done | AC-19, AC-27 · `module.ts` rules · `notifications/delivery-routing` AC19, AC27 |
| FR-19 PM approval before Planned | Decided: none (D1) | AC-20 |
| FR-20 closed projects out of counts | Done on fixtures; **real-data check open (Q7)** | AC-16 · `proposal-metrics` AC16 |
| FR-21 Released this month vs all | Done | AC-25 · `proposal-board-081` AC25 |
| Agent-first: pin suggestions (client ask, Amendment 2) | Done | AC-30, AC-31 · `pin-suggestions.ts` · `proposal-suggestions`, e2e "081 AC-37 pin" |
| Agent-first: agent suggestions (client ask, Amendment 2) | Done | AC-32 to AC-35 · `server/agent.ts`, `server/proposal-kinds.ts`, `ui/ProposalSuggestions.tsx` · `proposal-agent`, e2e "081 AC-37 agent" |
| Every Delivery pin acts (client ask, Amendment 3) | Done | AC-38 to AC-41 · `server/pin-offers.ts`, `pin-suggestions.ts` · `pin-offers`, e2e "081 AC-39" (release, environment), board move via pin |
| Interactive board and proposal page (client ask, Amendment 4) | Done | AC-42, AC-44 to AC-53 (AC-43 dropped) · `ui/BoardBand.tsx`, `ui/Stepper.tsx`, `ui/band.ts`, `ProposalPage.tsx`, `RepoSyncCard.tsx` · `board-band-081`, `board-a4`, `proposal-page-a4`, e2e "081 amendment 4" (board, proposal page) |
| BR-1 to BR-6 | Kept | `proposal-regression` AC18, `releases`, `sync-push`, `chat-first` (no forms), graph check |
| NFR-1 permissions | Kept; **reuse needs sign-off (Q2)** | AC-12, AC-22 |
| NFR-2 pins | Done | AC-6, AC-17 |
| NFR-3 audit incl. time logged | Done | AC-28 · `proposal-detail` AC28, `proposal-time` AC28 |
| NFR-4 design first | Done | mock 081 section; 007 labels (agreed) |
| NFR-5 tests; fixtures don't fake hours | Done | fixtures write no hours (T1) |
| Out of scope in the BRD, built anyway | Search box, 20 a page | AC-16 (from the original 081 brief) |

Open for the product owner: Q2, Q3, Q5, FR-05 and FR-07 sign-off, Q7 (see change.md, Amendment 1).
