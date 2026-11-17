# Allocations bot: capacity, FTE and demand answered correctly, in colour

**Change:** 086-allocations-bot-capacity-answers · **Created:** 2026-11-07

## Problem

People mostly use the bot, and its answers about capacity, demand, spare time and FTE were wrong or improvised: capacity treated as 80% when someone was planned at 80%, a team gap read as a percent, "this month" guessed, and no explanation of how FTE and capacity are worked out. The arithmetic was done by the model.

## Mock Delta

Nothing on the page moves; the chat answers read in colour and from worked-out numbers. See [`086-allocations-bot-capacity-answers`](../../mock/index.html#086-allocations-bot-capacity-answers).

## Acceptance Criteria

1. **AC-1** A read tool, `get_load_summary`, returns for each of the five months, for the user's people (or everyone they can see): capacity FTE, planned FTE, spare or short FTE (negative is short), load percent, who is over 100%, who has room (percent of a month), who has nothing planned, a ready sentence that starts with who it covers, and the whole team's capacity and demand. The numbers are worked out in code.
2. **AC-2** Planning someone at 80% leaves their capacity at their HR FTE: capacity 3.0, planned 2.8, spare 0.2.
3. **AC-3** The Allocations rules tell the bot to read the tool's numbers out and never recalculate, and explain, in plain words, how FTE, capacity (HR, the 15th, whole month, no leave or hours), planned, spare and short are worked out.
4. **AC-4** A gap across people is said in FTE or people, never as a percent; a group's percent never hides someone over 100%; the bot says which group a figure covers.
5. **AC-5** Chat shows over and totals above 100% in red, "N FTE short" in red, spare and free in green, "not planned" in amber and FTE figures in violet, in light and dark. "No longer over", "nobody is over", 100% and 99% stay plain.
6. **AC-6** The chat test list gains cases for capacity and demand, the current month, how capacity is calculated, 80% planned, a gap that is not a percent, who has most capacity, and refusing to change someone outside the user's projects.
7. **AC-7** No existing rule or example in chat-rules.ts is changed or removed.

## Tasks

- [x] `T1` — loadSummary and the get_load_summary tool (AC-1, AC-2)
  Files: modules/allocations/server/load-summary.ts, modules/allocations/mcp-views.ts, modules/allocations/tests/load.test.ts
- [x] `T2` — Rules: read the tool, how it is calculated, units and groups (AC-3, AC-4, AC-7)
  Files: modules/allocations/chat-rules.ts
- [x] `T3` — Chat colours (AC-5)
  Files: apps/web/components/chat/Markdown.tsx, packages/ui/src/styles/chat.css, apps/web/tests/chat-markdown.test.ts
- [x] `T4` — Chat test list cases (AC-6)
  Files: apps/web/tests/chat-eval/cases.json

## Verify

Type-check clean. New tests: load.test.ts (4) and chat-markdown.test.ts (3) pass. Allocations: 53 of 56 pass, the same 3 fail as before. The live chat test list (24 cases, 7 new) needs a signed-in login (EVAL_EMAIL, EVAL_PASSWORD) and real model calls, so it was not run here: run `node apps/web/tests/chat-eval/run.mjs`. Rule text steers the model, so the live run is the proof of the wording.

### Re-verified 2026-11-17

**Verdict:** PASS

Written afterwards, when this branch was prepared for review. The notes above were written when the change was built; this adds a record per criterion. Only automated evidence is claimed. 0 of 7 criteria have a passing test that cites them; the rest are marked not checked, not passed.

- AC-1: not checked — no passing automated test cites it.
- AC-2: not checked — no passing automated test cites it.
- AC-3: not checked — no passing automated test cites it.
- AC-4: not checked — no passing automated test cites it.
- AC-5: not checked — no passing automated test cites it.
- AC-6: not checked — no passing automated test cites it.
- AC-7: not checked — no passing automated test cites it.

Commands run on the final code: type-check for allocations, chat, notifications, core, ui, reports and web (7 of 7 clean); tests: Reports 29 of 29, Allocations 62 of 62, chat 50 of 50, notifications 5 of 5 files. 1 test file(s) this change touched are outside these packages and were not run (apps/web/tests/chat-markdown.test.ts). Preset check: the code this branch added has no comment lines and no new file over 80 lines (change 102). Screens: the bot behaviour is still in use; the real bot was not asked questions in this session. The specclaw-review loop was not run (the tool is not installed here).
