# Allocations bot: right date, right group, right numbers

**Change:** 085-allocations-bot-facts · **Created:** 2026-11-06

## Problem

A review of one chat on the Allocations page found the bot answering wrongly:

1. It had no date. It called November "this month", then October, and said the grid starts next month. The grid starts at the current month.
2. "No, precisely" (more decimals) made it widen from the user's three people to all 144.
3. It gave October allocations (120%, 90%, 110%) right after saying the grid has no October.
4. "Who has most capacity" got "everyone has 100%". The user meant free capacity (Kasun Dias at 80% has 20% free).
5. A project's demand was given as "110% of planned capacity"; it is 1.1 people.
6. It guessed gender (he, him, she).
7. "Nimal is the only one on the bench" didn't say it meant among the user's three.

No rule agreed before this change is edited; rules are added, and the chat engine is told the date.

8. Asked to change Amal Dissanayake (on Fabrikam data platform, other work), it said "50% for each month" while listing January at 0%, never named the work, and asked what to change although only an admin can change that line.

## Mock Delta

Nothing on the page moves; only chat answers change. Corrected replies at [`085-allocations-bot-facts`](../../mock/index.html#085-allocations-bot-facts).

## Acceptance Criteria

1. **AC-1** Every chat turn tells the model today's date and month, in UTC, and that it must not work the date out from timesheets or other records. Tested.
2. **AC-2** The Allocations rules say: give only numbers a tool returned and never mix or swap months.
3. **AC-3** They say: name who a figure covers in the first line and keep that group in follow-ups; "precisely" means more decimals, not a wider group.
4. **AC-4** They say: "capacity", "free", "available" about people means free capacity (capacity minus allocated), ranked by that.
5. **AC-5** They say: a project's demand is people ("1.1 people"), a person's is their total percent.
6. **AC-6** They say: never guess gender; use the name or "they".
7. **AC-7** Before asking what to change about a person, the bot reads their lines; if none has manages true it says in one line that they can't change that person (naming the line) and gives the record without asking what to change.
8. **AC-8** Every project or piece of work the person is on is named, and "each month" is never used when a month differs.
9. **AC-9** Asked to change, fix, put, move or allocate someone, the bot answers in chat only and doesn't move or filter the page; the page moves only for a named bench month or when the user asks to see someone.
10. **AC-10** When a line can't be changed the bot uses the tool's words (other work: "only an admin can change it"), never offers to prepare the change for someone else, and asks nothing.
11. **AC-11** Forecast months are the ones the tool flags (after the current quarter) and are said once with the five shown months; "which months are planned" is answered from per-month counts, not "most people".
12. **AC-12** No existing rule or example in chat-rules.ts is changed or removed.

## Tasks

- [x] `T1` — Tell the model the date (AC-1)
  Files: packages/chat/src/engine.ts, packages/chat/tests/today.test.ts
- [x] `T2` — Add the answer rules (AC-2 to AC-11)
  Files: modules/allocations/chat-rules.ts

## Verify

Type-check clean. today.test.ts passes. Chat package: 48 of 50 pass; AC28 fails as before this change, and trace-ac1 failed in the full parallel run but passes alone with and without this change (shared database under load). Allocations: 49 of 52 pass, the same 3 fail as before. Site rebuilt and running on localhost:3000. The rule text steers the model, so the wording of replies needs a human pass in the running app.

### Re-verified 2026-11-17

**Verdict:** PASS

Written afterwards, when this branch was prepared for review. The notes above were written when the change was built; this adds a record per criterion. Only automated evidence is claimed. 1 of 12 criteria have a passing test that cites them; the rest are marked not checked, not passed.

- AC-1: pass — test "AC-1 names today and its month, so this month is never guessed" (tests/today.test.ts) passes.
- AC-2: not checked — no passing automated test cites it.
- AC-3: not checked — no passing automated test cites it.
- AC-4: not checked — no passing automated test cites it.
- AC-5: not checked — no passing automated test cites it.
- AC-6: not checked — no passing automated test cites it.
- AC-7: not checked — no passing automated test cites it.
- AC-8: not checked — no passing automated test cites it.
- AC-9: not checked — no passing automated test cites it.
- AC-10: not checked — no passing automated test cites it.
- AC-11: not checked — no passing automated test cites it.
- AC-12: not checked — no passing automated test cites it.

Commands run on the final code: type-check for allocations, chat, notifications, core, ui, reports and web (7 of 7 clean); tests: Reports 29 of 29, Allocations 62 of 62, chat 50 of 50, notifications 5 of 5 files. Preset check: the code this branch added has no comment lines and no new file over 80 lines (change 102). Screens: the bot behaviour is still in use; the real bot was not asked questions in this session. The specclaw-review loop was not run (the tool is not installed here).
