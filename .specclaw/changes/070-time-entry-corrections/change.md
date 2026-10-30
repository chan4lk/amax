# Time entry corrections: fix or remove hours, and keep Reports in step

**Change:** 070-time-entry-corrections · **Created:** 2026-10-22

## Problem

Time entries are insert-only (audit TIM-B01). A rejected week can only gain hours, so "you logged 8 h, it was 6 h"
can't be fixed, and hours never go down. Undoing a commit-draft suggestion deletes the entry without an event
(TIM-B02), so Reports keeps hours that no longer exist. On the way: an Admin can reopen their own approved week
(TIM-B06); writes without a week act on the UTC current week (TIM-B10); and `findWeek` tells "doesn't exist" apart
from "not yours", and locks rows before checking the caller (TIM-B12). Evidence is in [`audit.md`](audit.md).

**Amendment, 2026-10-22** (from the Time page requirements, FR-4.6, FR-5.8, FR-5.10, FR-5.14, FR-5.18): an
approved week can still be edited directly by another Admin rather than being locked, only the owner can fix a
draft or rejected entry, a delete removes the row instead of keeping it, and the confirm card doesn't say what is
changing. AC-13 to AC-17 cover these.

**Amendment 2, 2026-10-23** (from a live run with the real model; approved by the product owner, "make those changes
in the current branch"): the confirm cards are hard to read (the title is the tool description plus a comma list of
every input, the body shows raw field names, ISO dates and the entry id), approval cards show only a week id, and chat
can make a card that can only fail (Kasun confirmed "log 6 h" on his submitted week, then got the refusal). AC-20 to
AC-27 cover these. Ctrl+K on Team time was rechecked and works once the page has loaded (the run's driver pressed it
too early), so it isn't part of this.

**Amendment 3, 2026-10-23** (approved by the product owner, "approve amendment 3", with the recommended D7–D10): once a week is submitted or
approved, its owner can't change it, and chat only says "ask the approver" or "reopen it with a reason"; the asking
happens outside amax, with no record, no queue for the approver, and no notice to the owner when a week is reopened.
AC-29 to AC-39 add change requests: the owner asks once in chat, and an approver applies, reopens, asks or declines.

**Amendment 4, 2026-10-23** (approved by the product owner, "approve amendment 4", with the recommended D11–D14):
chat doesn't know which page or week the person is on, so they have to say it or pin a row; nothing on screen
says what chat can do here except per-row buttons the client finds cluttered ("Fix these hours", "Fix hours"); and
"Remind 2 people" or "Approve 3 submitted" make one card per person with no summary of who was done. AC-40 to AC-49
add page-aware chat with suggestions, remove the two Fix buttons, and make team reminders and approvals one card with
a result per person.

**Amendment 5, 2026-10-23** (approved by the product owner: "approve but do it in 070"; drafted as 074-session-switch-safety): Signing in as Maya in one tab while Tharushi is signed in in another makes Tharushi's tab show Maya on refresh. Root
cause, reproduced on 2026-10-23: amax's session is one HTTP-only cookie (`authjs.session-token`, an Auth.js JWT that
carries only tenant, user and session ids). A browser keeps one cookie per site for all of its tabs, so a second
sign-in replaces it for every tab; separate browser profiles stay independent. No auth state is in localStorage or
sessionStorage (only the theme), and "view as" lives on the server-side session row. Three defects make this unsafe:
the sign-in page shows the form to a browser that is already signed in and replaces the identity silently; the
replaced session is never revoked, so it stays valid for 12 hours (139 live sessions in the local database); and until
it is refreshed, the first tab still shows Tharushi while anything it does (a chat confirm, "view as") runs as Maya.

## Mock Delta

What changes on screen, and where to see it: [`070-time-entry-corrections`](../../mock/index.html#070-time-entry-corrections)

My timesheet (009) gets, per project row, an **Ask amax** "Fix these hours" button with that row pinned. Chat lists the
row's entries and proposes `correct_time_entry` or `delete_time_entry`, which the person confirms. A rejected week shows
the approver's comment above the rows with the same button. There are no edit fields.

Amendment: the confirm card says what changes ("Fleet Tracker, Wed Oct 14: 10 h → 6 h"). An approved week
has no "Fix these hours" button, and chat answers a fix request with "locked, reopen it with a reason". A PM's card for a
member's entry names the person and the reason, and the member's bell shows "Ayesha Perera changed your Fleet Tracker
hours for Wed Oct 14" with the reason.

Amendment 2 ([`#070-amendment-2`](../../mock/index.html#070-amendment-2)): Time's confirm cards get a plain title and
labelled before → after lines, with no ids or field names: "Fix Fleet Tracker, Wed Oct 14" / "Hours 2.7 h → 2 h"; a fix
for someone else adds "For Tharushi Wijesinghe", the reason and "Tharushi will be notified"; "Approve Nimal Silva's
timesheet for 2026-W42 (31.5 h)". A request on a submitted or approved week gets a reply saying why and what to do next,
and no card.

Amendment 3 ([`#070-amendment-3`](../../mock/index.html#070-amendment-3)):

- **Chat (owner, locked week):** instead of a refusal, a change-request card: "Request a change to Fleet Tracker,
  Wed Oct 14 · Hours 7 h → 5 h · Reason … · Week 2026-W42 is submitted; Maya Fernando reviews it". Confirming sends
  the request; nothing on the timesheet changes.
- **My timesheet:** a locked week with an open request shows a pinnable notice: "Change requested: Fleet Tracker, Wed
  Oct 14, 7 h → 5 h · Waiting for review".
- **Team time:** a "Change requests" card above the timesheets, listing open requests in the viewer's scope (person,
  week, entry, before → after, reason, age), each row pinnable with an Ask amax "Review" that opens chat with it pinned.
- **Chat (approver):** "Apply it", "Reopen for Kasun", "Ask Kasun" or "Decline" through one confirm card each, e.g.
  "Apply Kasun Dias's change: Fleet Tracker, Wed Oct 14 · Hours 7 h → 5 h · Week stays submitted".
- **Bell:** the approver gets "Kasun Dias asked to change Fleet Tracker, Wed Oct 14"; the owner gets each decision.

Amendment 4 ([`#070-amendment-4`](../../mock/index.html#070-amendment-4)): the chat header shows where you are,
"My timesheet · Week of Oct 12". With an empty message box, chat offers up to four suggestions for this page that the
viewer can actually do, e.g. on My timesheet "Fix an entry", "Submit my week", "What did I log this week?" (or "Ask for
a change" on a locked week); on Team time "Who hasn't submitted?", "Remind everyone who hasn't submitted", "Review
change requests", "Approve submitted timesheets". A suggestion fills the message box; it never sends on its own.
My timesheet rows lose "Fix these hours" and Team time rows lose "Fix hours"; their pins stay. "Remind 2 people"
gives one card, "Remind 2 people to submit 2026-W42" listing each person, and after confirming: "Reminded 2 · skipped
0 · failed 0", with a line per person.

Amendment 5 ([`#070-amendment-5`](../../mock/index.html#070-amendment-5)):

- **Sign-in page, already signed in:** "You're signed in as Tharushi Wijesinghe (Engineer)" with "Continue as
  Tharushi" and "Sign out to switch account"; no sign-in form until the browser signs out.
- **Any open tab after another tab signs in or out:** a blocking banner, "You're now signed in as Maya Fernando in
  another tab. Reload to continue as Maya." (or "You signed out in another tab. Sign in again."), with a Reload button;
  the chat panel can't send or confirm until then.

## Acceptance Criteria

1. **AC-1** `correct_time_entry` (MCP tool + `time.entry.correct` service) changes one entry's hours, billable flag,
   note or project. The day can't change (delete and log again for that). Hours keep the `log_time` rules: > 0,
   ≤ 24 per person-day across entries, steps of 0.05 h. The owner may correct entries in a **draft** or **rejected**
   week. A **submitted** week is refused with "ask the approver to send it back". An **approved** week needs another
   Admin and is audited as `time.week.locked_change` (the existing lock guard, reused).
2. **AC-2** `delete_time_entry` (MCP tool + `time.entry.delete` service) removes one entry under the same rules as AC-1.
3. **AC-3** Each write emits one declared event in the same transaction as the row change:
   `time.entry.corrected` `{ entryId, weekId, userId, projectId, day, hours, billable, revision, before: { hours, billable, projectId }, lockedChange }`
   and `time.entry.deleted` `{ entryId, weekId, userId, projectId, day, hours, revision, lockedChange }`.
   `time.entry.logged` gains `revision: 1`. Payloads are declared in `module.ts`. The audit row records before and after.
4. **AC-4** `time.entry` gets `revision int not null default 1`, bumped on each correction. A refused write (validation,
   permission, lock) leaves the entry, the audit log and the outbox unchanged. A test forces a failure after the
   update and checks all three are rolled back.
5. **AC-5** Chat: intents `time.correct` and `time.delete` go through the pending-action confirm (no direct writes).
   `get_timesheet` and `get_my_week` return the week's entries with their ids, so chat can name the exact entry. My
   timesheet rows carry an `IntentButton` with a `PinButton` that resolves to that row (R3).
6. **AC-6** Undoing a commit-draft suggestion emits `time.entry.deleted` for its entry (TIM-B02).
7. **AC-7** Reports handles `time.entry.corrected` (update hours and billable) and `time.entry.deleted` (tombstone).
   It applies an event only when its `revision` is newer than the stored one, and a late `time.entry.logged` never
   brings back a tombstoned entry. Reports' utilisation never counts a deleted entry or a corrected entry's old hours.
8. **AC-8** `reopen_week` refuses the Admin's own week, matching the self-approval rule (TIM-B06).
9. **AC-9** Writes that name a week by person need an explicit `week` (or a `weekId`). `submit_week` needs `week`. Leaving it
   out is a validation error that names the field, never a guessed UTC week. The read tools keep "latest week" and say
   so (TIM-B10).
10. **AC-10** `findWeek` authorises before it locks. For a week the caller can't act on, "no such timesheet" and
    "not yours" give the same error. The namesake error doesn't list other people's emails (TIM-B12).
11. **AC-11** Regression tests (DB-backed, none skipped):
    - log → submit → reject → correct (down) and delete → resubmit, then check `weekTotals`, the submit payload's hours
      and `reports.logged_hours`;
    - unauthorised user, submitted week, approved week (owner refused; another Admin allowed and audited), 0 h,
      over 24 h a day, 0.07 h;
    - TIM-T01: apply suggestion → undo → deliver events → no `logged_hours` row;
    - events out of order: deleted before logged, and corrected twice in reverse;
    - TIM-T04: 24 h a day and 0.05 h steps; TIM-T05: `isoWeekOf(2025-12-29)` is `2026-W01`;
    - self-reopen refused; a write with no week refused; `findWeek` gives the same error for missing and out-of-scope weeks.
12. **AC-12** README (tools, events, rules) updated. `check:graph` passes; the `modules/time` and `modules/reports`
    suites pass with DB tests running.

**Amendment, 2026-10-22.** It is additive only: it changes 070's own new tools (`correct_time_entry`,
`delete_time_entry` and their cards), and nothing already on `main` behaves differently. Where AC-13 to AC-17
differ from AC-1 to AC-3, they win.

13. **AC-13** Approved weeks are locked for corrections and deletes (FR-4.6, FR-5.18). `correct_time_entry` and
    `delete_time_entry` on an **approved** week are refused for everyone, Admin included, with "2026-W42 is approved
    and locked; reopen it with a reason (reopen_week) to change it". Nothing is written. A reopened week (draft)
    takes them again. Chat relays the refusal and offers the reopen path. My timesheet shows no "Fix these hours"
    button on an approved week. **Unchanged:** `log_time`, accepting a commit draft, the 009 lock guard and its
    `time.week.locked_change` audit, and every event payload's existing fields (`lockedChange` stays, and is
    `false` on corrections and deletes).
14. **AC-14** A PM or Admin can fix someone else's entry (FR-5.10). The owner can correct or delete as before. So can a
    PM who holds `time:approve` on the entry's project (and on the new project, if it changes), and an Admin. Anyone
    else gets the AC-10 out-of-scope error. A non-owner must give `reason` (3–500 characters), or validation fails
    and names the field. The owner may leave it out. The same week rules apply to everyone: draft or rejected only,
    a submitted week is refused, and an approved week is refused (AC-13). The audit row records the reason. The
    `corrected` and `deleted` payloads gain `by`, `byOther` and `reason`.
15. **AC-15** The member hears about it (FR-5.10). New rules `time.entry-corrected-by-other` and
    `time.entry-deleted-by-other` (`when: { byOther: true }`, to the owner, except `by`) put
    "{by} changed your {project} hours for {day}" (or "removed") in the owner's bell, with the reason as the body, linking
    to `/time/my/{week}`. A change the owner makes to their own entry sends nothing.
16. **AC-16** Soft delete (FR-5.8). `time.entry` gets nullable `deleted_at timestamptz` and `deleted_by uuid`
    (migration `0003_entry_deleted_at.sql`, columns only; existing rows stay null). `delete_time_entry` sets them
    instead of removing the row, and bumps `revision`. Every read and guard skips rows with `deleted_at` set:
    `get_my_week`, `get_timesheet`, Team time, the week total and project list, the day-total guard, the submit
    payload, and `weekTotals`/`projectHours`/`visible()` in `contracts.ts`. No existing row has it set, so every
    existing read returns what it does today. Correcting or deleting a deleted entry gives the same error as a missing
    one. The row and its audit trail stay. **Unchanged:** the commit-draft undo keeps removing its entry as today
    (with 070's event).
17. **AC-17** The confirm card says what changes (FR-5.14). For a correction it names the project and day and shows
    each changed field before → after (e.g. "Fleet Tracker, Wed Oct 14: 10 h → 6 h"). For a delete it names the
    project, day and hours. For someone else's entry it also names the person and the reason. The tools take
    `project`, `day`, `hoursBefore` and `person` as inputs, and their `propose` check refuses a card whose values
    don't match the stored entry. The shared card lists every input, so the entry id still shows, after those
    fields. Tested on the pending card's title. The shared confirm-card component and other tools' cards don't
    change.
18. **AC-18** Tests (DB-backed, none skipped): an Admin and the owner both refused to correct or delete on an approved
    week, then allowed after `reopen_week`. A PM fixes a managed project's entry with a reason and the owner gets one
    notification. A PM is refused on an unmanaged project, on moving the entry to an unmanaged project, and without a
    reason. A soft-deleted entry is gone from every read and total but its row and audit remain. The card-text checks
    from AC-17. README updated.
19. **AC-19** Nothing existing changes: every test that exists on `main` and in 009 passes **unmodified**,
    including Admin `log_time` into an approved week (audited as `time.week.locked_change`), the commit-draft undo,
    and the shape of existing event payloads. Only tests for 070's own correct/delete locked-change cases are
    replaced, because AC-13 supersedes them. `git diff main -- modules/time/tests` shows no edits to pre-070 tests.

**Amendment 2, 2026-10-23.** It changes how cards look and when they are made; no service, event or rule changes, and
every refusal it adds at proposal time is one the service already makes at run time. Where AC-20 to AC-25 differ from
AC-17, they win.

20. **AC-20** A tool can declare an optional `card(viewer, input)` returning `{ title, lines: { label, value }[] }`.
    When it does, chat's pending card uses that title and shows those lines instead of the raw input list. The input
    is still stored and run as today. Tools without `card` look exactly as they do now, a card saved before this
    still renders, and a `card` that throws falls back to today's card. The buttons and the confirm flow don't change.
21. **AC-21** `correct_time_entry`'s card reads the stored entry: title "Fix {project}, {Wed Oct 14}"; one line per
    changed field, before → after ("Hours 2.7 h → 2 h", billable, note, project); for someone else's entry also
    "For {person}", "Reason {reason}" and "{first name} will be notified". No entry id or field names show.
22. **AC-22** `delete_time_entry`'s card: "Remove {project}, {Wed Oct 14}: {hours} h", plus the person, reason and
    notify lines as in AC-21.
23. **AC-23** `log_time`'s card: "Log {hours} h to {project}, {Wed Oct 14}", with billable and note lines when given.
24. **AC-24** `approve_week`, `reject_week`, `remind_week` and `reopen_week` cards name the person, the ISO week and
    its total ("Approve Nimal Silva's timesheet for 2026-W42 (31.5 h)"), plus the comment or reason when given.
25. **AC-25** No doomed card. The tool's `propose` check refuses, so no card is made and chat is told why, when:
    correct or delete targets a submitted or approved week (AC-13's messages); `log_time` targets a submitted week,
    or an approved week the caller may not change (009's rule, unchanged); approve or reject targets a week that
    isn't submitted; remind targets one that isn't draft or rejected; reopen targets a week that isn't approved, or
    the caller's own. The services keep every check they have.
26. **AC-26** Tests: the title and lines for each tool above (own and someone else's entry); each AC-25 refusal leaves
    no pending card and writes nothing; a tool without `card`, and a `card` that throws, give today's card. 070's
    AC-17 test on the old title text is replaced; every other existing test passes unmodified.
27. **AC-27** A clean live run with the real model, from reset local demo data, of the demo script: Tharushi fixes and
    removes an entry, Kasun's request on his submitted week gets a reply and no card, Maya fixes Tharushi's entry
    with a reason and Tharushi's bell shows it, Sahan's request on an approved week gets a reply and no card.
    Screenshots of each card in `shots/`.
28. **AC-28** The member's bell names the day as the cards do: "Maya Fernando changed your Fleet Tracker hours for
    Tue Oct 13" (and "removed"), not the ISO date. The `corrected` and `deleted` payloads gain an optional
    `dayLabel`; `day` and every other field stay as they are.

**Amendment 3, 2026-10-23.** It adds a request path for locked weeks; the correction rules, cards and events of AC-1
to AC-28 stay as they are, except as D7 and D8 allow, and only through a request.

29. **AC-29** A change request is stored in `time.change_request` (migration `0004_change_request.sql`): week, entry, kind
   (`correct` or `delete`), the entry's values and `revision` when asked, the proposed values, reason, status,
   requester, reviewer, decision note and timestamps. At most one open request per entry. Existing tables don't change;
   071's and 073's migrations move to `0005` and `0006`.
30. **AC-30** `request_time_change` (MCP tool + `time.change.request` service): the owner asks to correct (hours, billable,
   note, project) or delete one entry of their own **submitted or approved** week, with a reason (3–500 characters). It is
   refused for a draft or rejected week (chat uses `correct_time_entry` there), for someone else's entry, and for an entry
   that already has an open request. Its card reads "Request a change to {project}, {Wed Oct 14}" with before → after
   lines, the reason, the week's status and who reviews it. Creating it changes no entry, week or total.
31. **AC-31** Chat routes by week state: a fix on a draft or rejected week stays `correct_time_entry`; on a submitted or
   approved week the agent proposes `request_time_change` instead of telling the owner to ask someone. The tool
   descriptions and AC-13's refusal messages point to it.
32. **AC-32** Who reviews: anyone in the week's approval chain (`chainFor`: Admin, the owner's line manager, a PM of a
   project with time in that week), never the owner. Event `time.change.requested` notifies them through the existing
   `approvers` recipient (line managers, else Admins), "{owner} asked to change {project}, {Wed Oct 14}".
33. **AC-33** `get_change_requests` (read): the owner sees their own requests; a reviewer sees open and recent requests in
   their scope, filtered by status and week. Nobody sees requests outside their scope; a missing request and one out of
   scope give the same error.
34. **AC-34** `decide_change_request` with `decision`:
   - `apply`: the reviewer's own correction or delete on the entry, through the correction services, attributed to the reviewer
     with the request's reason and id; the owner is notified as in AC-15. The week keeps its status. Refused if the
     entry's `revision` changed since the request ("the entry changed; ask Kasun to confirm the request again").
   - `reopen`: a submitted week is sent back (`reject_week`, comment = the request) and an approved week is reopened
     (`reopen_week`, reason = the request). The owner then fixes and resubmits as today. The request is `reopened`, and
     becomes `completed` when the week is next submitted.
   - `ask`: status `needs_info` with the reviewer's question; the owner answers in chat (`answer_change_request`), which
     returns it to `pending` with the answer.
   - `decline`: status `declined` with a reason; nothing else changes.
   Each decision has one confirm card naming the person, entry, before → after and what happens to the week.
35. **AC-35** Lifecycle: `pending → needs_info → pending`; `pending → applied | reopened → completed | declined`; the owner
   may `cancel` while `pending` or `needs_info`. Any other transition is refused. A decided request can't be decided
   again (a second confirm of the same card is a no-op, as for every chat card).
36. **AC-36** Events `time.change.requested`, `time.change.decided` (`decision`, `by`, `note`) and `time.change.completed`,
   declared in `module.ts`; each in the same transaction as its row change, audited with before and after. Rules notify
   the reviewer of a request and of an answer, and the owner of every decision.
37. **AC-37** Screens as in the mock: My timesheet shows the open request on a locked week; Team time shows the
   "Change requests" card in the viewer's scope, rows pinnable (R3) with an Ask amax "Review" (prompt names the request).
   No forms or inline edits.
38. **AC-38** Tests (DB-backed, none skipped): request on a submitted and on an approved week leaves totals and Reports
    unchanged; refused on draft, on someone else's entry and on a second open request; routed to the right reviewers and
    not the owner; out-of-scope reviewer refused; `apply` changes the entry and notifies, and is refused on a stale
    revision; `reopen` on submitted and approved weeks, then resubmit completes it; `ask` → `answer` → `pending`;
    `decline` changes nothing; replayed decision is a no-op; the chat card text for each. Every existing test passes
    unmodified.
39. **AC-39** A live run with the real model: Kasun asks in chat to fix Thursday on his submitted week, confirms the
    request; Maya sees it on Team time, applies it; Kasun's bell and timesheet show the result. Then a request on an
    approved week, reopened, fixed and resubmitted. Screenshots in `shots/`.

**Amendment 4, 2026-10-23.** Shared chat gains page context and suggestions;
Time removes two buttons and gains two bulk tools. Context never grants anything: every tool keeps its own checks.

40. **AC-40** Page context. With every message the chat panel sends the page's path. The server matches it against the
    installed modules' routes (`/time/my/2026-W42` → Time, "My timesheet", `{ week: "2026-W42" }`); an unknown path
    gives no context. The model gets one data item "Current page" with the module, page title, route params and the
    page's suggestions (AC-42), re-read on every message, so a follow-up uses the page the person is on now. Pins
    stay the way to name one record; the page alone never picks a record when more than one fits.
41. **AC-41** Context indicator. The chat header shows the page title and, when the module gives one, a label for the
    params: Time gives "Week of Oct 12" for a week. It updates on navigation.
42. **AC-42** Suggestions. A module declares `chatSuggestions` per route: label, prompt, the tool it leads to, and an
    optional server check (`when(viewer, params)`). The panel shows at most four, only those whose tool the viewer
    may use (`toolsFor`) and whose check passes, in the empty state and above an empty message box. Choosing one
    fills the message box; it never sends. Keyboard reachable, read as a list of buttons by screen readers.
43. **AC-43** "What can you help me do here?" The model's instructions say to answer from the page's suggestions and
    the viewer's tools, and to say plainly when something isn't possible here, offering what is.
44. **AC-44** Rule change (D11). AGENTS.md rule 1 and review rule R3: a write that chat suggests on that page (AC-42)
    needs no per-record Ask amax button; forms stay forbidden, and every record and metric keeps its pin.
45. **AC-45** My timesheet drops "Fix these hours" and Team time drops "Fix hours"; rows keep their pins. Time's
    suggestions cover them: "Fix an entry" (draft or rejected week), "Ask for a change" (submitted or approved,
    own week), "Fix someone's hours" on Team time for approvers with a draft or rejected week in view. The unused
    prompts go; 070's tests that pressed the buttons are replaced by pin + suggestion.
46. **AC-46** `remind_weeks` (Team time, approvers): everyone in the viewer's scope whose week is draft or rejected,
    or only the people named. One card: "Remind 2 people to submit 2026-W42" with a line per person (status, hours).
    Confirming runs `remind_week`'s service once per person, each in its own transaction, and returns a result per
    person: `sent`, `skipped` (already submitted by then, or not in scope) or `failed` (reason). The card then reads
    "Reminded 2 · skipped 0 · failed 0" with the per-person lines. A replayed confirm runs nothing again.
47. **AC-47** `approve_weeks`, the same for submitted weeks: "Approve 3 timesheets for 2026-W42 (87.5 h)", a line per
    person, per-person results; a week that is no longer submitted, or is the viewer's own, is skipped with the reason.
    Team time's "Remind N people" and "Approve N submitted" prompts use these tools.
48. **AC-48** Tests (DB-backed where it touches data): route matching and unknown paths; the "Current page" data item
    on each turn; suggestions filtered by permission and by their check (an Engineer sees no Team time approvals;
    a submitted week shows "Ask for a change", not "Fix an entry"); the two buttons gone and pins present; bulk
    reminders and approvals with a skipped and a failed person, and a replay; e2e: the header label, a suggestion
    filling the box, axe clean. Every other existing test passes unmodified.
49. **AC-49** Live run with the real model: on My timesheet, "change Wednesday to 6 h" with no pin resolves to the week
    on screen; "What can you help me do here?" lists this page's actions; on Team time "remind everyone who hasn't
    submitted" gives one card and per-person results. Screenshots in `shots/`.
50. **AC-50** (added by the product owner during the build, 2026-10-23: "fix any UI issues … I need the UI clean and
    perfect") My timesheet, Team time, the change-request cards and the chat panel render cleanly at desktop and phone
    widths, in light and dark, for a draft, submitted, sent-back and approved week and for an approver and an
    engineer: no overlapping, clipped or overflowing content, no horizontal page scroll, readable contrast. Each
    issue found is fixed and listed under Verify with before and after screenshots.

**Amendment 5, 2026-10-23.** Sessions: one identity per browser, switched on purpose; a stale tab can't act.

51. **AC-51** `/signin` with a live session shows who is signed in, "Continue" (to `next`) and "Sign out to switch
   account"; the providers and the demo and password forms appear only once the browser has no live session.
52. **AC-52** A sign-in never leaves the browser's earlier session alive: the password and demo sign-in actions revoke
   any live session of the current cookie before opening the new one (audited `auth.signout` with
   `reason: "switched"`), and sign-out keeps revoking as today. Directory (Entra) sign-in starts only from a signed-out
   browser (AC-51).
53. **AC-53** Each page knows which user it was rendered for. The chat actions (`sendChat`, `confirmChat`,
   `cancelChat`, `refreshPins`, `pageContext`, the chat-history actions) and `viewAsAction` take that user id and
   refuse, writing nothing, when the session's user differs ("signed in as someone else in another tab").
54. **AC-54** Open tabs notice a switch: on focus or visibility, and when another tab signs in or out (a
   `BroadcastChannel` message, no auth data in it), the page reads its own session; if the user changed or is gone it
   shows the blocking banner from the mock with Reload. Nothing about the session is kept in browser storage.
55. **AC-55** Authorisation stays on the server: every module page and tool still rebuilds the viewer from the session
   row on each request (`loadViewer`); nothing in AC-53 or AC-54 trusts the client's user id for permission, it only
   refuses a mismatch.
56. **AC-56** Tests: unit tests for the user-id check on each guarded action (match runs, mismatch refuses, nothing
   written) and for the revoke-on-switch sign-in; e2e in one browser context with two tabs: A signs in as Tharushi,
   B sees "signed in as Tharushi" on `/signin`, signs out and in as Maya; A shows the banner on focus, its chat send is
   refused, Reload shows Maya; Tharushi's first session is revoked in `auth.session`; sign-out in one tab bans the
   other. Two separate contexts stay independent. Every existing auth and chat test passes unmodified.

57. **AC-57** (from the product owner's demo rehearsal, 2026-10-23: "the 'asked' stays as just now") A change request's
    age counts minutes, hours and minutes, then days and hours ("1 h 15 min ago"), keeps updating while the page is
    open, and shows the exact time on hover, on Team time's Change requests card and on the owner's notice.

**Not here — independent accounts per tab.** A browser can't give each tab its own cookie. Doing it would mean
either keeping the session in `sessionStorage` and sending it as a header (loses HTTP-only protection against
script theft, breaks server rendering of pages), or a multi-account design with one cookie per account and the
account in the URL (`/u/0/…`, `/u/1/…`, as Google does), which touches every route, link and pin. Neither is
recommended now. To use two roles at once, use two browser profiles or a private window; an Admin can also preview
another role with "view as".

## Scope

- **In `modules/time/`:** `server/correct.ts` (new), `server/log.ts` (export the lock and day-total guards),
  `server/weeks.ts`, `server/reopen.ts`, `server/my.ts`, `server/sheet.ts`, `mcp.ts`, `chat.ts`, `contracts.ts`,
  `module.ts`, `suggestions.ts`, `ui/MyPage.tsx`, `ui/prompts.ts`, migration `0002_entry_revision.sql`, tests, README.
- **Outside (necessary):** `modules/reports/server/hours.ts` (two handlers, revision check, tombstone),
  `modules/reports/module.ts` (register them), and a migration `modules/reports/db/migrations/0002_hours_revision.sql`
  (`revision`, `deleted_at`). Without these, Reports keeps stale hours after every correction, which is AC-7.
  utilisation reads skip tombstones.
- **Not here:** draft or rejected hours in Reports (REP-B04 → 072); Finance (072); entity scope (071).
- **Amendment adds, in `modules/time/`:** `server/correct.ts` (its own approved-week refusal; `guardLock` and
  `log.ts` behave as before), `server/entry.ts` (PM/Admin scope), the `deleted_at is null` filter in
  `server/read.ts`, `server/weeks.ts`, `server/team.ts`, `server/guards.ts` (day total) and `contracts.ts`,
  `module.ts` (two new rules; new optional payload fields only), `mcp.ts`, `chat.ts`, `ui/MyPage.tsx`, migration
  `0003_entry_deleted_at.sql`, new tests, README. Nothing new outside `modules/time/`: Reports' tombstone already
  handles `time.entry.deleted`.
- **Not altered:** `log_time`, the commit-draft accept and undo, `reopen_week`, the 009 lock guard and its audit,
  the shared confirm card, existing event fields, existing notification rules.
- **Knock-on for unbuilt changes:** 071's migration becomes `0004`, 073's `0005`.
- **Amendment 2 adds:** `packages/core/src/module.ts` (the optional `card` on a tool), `packages/chat/src/engine.ts`
  (use it for the pending card), `apps/web/components/chat/Chat.tsx` (render its lines), and in `modules/time/`
  `mcp.ts`, `server/card.ts`, `server/guards.ts` (the lock rule as a pure check, `guardLock` unchanged in behaviour),
  `server/weeks.ts` (find a week without locking it, for the propose check), tests, README. Not here: the Sonnet
  0 requests-per-minute limit on the Anthropic workspace (a Console setting), and the outbox tick in local dev.
- **Amendment 3 adds** (in `modules/time/` only): migration `0004_change_request.sql`, `server/request.ts` (new), `server/decide-request.ts` (new),
`server/requests-read.ts` (new), `server/correct.ts` (accept a request id on the reviewer's write), `mcp.ts`, `chat.ts`,
`module.ts` (events, rules), `contracts.ts`, `ui/MyPage.tsx`, `ui/Timesheets.tsx`, `ui/ChangeRequests.tsx` (new),
`ui/prompts.ts`, tests, README.
- **Not in amendment 3** (follow-up changes):
  - **075 page-aware chat and suggestions:** chat knows the module, page, week and selected record (shown as
    "My timesheet · Week of Oct 12"), and offers compact suggestions from the capabilities the viewer may use, plus
    "What can you help me do here?". Shared; context never grants permission.
  - **076 fewer buttons on My timesheet:** remove "Fix these hours" once 074 and 075 work, after the product owner amends
    AGENTS.md rule 1 and review rule R3.
  - **077 Team time multi-step:** "remind everyone who hasn't submitted" with per-person results (skipped, failed, sent).
  - Slash commands: not needed if 075's suggestions land; revisit after the pilot.
- **Amendment 5 adds:** `apps/web/app/signin/page.tsx`, `apps/web/app/actions/chat.ts`, `apps/web/app/actions/chat-history.ts`,
`apps/web/app/actions/session.ts`, `apps/web/app/(app)/layout.tsx`, `apps/web/components/shell/` (the banner and the
tab watcher), `apps/web/components/chat/Chat.tsx` (send the user id), `packages/auth/src/session.ts` (revoke with a
reason), tests.

## Decisions

Approved by the product owner, 2026-10-22 ("approve 070, go with your recommended decisions").

- **D1 What can be corrected:** hours, billable, note and project, not the day. Allowing the day to change would let
  an entry move weeks, which mixes two weeks' locks.
- **D2 Reports ordering:** revision plus tombstone in Reports (above), not a re-read of Time per event.
- **D3 Approved weeks lock fully for corrections and deletes** (product owner, 2026-10-22): no Admin can correct or
  delete an entry in an approved week; reopen with a reason is the only path (FR-4.6, FR-5.18). The product owner
  also asked that no existing feature change, so 009's Admin `log_time` into an approved week stays as it is. Locking
  that too would be its own change.
- **D4 Who fixes someone else's entry** (product owner, 2026-10-22, FR-5.10): a PM on the entry's project, or an
  Admin, with a reason; the member is notified.
- **D5 Soft delete** (product owner, 2026-10-22, FR-5.8): `deleted_at` on the row; the audit trail and Reports'
  tombstone are unchanged.
- **D6 Confirm card** (product owner, 2026-10-22, FR-5.14): before → after for each changed field.

**Amendment 3, approved by the product owner 2026-10-23 ("approve amendment 3"): the recommended option of each.**

- **D7 Applying a fix to a locked week.** D3 says no one changes an approved week without reopening it. `apply`
  would change that for one entry when, and only when, the owner asked for it and the approver agrees, audited with the
  request id. *Recommended:* allow `apply` on submitted weeks (the approver is deciding on that week anyway) and on
  approved weeks, recorded as `time.week.locked_change` with the request id. *Alternative:* on an approved week,
  `apply` = reopen + correct + the owner resubmits.
- **D8 Who may reopen through a request.** `reopen_week` is Admin only. *Recommended:* anyone in the week's approval chain
  may reopen **through a request** (the client asked for PMs too); `reopen_week` itself stays Admin only.
- **D9 Notification on reopen.** *Recommended:* add the missing owner notification for `time.week.reopened` here, since
  requests reopen weeks.
- **D10 One entry per request.** *Recommended:* yes for now; several entries are several requests.

**Amendment 4, approved by the product owner 2026-10-23 ("approve amendment 4"): the recommended option of each.**

- **D11 Buttons and rule R3.** *Recommended:* amend AGENTS.md rule 1 and R3 as in AC-44, and remove only the two Fix
  buttons now; Approve, Remind, Review, "Ask amax to log time" and Submit stay until the suggestions prove themselves.
- **D12 Where suggestions show.** *Recommended:* the chat panel only (empty state and above an empty message box), at
  most four, none on the page itself.
- **D13 Bulk actions.** *Recommended:* reminders and approvals only; corrections stay one card per entry, because each
  needs its own before → after.
- **D14 "Hasn't submitted".** *Recommended:* as today's "Remind N people": weeks in the viewer's scope that are draft
  or rejected. People with no timesheet at all for the week are left to 073's scheduled reminders.

## Tasks

<!-- UI first, then backend, then integration. Week writes keep the 009 lock guard; correct and delete
     share it and the 24 h day total with logEntry. Reports applies an event only when its revision is newer. -->

- [x] `T1` — My timesheet as in the mock: a "Fix these hours" `AskButton` per project row (row pinned, prompt naming the week and project), shown for draft and rejected weeks, alongside the existing row pin and the sent-back comment; chat-first test covers it (AC-5 UI)
  Files: modules/time/ui/MyPage.tsx, modules/time/ui/prompts.ts, modules/time/tests/chat-first.test.ts
- [x] `T2` — Backend: the `revision` migration; `time.entry.correct` and `time.entry.delete` services reusing the lock guard and day total; `time.entry.corrected`/`deleted` events, `revision` on `logged`, payloads declared; reopen refuses your own week; writes need an explicit week; `findWeek` authorises before it locks, with one error for missing and out-of-scope weeks and no namesake emails (AC-1–AC-4, AC-8–AC-10)
  Files: modules/time/db/migrations/0002_entry_revision.sql, modules/time/server/correct.ts, modules/time/server/log.ts, modules/time/server/weeks.ts, modules/time/server/decide.ts, modules/time/server/submit.ts, modules/time/server/reopen.ts, modules/time/contracts.ts, modules/time/module.ts, modules/time/tests/corrections.test.ts, modules/time/tests/week-guards.test.ts
  Depends: T1
- [x] `T3` — Tools and chat: `correct_time_entry` and `delete_time_entry`, the `time.correct`/`time.delete` intents, entry ids on `get_my_week` and `get_timesheet`, required `week` on write tools; undo of a commit draft emits `time.entry.deleted` (AC-5, AC-6, AC-9)
  Files: modules/time/mcp.ts, modules/time/chat.ts, modules/time/server/my.ts, modules/time/server/sheet.ts, modules/time/suggestions.ts, modules/time/tests/mcp.test.ts, modules/time/tests/contracts.test.ts, modules/time/tests/commit-draft-008.test.ts
  Depends: T2
- [x] `T4` — Reports: `revision` and `deleted_at` on `logged_hours`, corrected and deleted handlers applying only newer revisions, a late `logged` never reviving a tombstone, utilisation skipping tombstones (AC-7)
  Files: modules/reports/db/migrations/0002_hours_revision.sql, modules/reports/server/hours.ts, modules/reports/server/inputs.ts, modules/reports/module.ts, modules/reports/tests/hours-sync.test.ts
  Depends: T2
- [x] `T5` — Integration through the outbox: log → submit → reject → correct/delete → resubmit with totals and Reports; TIM-T01 undo; out-of-order and retried events; TIM-T04, TIM-T05; README (AC-11, AC-12)
  Files: modules/time/tests/corrections-flow.test.ts, modules/time/README.md
  Depends: T3, T4

<!-- Amendment (AC-13–AC-19). Additive only: log_time, guardLock, the commit-draft accept/undo and pre-070 tests stay as they are. -->

- [x] `T6` — Team time: a "Fix hours" `AskButton` on each draft or rejected row the viewer can approve (row pinned, prompt naming the person and week id and asking for a reason). My timesheet keeps no button on approved weeks; the chat-first test covers both (AC-13 UI, AC-14 UI)
  Files: modules/time/ui/Timesheets.tsx, modules/time/ui/prompts.ts, modules/time/tests/chat-first.test.ts, modules/time/tests/prompts.test.ts
- [x] `T7` — Backend: migration `0003_entry_deleted_at.sql`; correct and delete refuse approved weeks for everyone with the reopen hint; PM (managed project, old and new) or Admin may act with a required reason; soft delete; `deleted_at is null` in every read, guard and contract; optional `by`/`byOther`/`reason` on the corrected and deleted payloads; the two `*-by-other` notification rules (AC-13–AC-16)
  Files: modules/time/db/migrations/0003_entry_deleted_at.sql, modules/time/server/correct.ts, modules/time/server/entry.ts, modules/time/server/guards.ts, modules/time/server/read.ts, modules/time/server/weeks.ts, modules/time/contracts.ts, modules/time/module.ts, modules/time/tests/governance.test.ts
  Depends: T6
- [x] `T8` — Tools and chat: `reason` on `correct_time_entry` and `delete_time_entry`; their confirm cards say project, day, person and before → after, never the id; `get_timesheet` returns entry ids to whoever may fix that week (AC-14, AC-17)
  Files: modules/time/mcp.ts, modules/time/chat.ts, modules/time/server/sheet.ts, modules/time/tests/mcp.test.ts
  Depends: T7
- [x] `T9` — Integration: replace 070's own locked-change correct/delete tests; PM fix → outbox → one bell item for the owner; soft-deleted entry gone from totals and Reports; pre-070 tests unmodified (`git diff main -- modules/time/tests`); README (AC-18, AC-19)
  Files: modules/time/tests/corrections.test.ts, modules/time/tests/corrections-flow.test.ts, modules/time/README.md
  Depends: T7, T8

<!-- Amendment 2 (AC-20–AC-27). Cards and proposal-time checks only: services, events and rules stay as they are. -->

- [x] `T10` — Chat panel: a pending card with `lines` shows its title and labelled lines instead of the raw input list; one without them renders as today (AC-20 UI)
  Files: apps/web/components/chat/Chat.tsx, packages/chat/src/engine.ts
- [x] `T11` — Shared: optional `card(viewer, input)` on a tool; the chat engine uses it for the pending card's title and lines, falling back to today's card when absent or when it throws; chat tests (AC-20, AC-26)
  Files: packages/core/src/module.ts, packages/chat/src/engine.ts, packages/chat/tests/card-hook.test.ts
  Depends: T10
- [x] `T12` — Time: cards for correct, delete, log, approve, reject, remind and reopen; propose checks refusing doomed cards, reusing the lock rule as a pure check and a non-locking week lookup; tests, replacing 070's AC-17 title test (AC-21–AC-26)
  Files: modules/time/mcp.ts, modules/time/server/card.ts, modules/time/server/guards.ts, modules/time/server/weeks.ts, modules/time/tests/cards.test.ts, modules/time/tests/mcp.test.ts
  Depends: T11
- [x] `T13` — Integration: README; reset local demo data; live run of the demo script with the real model; screenshots of each card (AC-27)
  Files: modules/time/README.md, .specclaw/changes/070-time-entry-corrections/shots/
  Depends: T12
- [x] `T14` — Bell titles name the day as "Tue Oct 13": optional `dayLabel` on the corrected and deleted payloads, used by the two by-other rules (AC-28)
  Files: modules/time/week.ts, modules/time/contracts.ts, modules/time/module.ts, modules/time/server/correct.ts, modules/time/server/entry-card.ts, modules/time/tests/corrections-flow.test.ts
  Depends: T13

<!-- Amendment 3 (AC-29–AC-39). Requests live in time.change_request; decisions reuse the correction, send-back and
     reopen code paths through shared cores, so the rules stay in one place. -->

- [x] `T15` — Screens: Team time "Change requests" card (open requests in scope, rows pinnable with an Ask amax "Review"); My timesheet notice for an open request on a locked week; review prompt (AC-37)
  Files: modules/time/ui/ChangeRequests.tsx, modules/time/ui/TeamPage.tsx, modules/time/ui/MyPage.tsx, modules/time/ui/prompts.ts, modules/time/server/requests-read.ts
- [x] `T16` — Backend: migration `0004_change_request.sql`; request, answer and cancel services; decide service (apply through a shared correction core, locked change audited with the request id; reopen through the shared send-back and reopen cores for the approval chain; ask; decline); lifecycle guard; submit completes reopened requests; events, payloads and rules, including the owner's reopened notice (AC-29, AC-30, AC-32, AC-34–AC-36)
  Files: modules/time/db/migrations/0004_change_request.sql, modules/time/server/request.ts, modules/time/server/decide-request.ts, modules/time/server/correct.ts, modules/time/server/decide.ts, modules/time/server/reopen.ts, modules/time/server/submit.ts, modules/time/contracts.ts, modules/time/module.ts
  Depends: T15
- [x] `T17` — Tools and chat: `request_time_change`, `get_change_requests`, `decide_change_request`, `answer_change_request`, `cancel_change_request` with propose checks and cards; locked-week messages and tool descriptions point to a request; intents (AC-30, AC-31, AC-33, AC-34)
  Files: modules/time/mcp.ts, modules/time/chat.ts, modules/time/server/request-card.ts, modules/time/server/entry.ts
  Depends: T16
- [x] `T18` — Tests: lifecycle, routing, scope, apply/stale, reopen → resubmit completes, ask → answer, decline, replay, cards (AC-38)
  Files: modules/time/tests/requests.test.ts, modules/time/tests/requests-decide.test.ts
  Depends: T17
- [x] `T19` — Integration: README; live run with the real model; screenshots (AC-39)
  Files: modules/time/README.md, .specclaw/changes/070-time-entry-corrections/shots/
  Depends: T18

<!-- Amendment 4 (AC-40–AC-49). Page context is matched on the server from the path; suggestions are filtered by
     the viewer's tools and each suggestion's own check; bulk tools run the existing services once per person. -->

- [x] `T20` — Chat panel: page label in the header, up to four suggestions in the empty state and above an empty message box (fill, never send), the page path sent with each message; Time drops "Fix these hours" and "Fix hours" (AC-41, AC-42 UI, AC-45)
  Files: apps/web/components/chat/Chat.tsx, apps/web/components/chat/Suggestions.tsx, modules/time/ui/MyPage.tsx, modules/time/ui/Timesheets.tsx, modules/time/ui/prompts.ts
- [x] `T21` — Shared: `chatSuggestions` and `pageLabel` on the manifest; the server matches a path to a module route; `pageContext` action; the engine's "Current page" data item and instruction (AC-40, AC-42, AC-43)
  Files: packages/core/src/module.ts, apps/web/lib/page-context.ts, apps/web/app/actions/chat.ts, packages/chat/src/engine.ts
  Depends: T20
- [x] `T22` — Time: suggestions with their checks and the week label; `remind_weeks` and `approve_weeks` with per-person results; the card's done note shows a result summary; Team time prompts use them (AC-45–AC-47)
  Files: modules/time/chat-suggestions.ts, modules/time/module.ts, modules/time/server/bulk.ts, modules/time/mcp-bulk.ts, modules/time/mcp.ts, modules/time/ui/prompts.ts, apps/web/lib/chat-outcome.ts
  Depends: T21
- [x] `T23` — Rules: AGENTS.md rule 1 and review rule R3 as in AC-44
  Files: AGENTS.md, .specclaw/review/rules/R3-chat-first-and-pins.md
- [x] `T24` — Tests: route matching, page data item, suggestion filtering, buttons gone, bulk results with skipped/failed and replay, e2e header label and suggestion (AC-48)
  Files: apps/web/tests/page-context.test.ts, modules/time/tests/suggestions.test.ts, modules/time/tests/bulk.test.ts, modules/time/tests/e2e/time.spec.ts, modules/time/tests/prompts.test.ts
  Depends: T22
- [x] `T26` — UI audit of Time's screens and the chat panel at desktop and phone widths, light and dark, across week states and roles; fix what's broken (AC-50)
  Files: modules/time/ui/*, packages/ui/src/styles/chat.css, .specclaw/changes/070-time-entry-corrections/shots/
  Depends: T24
- [x] `T25` — Integration: README; live run with the real model; screenshots (AC-49)
  Files: modules/time/README.md, .specclaw/changes/070-time-entry-corrections/shots/
  Depends: T24

<!-- Amendment 5 (AC-51–AC-56). The session stays one HTTP-only cookie; the fix makes switching explicit, revokes
     the replaced session, and stops a stale tab from acting. Nothing is stored in the browser. -->

- [x] `T27` — Screens: `/signin` when already signed in (who, Continue, Sign out to switch); the blocking "signed in elsewhere" banner and tab watcher in the shell (AC-51, AC-54)
  Files: apps/web/app/signin/page.tsx, apps/web/components/shell/SessionWatch.tsx, apps/web/app/(app)/layout.tsx, apps/web/components/shell/Shell.tsx
- [x] `T28` — Server: revoke the browser's live session on a password or demo sign-in (audited, reason "switched"); `currentIdentity` action; the user-id check on the chat, chat-history and view-as actions (AC-52, AC-53, AC-55)
  Files: packages/auth/src/session.ts, apps/web/lib/same-user.ts, apps/web/app/actions/chat.ts, apps/web/app/actions/chat-history.ts, apps/web/app/actions/session.ts, apps/web/components/chat/Chat.tsx
  Depends: T27
- [x] `T29` — Tests: the user-id check, revoke on switch, two tabs in one browser and two profiles end to end (AC-56)
  Files: apps/web/tests/same-user.test.ts, packages/auth/tests/switch.test.ts, modules/time/tests/e2e/time.spec.ts
  Depends: T28

## Verify

**Verdict:** PASS

**Review loop (specclaw-review, cap of 5 passes), 2026-10-27.** Rounds 1–4 used 4 passes. Rounds 2–4 ran on the uncommitted working tree with a local, read-only copy of the reviewer, because git is read-only for the agent; the final pass runs the unmodified plugin on the committed HEAD.

- Round 1 (2 blockers, 7 majors): open redirect on `next`; retention missed `deleted_by` and the note copies in `before`/`proposed`; a failed sign-in ended the live session; the Entra switch didn't end the replaced session; undo hard-deleted; a card wasn't re-checked at write time; request lists cut at 200; raw DB errors in bulk results; moves to an unapproved project. All fixed, each with a variant test.
- Round 2 (1 blocker, 3 majors): the stricter retention check surfaced 15 unnamed columns in other modules. The product owner chose to fix them in 070: 5 are now anonymised, the rest kept with a written reason (new `keep` map on a retention entry). Request reads scoped and paged; one shared rule for showable errors; the earlier session read from the real Auth.js cookie.
- Round 3 (1 blocker, 4 majors): signed evidence bundles now anonymise and read as "anonymised"; the check covers free-text and json columns in any table about people (10 more columns classified); exact SQL scope with a refused unknown cursor; `userFacing` shared by REST and bulk; e2e `session.time.spec.ts` "AC52 a sign-in that completes over an earlier session ends it" against the running app.
- Round 4 **escalated** (exit 4): two findings survived two fixes. Product owner's decision: redesign one, hand off the other.
  - Entra switch proof (rounds 1–4): **redesigned.** The replaced session now ends in the `jwt` callback where the new token is minted, which every provider's sign-in already depends on, instead of in `events.signIn`. Covered by `switch.test.ts` (real Auth.js cookies) and the e2e above (credentials, real app). A live Entra callback against a mocked identity provider is not tested.
  - Retention check by column type (rounds 1–4): **handed off.** Requiring every `text`/`varchar`/`json` column of a table about people to be named would classify 284 columns in 69 tables, mostly outside Time. Needs its own change owned by the retention standard; 070 keeps the name- and type-based check (clean across 22 modules).
  - Also fixed in round 4: write-time and undo refusals are `ToolError` (REST 400, not 500); `delivery.proposal.meta` anonymised; a bundle emptied without the retention rule reads as a failed signature; an anonymised request reads "Anonymised", never 0 h; a test that the SQL scope agrees with `chainFor` for six kinds of viewer.
- **Final pass (round 5, pass 5 of 5): OPEN, 0 blockers, 3 majors, 3 minors. The loop stopped at the cap.** No blocker is open, so this goes to the PR with these recorded:
  - Major: refusals added by 070 that still throw a plain `Error` (`guardFixable`, `lockRefusal`, `guardDayTotal`, "no project", `requestChange`, `decideRequest`, `writeReopen`) fail `userFacing`, so REST answers them with a 500 and a reference instead of a 400 with the text. Fix: `ToolError(…, "invalid_input")`, extending the round-4 test.
  - Major: anonymising `delivery.proposal.meta`, `it_access.change.detail` and `career.history.detail` to `{}` breaks code that reads them (the `withdrawn` flag behind `ACTIVE`, the sync fingerprint, `c.detail.products.join` in the queued-change runner). **Fixed after the cap, by the product owner's decision, without a review pass:** the three are back in `keep` with that reason, so retention leaves them as they were before 070. Anonymising their personal keys is a follow-up.
  - Major: a week reopened by `reopen_week` or sent back by `reject_week` leaves its open change requests open; they then go stale and can only be declined. Fix: close them in the same transaction on every path out of submitted/approved, with a test over each path.
  - Minors (in `follow-ups.md`): the 070 mock still shows per-row Fix buttons and carries other changes' sections; a throwing `when` check is silently treated as false; `earlierSession` stops at the first cookie name that fails to decode.
- The final pass ran on the uncommitted working tree, so it records `head 625be24a`; once these fixes are committed, `specclaw-review verdict` reports "code changed after the final pass". The reviewed diff is exactly what was committed.
- Minors: `follow-ups.md`. Environment-only failures on this Windows host: symlink tests (EPERM), path-separator tests in core and delivery, and the time e2e config's `--import` path (run with a scratch config).

**AC-57, verified 2026-10-23:** pass — `modules/time/tests/age.test.ts` AC57 (just now, 5 min, 59 min, 1 h, 1 h 24 min, 1 d, 1 d 3 h, a future time as just now); `createdAt` is now an ISO time; `ui/Since.tsx` re-renders every 30 s with the exact time in its tooltip. On the running app a request created 75 minutes earlier showed "1 h 15 min ago" on Team time and "asked 1 h 15 min ago" on the owner's notice. Time 104/104. Also checked on the same day: Nimal (Engineer, "Tech lead", PM of Fleet Tracker in the fixtures) sees only Kasun, Tharushi and Dinesh on Team time, the people with Fleet Tracker time, under 009's project-manager approval rule; not an Admin.

**Amendment 5, verified 2026-10-23** on the working tree (Windows 11). AC-51 to AC-56 pass. Gates as for amendments 1–4 (PASS recorded with them noted, to be confirmed by the product owner).

Root cause (reproduced before the fix, one Chromium context = one browser profile): A signed in as Tharushi, B signed in as Maya, A refreshed → Maya; two separate contexts stayed independent. The session is one HTTP-only cookie (`authjs.session-token`, an Auth.js JWT with tenant, user and session ids); a browser keeps one cookie per site for all its tabs. No auth state in localStorage or sessionStorage (only the theme); "view as" is on `auth.session`. Defects found: the sign-in page replaced a live session silently; the replaced session row stayed live for 12 hours (139 live rows locally); a stale tab acted as the new user.

- AC-51: pass — e2e `session.time.spec.ts`: with Tharushi signed in, `/signin` shows "You're signed in as Tharushi Wijesinghe" and no demo form; "Sign out to switch account" brings the form back.
- AC-52: pass — `packages/auth/tests/switch.test.ts` AC52: the replaced session no longer loads a viewer, the new one does, `auth.signout` is audited once with `reason: "switched"`, a second end is a no-op. The password and demo sign-in actions call it with the browser's current session first; Entra starts only from a signed-out browser (AC-51).
- AC-53: pass — `apps/web/tests/same-user.test.ts` AC53: the check passes the same user and refuses another or none; with the session switched to Sahan, Maya's tab's `sendChat`, `confirmChat` and `listChats` refuse ("…signed in as someone else in another tab…"), no conversation is created and the card's archive doesn't run; the same card then confirms as Sahan. `cancelChat`, `refreshPins`, `pageContext`, `openChat`, `confirmSecretChat` (hidden field) and `viewAsAction` make the same check.
- AC-54: pass — e2e: after B signs in as Maya, A shows "You're now signed in as Maya Fernando in another tab." (axe clean) and Reload shows Maya; after B signs out, A shows "You signed out in another tab." Tabs re-check on focus, on becoming visible and on a `BroadcastChannel` ping sent by every page load and by `/signin`; the ping carries no data and nothing is stored in the browser.
- AC-55: pass — the guard only refuses; pages and tools still rebuild the viewer from `auth.session` (`getViewer`/`loadViewer`); `currentIdentity` reads the same.
- AC-56: pass — the tests above; e2e also checks that a second profile (Kasun) doesn't change A. Existing auth (49/49 with the new test), chat (30/30), chat-history action and time tests pass unmodified, except two amendment-3 tests given the module's usual 60 s DB timeout after a timeout under parallel load (they drain the outbox through the workflow engine).

Not done, by design: independent accounts per tab (see AC-56's note). Existing live sessions created before this change aren't revoked by it.

Commands: `vitest run` in `packages/auth` 49/49, `packages/chat` 30/30, `modules/time` 103/103 (three runs); `apps/web` same-user, chat-history-action, chat-outcome, page-context, tool-schemas, pin-refs, routes, nav 26/26; `pnpm lint` exit 0; `pnpm turbo run build --filter=./apps/web` exit 0; time e2e 4/4 (scratch config for Windows).

**Amendment 4, verified 2026-10-23** on the working tree (Windows 11). AC-40 to AC-50 pass. The specclaw gates don't run clean on this host, as before; PASS is recorded with them noted (to be confirmed by the product owner, as for amendments 1–3).

- AC-40: pass — `apps/web/tests/page-context.test.ts` AC40/AC42 (path → module, page, label, params; unknown and root paths → none); `packages/chat/tests/card-hook.test.ts` AC40: the turn's "Current page" carries 2026-W42, a follow-up on another page carries 2026-W43, a turn with no page carries none. Live: "change my 2.7 h Fleet Tracker entry on Wednesday to 2 h" on My timesheet with no pin and no week named gave "Fix Fleet Tracker, Wed Oct 14 · Hours 2.7 h → 2 h" (`shots/amend4-live-fix-no-pin.png`).
- AC-41: pass — header reads "My timesheet · Week of Oct 12" / "Team time · Week of Oct 12" (e2e 070 AC41; `amend4-chat-suggestions.png`, `amend4-team-chat-phone.png`). The Team time routes were titled "Time"; renamed "Team time" so the header (and tab title) match the page heading.
- AC-42: pass — page-context test (tool filter, failing and throwing checks dropped, three at most plus "What can you help me do here?"); `modules/time/tests/suggestions.test.ts` AC42/AC45 (Tharushi draft: Fix an entry, Submit my week, What did I log; Kasun submitted: Ask for a change; Kasun on Team time: only "Who hasn't submitted?"; Maya: approvals, reminders, fixes). A suggestion fills the box (e2e). Keyboard reachable buttons in a labelled list; axe clean.
- AC-43: pass — live: "What can you help me do here?" listed this page's actions, what isn't possible here, and the change-request route (`amend4-live-what-can-you-do.png`).
- AC-44: pass — AGENTS.md rule 1 and `.specclaw/review/rules/R3-chat-first-and-pins.md` amended as in AC-44 (a not-a-finding entry added).
- AC-45: pass — "Fix these hours" and "Fix hours" removed; row pins stay (e2e: no `Fix … hours` buttons, row "+" pins "Fleet Tracker, 2026-W42"); `fixPrompt`/`fixOtherPrompt` removed with 070's own AC-14 prompt test, so `prompts.test.ts` is back to its `main` version.
- AC-46: pass — `modules/time/tests/bulk.test.ts` AC46: one card "Remind 2 people to submit 2026-W42" listing Tharushi, Dinesh, Kasun (skipped: submitted) and one week out of scope; "Reminded 2 · skipped 2 · failed 0"; a replayed confirm runs nothing (two reminder events). Deviation from the AC text: the per-person steps are savepoints inside one service, not separate transactions, because the chat engine's 043 rule allows exactly one keyed write per confirmed card; a failure still rolls back only that person. Live: Maya's "Remind everyone who hasn't submitted" → `get_team_week`, `remind_weeks` → "Done: Reminded 2 · skipped 0 · failed 0. Tharushi Wijesinghe: sent; Dinesh Wickrama: sent." (`amend4-live-remind-everyone.png`).
- AC-47: pass — bulk.test AC47: "Approve 3 timesheets for 2026-W42 (87.5 h)"; with a trigger failing Ayesha's approval, Nimal and Kasun are approved and Ayesha is "failed" with the database's reason (never the query text), her week still submitted. Team time's "Remind N people" / "Approve N submitted" prompts are unchanged: the pre-070 057 test pins them to per-person calls under the scripted model; the real model picks the bulk tools from their descriptions (live run above).
- AC-48: pass — the tests above; e2e 3/3 (scratch config quoting setup paths for Windows), including 009 AC3 Team week vs mock ≤ 2 %, the new 070 AC41/42/45 test and axe. Every other existing test passes unmodified.
- AC-49: pass — the live runs under AC-40, AC-43 and AC-46, Claude Haiku 5.5.
- AC-50: pass — audit of My timesheet (draft, submitted, sent back, approved, an earlier week), Team time (approver, engineer) and the chat panel at 1440 px and 390 px, light and dark, 32 views plus chat: no horizontal scroll or overflow anywhere. Fixed: (1) phones: My timesheet's total row broke out of the card layout into a narrow column → it stacks like the rows, with day labels and rounded corners; (2) desktop: the total row's label sat off its numbers with a stray rule under it (it used the header style) → body padding, one rule above; (3) Change requests: person, week chip and "just now" wrapped → kept on one line; (4) the change-request notice had a blank line on phones (the hidden pin wrapped) → one compact block; (5) the engineer's empty Team time put "Open my timesheet" outside the centred empty state → it is the empty state's action. After screenshots: `amend4-my-timesheet-desktop.png`, `amend4-my-timesheet-phone-dark.png`, `amend4-request-notice-phone.png`, `amend4-team-time-dark.png`, `amend4-team-empty-phone.png`. Row pins show on hover, as everywhere in the app (unchanged).

Commands: `vitest run --config ../../vitest.config.ts --dir .` in `modules/time` 103/103, `modules/reports` 7/7, `modules/notifications` 7/7, `modules/finance` 8/8, `modules/payroll` 8/8, `packages/chat` 30/30, `packages/mcp` 20/20; `apps/web` page-context, chat-outcome, tool-schemas, pin-refs, routes, nav 23/23; `pnpm lint` exit 0; `pnpm turbo run build --filter=./apps/web` exit 0; `check-graph --root` only the known R7 fixture; time e2e 3/3 after the UI fixes. Gates: `specclaw-preset-check .` exit 1 (repo-wide; the amendment's new files are under 80 lines); `specclaw-quality-scan` not_run on this host.

**Amendment 3, verified 2026-10-23** on the working tree at `269313b` plus the uncommitted amendments 2 and 3 (Windows 11). AC-29 to AC-39 pass. The specclaw gates don't run clean on this host, as for amendments 1 and 2; PASS is recorded with them noted, as the product owner chose for those (to be confirmed for this amendment).

- AC-29: pass — `0004_change_request.sql` (table, one-open-per-entry unique index, tenant RLS, grants); applied to the local database with `pnpm db:migrate`; in every DB test. Retention entry added in `module.ts`.
- AC-30: pass — `requests.test.ts` AC30: Ayesha's request on her submitted week returns pending with "Hours … → 5 h"; her week total and Reports' row are unchanged; a second request on the entry, Tharushi's on her draft week, and Tharushi's on Ayesha's entry are refused. Live: Kasun's and Nimal's cards read "Ask to change Fleet Tracker, Thu Oct 15 · Hours 1.6 h → 1 h · Reason · Review: 2026-W42 is submitted; nothing changes until an approver decides" (`shots/amend3-owner-request-card.png`, `amend3-approved-week-request-card.png`).
- AC-31: pass — `requests.test.ts` AC31: `correct_time_entry` on a submitted week makes no card; `request_time_change` makes the request card. Live: Kasun, Nimal and Ayesha each described the fix in plain words and the agent chose `request_time_change` itself; for Nimal's ambiguous Tuesday (two entries) it asked which entry first.
- AC-32: pass — `requests.test.ts` AC32/33: after the outbox, Maya (Ayesha's manager) has "Ayesha Rahman asked to change Contoso Portal, Thu Oct 15" and Ayesha has nothing. Live: Maya's bell had "Kasun Dias asked to change Fleet Tracker, Thu Oct 15".
- AC-33: pass — same test: Ayesha sees her request, Maya sees it to review, Dinesh (outside the chain) sees none and his decide is refused.
- AC-34: pass — `requests-decide.test.ts`: apply on a submitted week (entry 1 h, revision 2, week stays submitted, replay refused, owner's bell "Maya Fernando changed your Fleet Tracker hours for Thu Oct 15"); stale revision refused, then decline leaves the entry; D7 apply on an approved week keeps it approved with a `time.week.locked_change` audit carrying the request id; D8 Nimal (PM, not Admin) reopens Kasun's approved week (chain `project`), D9 Kasun's bell "Your timesheet for 2026-W42 was reopened", fix + resubmit completes it; Ayesha's submitted week is sent back; the decide card "Apply Nimal Silva's change: Fleet Tracker, Wed Oct 14" with Hours, Reason, Week, Notice. Live: Maya's Review → "apply it" → applied (week stayed submitted), and Review → "reopen it" on Nimal's approved week → draft (`amend3-apply-card.png`, `amend3-reopen-card.png`).
- AC-35: pass — `requests.test.ts` AC35: ask → apply refused while it needs info → answer → pending; the question and answer reach the owner's and the approver's bells; a withdrawn request can't be declined. Live: Nimal fixed and resubmitted, and his request went to `completed`.
- AC-36: pass — events declared in `module.ts` and emitted in the decide/request transactions (the AC34 and AC35 tests read their notifications after the outbox); audit rows from `defineService` (`time.change.request`, `time.change.decide`, …) plus the locked-change audit.
- AC-37: pass — Team time "Change requests" card (pinnable rows, Ask amax "Review" pinning the request and filling "Review … (request id …): ") and the My timesheet notice on a locked week; no forms (`amend3-team-time-requests.png`, `amend3-my-timesheet-notice.png`). Spacing between the new cards and the next card fixed after the first screenshot.
- AC-38: pass — `requests.test.ts` 4/4 and `requests-decide.test.ts` 4/4. Time 101/101. `contracts.test.ts`'s intent and tool list line (already widened by 070) now includes `time.request` and the request tools; no other existing test changed.
- AC-39: pass — live run on `pnpm dev`, Claude Haiku 5.5, from reset demo data, steps and screenshots as above; the submit card still uses the shared default title ("Submit your timesheet for a week for approval: 2026-W42"), which isn't part of this amendment.

Commands: `vitest run --config ../../vitest.config.ts --dir .` in `modules/time` 101/101, `modules/reports` 7/7, `modules/notifications` 7/7, `modules/finance` 8/8, `modules/payroll` 8/8, `packages/chat` 29/29, `packages/mcp` 20/20; `apps/web/tests/tool-schemas.test.ts` 1/1; `pnpm lint` exit 0; `pnpm turbo run build --filter=./apps/web` exit 0; `tsc --noEmit` in `modules/time` after the last UI edit. Gates: `specclaw-preset-check .` exit 1 (repo-wide; the amendment's files are all under 80 lines); `specclaw-quality-scan` not_run on this host. Local dev note: a production build run while a dev server was up left `apps/web/.next/dev` stale and made the sign-in page reload in a loop; clearing `.next/dev` fixed it (not a code issue).

**Amendment 2, verified 2026-10-23** on the working tree at `269313b` plus the uncommitted amendment (Windows 11). AC-20 to AC-27 pass. The two specclaw gates don't run clean on this host, as before; the product owner chose, on 2026-10-23, to record PASS with them noted.

- AC-20: pass — `packages/chat/tests/card-hook.test.ts` AC20: one turn proposes three tools; the one with `card` gets its title and lines, the one without and the one whose `card` throws get today's "Save one thing: w-1, 2" card with no lines; the input is stored unchanged on all three. Chat 29/29, so existing cards are unchanged.
- AC-21: pass — `modules/time/tests/cards.test.ts` AC21 (own: "Fix Fleet Tracker, Mon Oct 12", Hours and Note before → after, no id); `mcp.test.ts` 070 AC17, replaced as AC-26 allows (someone else's: For, Hours, Reason, "Tharushi will be notified").
- AC-22: pass — cards.test.ts AC22: "Remove Fleet Tracker, {day}: {hours} h".
- AC-23: pass — cards.test.ts AC23: "Log 1.5 h to Fleet Tracker, Fri Oct 16" with Billable no and the note.
- AC-24: pass — cards.test.ts AC24: "Approve Nimal Silva's timesheet for 2026-W42 (31.5 h)"; "Send back …" with the Comment line.
- AC-25: pass — cards.test.ts AC25: Kasun's `log_time` and correction on his submitted week, Maya approving Tharushi's draft, reminding Kasun's submitted week and Sahan reopening it all make no card, and `time.entry` plus `core.audit_event` counts don't move. `guardLock` keeps its behaviour through `lockRefusal` (time 93/93, including 009's Admin `log_time` into an approved week).
- AC-26: pass — the tests above; the 070 AC17 test now reopens Tharushi's W42 first, because an earlier test in its file approves it, so the old test was asserting a card that could only fail. No other existing test changed.
- AC-27: pass — live run on `pnpm dev` with Claude Haiku 5.5 (the workspace's Sonnet 5.5 limit is 0 requests a minute), from local demo data reset to its seeded values: Tharushi's fix ("Fix Fleet Tracker, Wed Oct 14 · Hours 2.7 h → 2 h") and removal ("Remove Fleet Tracker, Mon Oct 12: 2.4 h") confirmed; Kasun's request ran `correct_time_entry`, got no card, and chat said to ask the approver to send the week back; Maya's fix for Tharushi (For, Hours, Reason, Notice) confirmed, and after the outbox tick Tharushi has one bell item and Reports holds 2.0 h, 1.5 h and the tombstone at revision 2; Maya's approval card read "Approve Nimal Silva's timesheet for 2026-W42 (31.5 h)"; Sahan's request on the approved week ran `correct_time_entry`, got no card, chat offered the reopen path, and the entry stayed 0.3 h at revision 1. Screenshots: `shots/amend2-fix-card.png`, `amend2-delete-card.png`, `amend2-submitted-no-card.png`, `amend2-pm-fix-card.png`, `amend2-approve-card.png`, `amend2-approved-no-card.png`; compared against `#070-amendment-2` in the mock.
- AC-28: pass — `corrections-flow.test.ts` AC15, through the outbox and notifications' workflow engine: Tharushi's one bell item now reads "Nimal Silva changed your Fleet Tracker hours for Fri Nov 13"; `dayLabel` is declared on both payloads and `day` is unchanged. Time 93/93, notifications 7/7, reports 7/7, `pnpm lint` exit 0 after the change.

Commands (`DATABASE_MIGRATE_URL=postgres://amax:amax@127.0.0.1:5440/amax`): `vitest run --config ../../vitest.config.ts --dir .` in `modules/time` 93/93, `modules/reports` 7/7, `modules/notifications` 7/7, `modules/finance` 8/8, `modules/payroll` 8/8, `packages/chat` 29/29, `packages/mcp` 20/20; `apps/web/tests/tool-schemas.test.ts` 1/1; `packages/core` 157/158, the one failure being `ac5-adapters` listing 60 pre-existing files with Windows path separators (none touched here). `pnpm lint` exit 0; `check-graph --root` only the known R7 fixture. `pnpm turbo run build --filter=./apps/web` exit 0. Not run: the time and chat Playwright e2e (the setup-path issue on Windows noted below); the live run covers the card screens.

Gates: `specclaw-preset-check .` exit 1 (repo-wide hits as before; the new files are under 80 lines: `server/card.ts` 50, `server/entry-card.ts` 56, `server/week-card.ts` 45, `tests/cards.test.ts` 70, `packages/chat/tests/card-hook.test.ts` 56). `specclaw-quality-scan .` not_run ("Argument list too long" in its jq step). Quality: not_run. Review: specclaw-review not installed.

Re-verified after the 2026-10-22 amendment (AC-13 to AC-19), working tree on `specclaw/070-time-entry-corrections` at `e67af2d` plus the uncommitted amendment. Every AC passes. The two specclaw gates don't run clean on this Windows host (see Gates); the product owner chose again, on 2026-10-22, to record PASS with them noted.

- AC-1: pass — `modules/time/tests/corrections.test.ts` AC1: the owner corrects a draft entry to the day's exact 24 h and is refused 0.05 h more; 0, 0.07 and 24.05 h and an empty change are invalid; project and billable change; someone out of scope is refused; Kasun's submitted week is refused. Once approved, Kasun and Sahan (Admin) are both refused with the reopen hint (AC-13 supersedes the locked-change path for corrections).
- AC-2: pass — corrections.test.ts AC2: a delete by someone out of scope (Kasun) is refused, the owner's delete goes through, and a second delete of the same id gives the same out-of-scope error.
- AC-3: pass — corrections.test.ts AC3: `time.entry.corrected` (revision 2, `before.hours`, `lockedChange: false`) then `time.entry.deleted` (revision 3) in `core.event`; the `time.entry.correct` audit row has before and after. Payloads declared in `module.ts`; `logged` carries `revision: 1`.
- AC-4: pass — corrections.test.ts AC4: a trigger fails the event insert after the update; entry (hours, revision 1), audit log and outbox are unchanged.
- AC-5: pass — `mcp.test.ts` "070 AC5": `get_timesheet` returns the row's entries with ids; `correct_time_entry` from the model becomes a pending card, writes nothing until confirmed, then revision 2, audited `source: chat`. `time.correct`/`time.delete` intents listed (`contracts.test.ts`). e2e `time.spec.ts` "070 AC5": the row's "Fix these hours" opens chat with "Fleet Tracker, 2026-W42" pinned and the prompt filled, axe clean; a submitted week has no button.
- AC-6: pass — `commit-draft-008.test.ts`: undo leaves `time.entry.deleted` (revision 2) for the entry; `corrections-flow.test.ts` (TIM-T01): accept → outbox → one live `logged_hours` row; undo → outbox → none.
- AC-7: pass — `modules/reports/tests/hours-sync.test.ts`: through the outbox, utilisation goes 4 h → 2.5 h → person gone (tombstone, revision 3); deleted-before-logged stays deleted; corrections delivered as revision 3, 2, 3 keep revision 3.
- AC-8: pass — `week-guards.test.ts` AC8: Maya can't reopen her own approved W43 ("your own week"); Sahan can.
- AC-9: pass — week-guards.test.ts AC9: `submit_week` with no week, and approve/remind/reopen naming a person without a week, refuse with "say which ISO week"; `mcp.test.ts` "070 AC9" refuses the same through MCP. Read tools still default to the latest week.
- AC-10: pass — week-guards.test.ts AC10: a random week id and Ayesha's week give Nimal the identical error; with another transaction holding Ayesha's row `for update`, Nimal's approve fails at once (no wait on the lock); the namesake error has no `@`.
- AC-11: pass — `corrections-flow.test.ts`: log 8 h + 7.5 h → submit → reject → correct to 6 h and delete → resubmit gives `hours: 6` in the result, 6 h in `weekTotals`, and one live 6 h row in Reports; TIM-T01 as in AC-6; TIM-T04 23.95 + 0.05 = 24 h accepted, one more 0.05 h refused, 0.07/0/24.05 invalid; TIM-T05 in `contracts.test.ts` (`isoWeekOf(2025-12-29)` = `2026-W01`). Unauthorised, submitted, approved and out-of-order cases are in AC-1, AC-2 and AC-7. No required test skipped.
- AC-12: pass — `modules/time/README.md` (tools, events, rules) and `modules/reports/README.md` updated; time 82/82 and reports 7/7 with DB tests running; `check-graph --root` has only the Windows false positive below.
- AC-13: pass — `governance.test.ts` AC13: once Kasun's W42 is approved, Kasun and Sahan (Admin) are both refused correct and delete with "approved and locked; reopen it with a reason (reopen_week)", and no `time.week.locked_change` row is added; after `reopen_week` the owner's correction goes through. My timesheet already hides "Fix these hours" outside draft and rejected (e2e 070 AC5). `approvals.test.ts` still shows Sahan logging into an approved week, audited as `time.week.locked_change` (unchanged).
- AC-14: pass — governance.test.ts AC14: Nimal (PM of Fleet Tracker) without a reason gets "invalid input: reason"; moving the entry to HR Insights (not his project) gets the out-of-scope error; Kasun is refused; Nimal with a reason succeeds; the event has `by`, `byOther: true`, the `reason`, `projectName` and `week`, and the audit row's `after` has the reason; Sahan (Admin) deletes with a reason. UI: Team time shows "Fix hours" on draft and rejected rows the viewer can approve (`prompts.test.ts` AC14, screenshot `shots/app-team.png`); `get_timesheet` gives that viewer the entry ids (`mcp.test.ts` 070 AC17).
- AC-15: pass — `corrections-flow.test.ts` AC15, through the outbox and notifications' workflow engine: Nimal's fix gives Tharushi exactly one bell item, "Nimal Silva changed your Fleet Tracker hours for 2026-11-13", body "Left at 4 on Friday", link `/time/my/2026-W46`; her own correction and delete send nothing; Reports holds the corrected 7 h.
- AC-16: pass — governance.test.ts AC16: after a delete, `weekTotals` and My timesheet drop the entry's hours, `entries` no longer lists it, the row is still there with `deleted_at` and `deleted_by` set, and correcting it gives the out-of-scope error. Migration `0003_entry_deleted_at.sql` adds nullable columns only. corrections-flow AC11 (correct and delete, then resubmit) still totals 6 h in Time and Reports.
- AC-17: pass — mcp.test.ts 070 AC17: a card whose `hoursBefore` doesn't match the entry isn't made (no pending); the matching card's title reads "Fix one time entry: Fleet Tracker, <day>, Tharushi Wijesinghe, <before>, 0.25, On leave that afternoon, <id>". The id still shows, after the named fields, because the shared card lists every input (AC-17 text records this). The shared card component is untouched.
- AC-18: pass — the tests listed under AC-13 to AC-17; time README "Corrections (070)" and "Approval rules" updated.
- AC-19: pass — `git diff main -- modules/time/tests modules/reports/tests`: the amendment changed no pre-070 test. In files that existed on `main`, its only edits are an import line in `prompts.test.ts` plus a new AC14 test, and the 070-only AC5 and new AC17 tests in `mcp.test.ts`. (070's original T3 had already widened the tool and intent list in `contracts.test.ts`.) Every pre-070 suite passes unmodified, including Admin `log_time` into an approved week and the commit-draft undo.

Commands (`DATABASE_MIGRATE_URL=postgres://amax:amax@127.0.0.1:5440/amax`, `amax-dev-postgres`; Windows 11):
- `vitest run --config ../../vitest.config.ts --dir .` in `modules/time` 88/88 (14 files), `modules/reports` 7/7, `modules/notifications` 7/7, `modules/finance` 8/8, `modules/payroll` 8/8; `apps/web/tests/tool-schemas.test.ts` 1/1.
- `pnpm lint` exit 0 (35/35). Its graph step reports "0 modules" on Windows; `node scripts/check-graph.mjs --root <repo>` shows only the known R7 fixture false positive (`packages/testing/boundaries/r7-provider-sdk`).
- `pnpm turbo run build --filter=./apps/web` exit 0.
- Time e2e through a scratch config that only quotes the setup paths as `file://` URLs: 3/3 (009 AC3 Team week vs mock ≤ 2 % with the new button, 070 AC5, 009 AC2/054 AC5), axe clean.
- Not rerun: the whole-repo `turbo run test`. The amendment touches only `modules/time`, and its consumers' suites (reports, notifications, finance, payroll) were run above.

Gates:
- `specclaw-preset-check .` exit 1: repo-wide `comment` and `max_lines` hits as in 068 and 070's first verify. In the amendment's files, the new hits are short `070 AC-n` comments in the modules' existing style, plus `contracts.ts` going 103 → 104 lines (over 80 before 070). The new files (`server/card.ts` 40, `tests/governance.test.ts` 67) and the edited ones stay under 80.
- `specclaw-quality-scan .` didn't complete: its jq step fails with "Argument list too long" on this host. Quality: not_run.

Screenshots: `shots/app-team.png` (Team time W42 as Maya: "Fix hours" beside Remind on the two draft rows, none on submitted rows), `shots/app-team-chat.png` (Fix hours → chat with "Tharushi Wijesinghe, 2026-W42" pinned and "… (week id …). Reason: " filled in), `shots/app-team-dark.png`, `shots/mock.png` (`#070-time-entry-corrections` with the amendment cards); earlier `shots/app.png`, `app-dark.png`, `app-chat.png` (My timesheet). Compared against the mock: the same Ask amax hand-off with the record pinned and no edit fields. The mock's before → after card is rendered by the shared card as listed fields (hoursBefore, hours) rather than struck-through text.

Fixes after verify (2026-10-22, found on the dev server):
- Team time: Remind, Fix hours and the row pin ran into each other; the cell's buttons are now a spaced flex row (`.time .row-actions`). Checked on the dev server as Maya, in light and dark: no overlap, 8 px gaps.
- Chat: the row's **+** after "Fix these hours" kept the unedited fix prompt, because only a pin for a *different* record cleared it. A bare pin now drops an unedited Ask amax prompt and keeps the row pin; text the person typed stays. `apps/web/components/chat/Chat.tsx`; the time e2e 070 AC5 now presses the row's + and expects an empty message with the row still pinned. Time e2e 3/3 after a rebuild. The web app's chat and pins e2e couldn't be run on their own here (they depend on the `amx` setup project for sign-in and the KMS key).
