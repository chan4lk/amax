# Chat quick replies, first used to pick a proposal's project

**Change:** 084-chat-quick-replies · **Created:** 2026-11-05 · **Review:** covered-by 081-proposals-end-to-end

## Problem

When chat needs an answer it can't guess, it asks in text. The New proposal flow without a project shows this
(product owner's run, 2026-11-05):
- **No buttons.** Chat listed CON, FLT and HRI as text, and the person had to type a key.
- **The wrong list.** It listed every active project, not the ones the person works on.

Chat's only clickable answers are 076's choice cards, and their options are writes. A project picked on one would
create the proposal at once and skip 081's "Who owns it?" step.

**Decided by the product owner, 2026-11-05:** quick-reply buttons, a reusable chat feature, chosen over a project
choice card or a shorter text list.

## Mock Delta

What changes on screen, and where to see it: [`084-chat-quick-replies`](../../mock/index.html#084-chat-quick-replies)

In chat, a question with a few known answers shows them as buttons under amax's reply. One click sends that answer, as
if typed. First use: "Which project?" for a new proposal, listing the person's own projects.

## Acceptance Criteria

1. **AC-1** Chat gets a tool, `offer_answers`. Its input is a question and 2 to 6 short answers, each at most 60
   characters.
   - **When to use it:** the instructions say to use it instead of listing answers in text, when a question has a
     few known answers that aren't writes (for example, which project).
   - **It writes nothing.** It isn't counted among the turn's tools, and it's never a card.
2. **AC-2** The turn returns `answers` (question and options), and chat shows them as buttons under amax's reply, in a
   group named by the question.
   - **A click** sends that answer as the person's next message, exactly as if they had typed it.
   - **Typing something else** still works.
   - **The buttons go away** once any next message is sent, and a reopened conversation doesn't show them again.
   - **Accessibility:** keyboard-complete, and axe clean.
3. **AC-3** Delivery's `list_projects` takes `mine: true`: active projects the viewer manages or is assigned to.
4. **AC-4** A new proposal with no project pinned or named asks "Which project?" with quick replies.
   - **The answers:** the person's own projects (`list_projects` with `mine`), up to six, as "<KEY> · <Name>".
   - **With exactly one of their own** (revised 2026-11-05, decided by the product owner): that project and
     **"Another project"**. One click covers the usual case and nothing is picked for them. "Another project", or
     having none of their own, lists the active projects they may add proposals to, up to six.
     The end-to-end run showed the alternatives:
     - **Claude asked in a sentence,** "Add it to Contoso Portal?", which needs typing and has no buttons.
     - **Claude listed every active project as buttons,** which shows other people's projects.
   - **Where it lives:** `create_proposal`'s description and the New proposal flow both say so, so it holds after the
     first turn (081 AC-82 found that the flow's notes reach the first turn only).
   - **Then** 081's owner step follows as before.
5. **AC-5** Tests:
   - **Units:** `offer_answers` (its limits, nothing written, not in `toolsRun`), a turn returning `answers`,
     `list_projects` with `mine` for a PM and an engineer, and the instructions.
   - **Browser:** a scripted test-only prompt makes chat offer answers; clicking one sends it as the next message and
     the buttons go. Axe passes.

### Added in build (2026-11-05): chat knows today's date

Found by the product owner's run. "Log 2 hrs for Contoso Portal today" came back with quick replies for each day of the
week. The model was never told the date, so "today" meant nothing to it, and AC-1 turned that blind question into
buttons. Before 084 it was the same question in text.

6. **AC-6** Every chat turn tells the model the user's date now, with its weekday.
   - **The time zone:** the user's legal entity's (UTC when unknown), the rule Time logs days by.
   - **The instruction:** work out "today", "yesterday", "this week" and weekday names from it, and never ask for a
     date given that way.
7. **AC-7** `offer_answers`' instructions say never to offer answers to something the user already said or that the
   model can work out (a day called "today", a project named or pinned).
   - **Tests:** the date note in a turn's instructions (fixed clock, UTC), and the instructions' wording.

## Tasks

- [x] `T1` — Chat UI: answer buttons under amax's reply; a click sends the answer; they go after the next message (AC-2)
  Files: apps/web/components/chat/Chat.tsx, packages/ui/src/styles/chat.css
- [x] `T2` — `offer_answers` in the chat engine: the tool, its instructions, `answers` on the turn (AC-1)
  Files: packages/chat/src/answers.ts, packages/chat/src/engine.ts, packages/chat/src/index.ts, packages/chat/tests/answers.test.ts
  Depends: T1
- [x] `T3` — Delivery: `list_projects` takes `mine`; New proposal asks "Which project?" with quick replies (AC-3, AC-4)
  Files: modules/delivery/mcp.ts, modules/delivery/chat.ts, modules/delivery/tests/chat-084.test.ts
  Depends: T2
- [x] `T5` — Chat knows today's date in the user's zone; quick replies never ask what's already known (AC-6, AC-7)
  Files: packages/chat/src/engine.ts, packages/chat/src/answers.ts, packages/chat/tests/answers.test.ts
- [~] `T4` — Browser test with a test-only scripted rule; the Linux CI replica (AC-5)
  Files: packages/ai/src/scripted-writes.ts, packages/ai/src/scripted.ts, packages/ai/tests/scripted-writes.test.ts, apps/web/tests/e2e/chat.spec.ts
  Depends: T3

## Verify

Covered by 081's review loop (`covered-by 081-proposals-end-to-end`); its work is in commit `5ddc6561`.

**Linux replica of CI** over `5ddc6561`:
- **Passed:** install, migrate, lint, module standard, build, `e2e` (8) and `e2e:auth` (95, including "084 quick replies").
- **Unit tests:** pass for this change; the five load timeouts in that run pass alone (recorded in 081).

**With real Claude** (081's end-to-end run, 2026-11-05):
- **Which project?** came with quick replies.
- **"Log 2 h today on Contoso Portal"** wasn't asked which day.
- **Which proposal?** came with quick replies and None.

**Review (2026-11-07):** covered by 081-proposals-end-to-end's loop over the whole stack against `upstream/main`. Its final
pass (round 6) ran at `0bbdd63c`, after this change's commits, with 0 blockers. It stopped at the five-pass cap with two
081 majors open; none is in this change's files. See 081's `## Verify`. **Linux replica of CI** over `0bbdd63c`: every
step passes (35/35 packages, e2e 9, e2e:auth 95).
