# Allocations: Take action shows the record, and a PM can't change other people's lines

**Change:** 117-allocations-take-action-record · **Created:** 2026-11-06

## Problem

When a person presses Take action on an Allocation check suggestion, amax opens chat with a message that includes "The Allocation check suggests Contoso Portal to 40%". The person should see only the current record (who, month, total, every project and its percent) and decide for themselves.

A project manager who looks at Everyone and asks amax to fix or change someone on another manager's project gets offered a change. They should be told plainly that they can't change that person, and be given the information instead.

## Mock Delta

Nothing on the page moves; only chat wording changes. See the two messages at [`117-allocations-take-action-record`](../../mock/index.html#117-allocations-take-action-record).

## Acceptance Criteria

1. **AC-1** The Take action message names the person, the month with its year, the total and every project with its percent that month, and names any other project of theirs with nothing planned that month ("Fleet Tracker not planned"), then asks "What would you like to do?". It never states the check's suggested percent.
2. **AC-2** The check's suggested change still reaches the model as context, so "fix it" about that person still makes one allocate card.
3. **AC-3** The bot's Allocations rules (chat-rules.ts) are unchanged by this change: nothing agreed before it is altered.
4. **AC-4** The tool refusal for a change outside the user's projects tells the model to give that record as information after saying so.
5. **AC-5** Changes on projects the user manages work as before (the confirm card, the "Are you sure?" step over 100%).

## Tasks

- [x] `T1` — Take action message without the suggestion (AC-1, AC-2)
  Files: apps/web/app/actions/chat.ts, apps/web/lib/take-action.ts
- [x] `T3` — scopeCheck refusal says to give the record as information (AC-4)
  Files: modules/allocations/server/overcheck.ts

## Verify

Type-check clean (npx tsc --noEmit in apps/web). Allocations tests: 49 pass, the same 3 fail as before this change. Site rebuilt and running on localhost:3000. chat-rules.ts is back to its pre-change text.

### Re-verified 2026-11-17

**Verdict:** PASS

Written afterwards, when this branch was prepared for review. The notes above were written when the change was built; this adds a record per criterion. Only automated evidence is claimed. 0 of 5 criteria have a passing test that cites them; the rest are marked not checked, not passed.

- AC-1: not checked — no passing automated test cites it.
- AC-2: not checked — no passing automated test cites it.
- AC-3: not checked — no passing automated test cites it.
- AC-4: not checked — no passing automated test cites it.
- AC-5: not checked — no passing automated test cites it.

Commands run on the final code: type-check for allocations, chat, notifications, core, ui, reports and web (7 of 7 clean); tests: Reports 29 of 29, Allocations 62 of 62, chat 50 of 50, notifications 5 of 5 files. Preset check: the code this branch added has no comment lines and no new file over 80 lines (change 124). Screens: the Take action wording is still in use; no browser check was made in this session. The specclaw-review loop was not run (the tool is not installed here).
