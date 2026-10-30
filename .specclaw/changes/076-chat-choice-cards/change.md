# Chat choice cards

**Change:** 076-chat-choice-cards · **Created:** 2026-10-25 · **Review:** covered-by 073-time-workflow-enhancements

## Problem

When a request fits more than one write ("change Wednesday to 6 h" on a day with two entries), amax answers with a
paragraph listing the alternatives. The person types which one they mean, and only then gets a confirm card: two extra
steps for something amax already knew exactly.

Approved by the product owner, 2026-10-25: "build it in the current branch end to end", after the choice card was
proposed in chat ("only for choice-based descriptions").

**Amendment 1, 2026-10-25** (product owner, after "Change Monday's Contoso Portal hours to 7" on an approved week came back
as text: "build A end to end"): a choice whose writes all need one short value only the person can type (a reason) fell
back to text, because a card can't be made without that value. AC-9 to AC-12 cover it.

## Mock Delta

What changes on screen, and where to see it: [`076-chat-choice-cards`](../../mock/index.html#076-chat-choice-cards)

In chat, alternatives that are each a write show as one **choice card**: a question, one option per write (its figure and
what it changes), "Something else…", and one button named for the chosen option's action. After a choice it folds to the
usual one-line receipt; the options not chosen are dropped.

## Acceptance Criteria

1. **AC-1** The model has one more tool in chat, `offer_choices` (question, 2–4 options, each a write tool and its input).
   The instructions say to use it instead of listing alternatives in text when each alternative is a write, and to use
   plain text when they aren't writes or something must be asked.
2. **AC-2** Each option is checked as a single write call is: the tool exists for the viewer and is a write, its input
   passes the tool's schema, it has a declared service, it takes no typed secret, and its `propose` check passes. An option
   that fails is left out and the model is told why. Two or more left: one choice card. One left: an ordinary confirm
   card. None: no card, and the model is told why.
3. **AC-3** The options are ordinary pending cards that share a `choice` (`id`, `question`, and the option's `label`),
   each with its own trace step and idempotency key. Confirming one runs only that write, and the others are recorded as
   not chosen. Two options of one choice can never both run: before an option runs, the other options' keys are claimed
   as cancelled, and an option whose sibling has already run or is running is refused as cancelled.
4. **AC-4** Cancel on a choice card cancels every option. A conversation reopened from history shows an undecided choice
   card again, as one card.
5. **AC-5** The card (`ChoiceCard.tsx`): the eyebrow "Choose · {kind}", the question, one radio option per write with its
   figure and subject (or its label), and "Something else…", which writes nothing and puts the cursor in the chat box.
   The button is named for the chosen option's action (its `look.confirm`, red when destructive) and stays disabled
   until an option is picked. "Nothing is saved until you confirm." It folds to the chosen option's receipt.
6. **AC-6** Keyboard-complete (a radio group; arrow keys move between options), labelled for screen readers, light and
   dark themes, and full-width buttons at phone width. Axe finds nothing.
7. **AC-7** Tests: AC-2's filtering (a refused option is dropped; one left becomes a plain card; none makes no card);
   AC-3's exclusivity (confirm one, the other is refused; a concurrent second confirm never writes twice); AC-4's cancel.
   Every existing chat test passes unmodified.
8. **AC-8** A live run with the real model: Tharushi, with two Fleet Tracker entries on one day, says "Change Wednesday
   to 6 h" and gets one choice card; picking an option and confirming changes only that entry.
9. **AC-9** `offer_choices` takes an optional `ask` (`field`, `label`, e.g. `reason`, "Why is this entry wrong?"). Each
   option leaves that field out; it is checked as before with a stand-in value for the field, and its card leaves out
   the stand-in line. With `ask`, even a single remaining option stays a choice card, so the box is still there. The
   instructions say to use `ask` instead of asking for such a value in text.
10. **AC-10** The card shows a labelled text box for it under the options. The button stays disabled until an option
    is picked and something is typed; number keys don't pick options while typing, and Enter in the box confirms.
11. **AC-11** On confirm the typed value reaches only the server action. The server adds it to the chosen option's
    input, checks the tool's schema and its `propose` check again, and only then claims the other options and runs. An
    empty or invalid value keeps the card open with the reason ("type … first", or what doesn't fit), and nothing runs
    or is cancelled. A check that now refuses closes the card as failed.
12. **AC-12** Tests: an `ask` option is carded without the field and without a stand-in line; confirm without a value
    and with a too-short value is refused and leaves every option open; with a value, the write gets it and the other
    option is dropped. Live with the real model: on an approved week, "Change Monday's Contoso Portal hours to 7" gives
    one choice card with a reason box, and sending it creates a change request with that reason.

## Tasks

- [x] `T1` — The choice card in chat: grouping, radio options, "Something else…", receipt (AC-5, AC-6)
  Files: apps/web/components/chat/ChoiceCard.tsx, apps/web/components/chat/Chat.tsx, packages/ui/src/styles/chat.css
- [x] `T2` — `offer_choices`: option checks, grouped pending cards, instructions (AC-1, AC-2)
  Files: packages/chat/src/choices.ts, packages/chat/src/engine.ts
- [x] `T3` — One option wins: sibling keys claimed before a run; cancel cancels the group (AC-3, AC-4)
  Files: packages/chat/src/engine.ts
- [x] `T4` — Tests and a live run with the real model (AC-7, AC-8)
  Files: packages/chat/tests/choices.test.ts, .specclaw/changes/076-chat-choice-cards/change.md
  Depends: T1, T2, T3
- [x] `T5` — The ask field: offer, confirm with the typed value, the card's box, tests and a live run (AC-9 to AC-12)
  Files: packages/chat/src/choices.ts, packages/chat/src/engine.ts, apps/web/app/actions/chat.ts, apps/web/components/chat/Chat.tsx, apps/web/components/chat/ChoiceCard.tsx, packages/ui/src/styles/chat.css, packages/chat/tests/choices.test.ts

## Verify

**Verdict:** PASS
- AC-1: pass — `offer_choices` is in every chat turn (`choices.ts`); `CHOICE_INSTRUCTIONS` is appended to the model's instructions. Live, the model used it for "Change Wednesday to 8 h" and "… to 6 h". When only one write fits ("down to 5 h") it made one confirm card, and when nothing needed changing it answered in text.
- AC-2: pass — `choices.test.ts`: an option over 24 h is left out with the tool's own reason passed to the model; one left becomes a plain card; none makes no card; the tool's chip is hidden.
- AC-3: pass — `choices.test.ts`:
  - after one option is confirmed, the other is refused as cancelled, and only one write ran;
  - two confirms at once write at most once;
  - the other options' keys are claimed as cancelled before a run (`claimChoice`).
- AC-4: pass — cancel cancels all three options (`decided` has 3 cancelled), and a later confirm is refused. Reopened conversations restore `pending`, which `Chat.tsx` groups by `choice.id`.
- AC-5: pass — `ChoiceCard.tsx`, live: "Choose · Fix hours", the question, the shared "Fleet Tracker · Wed Oct 14" once, and one row per option. "Something else…" focuses the chat box. The button is disabled ("Pick an option") until a choice, then reads "Save the fix · 0.7 h". The receipt reads "✓ Saved the fix · Fleet Tracker, Wed Oct 14".
  - Product owner during the build, "make it interactive":
    - number keys 1–4 pick an option, and Enter on the picked radio confirms;
    - the picked option is highlighted and expands to show the details its label doesn't already state;
    - each option shows a key hint;
    - the button carries the picked figure;
    - while saving, the chosen option shows a spinner and the others dim;
    - motion only runs without reduced motion.
- AC-6: pass — a radio group with arrow keys; axe (wcag2a/aa, 21aa, 22aa) is clean on the chat panel in light and dark. At phone width the buttons are full width and the key hints are hidden.
- AC-7: pass — `packages/chat/tests/choices.test.ts` (4 tests); chat 35/35; web 317/317; time 141/141; `pnpm lint` ok; build ok; time e2e 9/9.
- AC-8: pass — live with the real model.
  - Tharushi: "Change Wednesday to 8 h" gave three options. Picking "0.7 h → 2.7 h" changed only that entry (5.3 + 2.7).
  - "Change Wednesday to 6 h" gave two options. Key 2 and Enter changed only her entry back to 0.7 h, so the data is as it was found.
  - Not shown live: the preview with extra details (For, Reason, Notify) on someone else's entry. In two tries as Maya, the model chose a single card and then asked for details, so no choice card appeared.
- Screenshots: choice-light/dark/picked/done.png and choice2-open/picked/dark/phone.png in the session scratchpad (`ui/`).

Amendment 1 (2026-10-25):
- AC-9: pass — `offer_choices` takes `ask { field, label }`.
  - Options are checked with a stand-in value, then stored and carded without the field, its fields entry or the stand-in line (`withoutStandIn`).
  - With `ask`, a single remaining option stays a choice card.
  - The instructions tell the model to use `ask` for such a value instead of text.
- AC-10: pass — `ChoiceCard.tsx` shows a labelled box ("Why is this entry wrong?").
  - Live: picked with no answer, the button read "Type your answer" and was disabled.
  - Digits typed in the box didn't change the pick.
  - With an answer, the button read "Send request · 1.3 h", and Enter in the box sent it.
- AC-11: pass — `confirmChat(…, answer)` → `confirmAction(…, { answer })` → `withAnswer` adds the value, checks the schema and then `propose`, and only then runs `claimChoice` and the write.
  - Test: missing, blank and too-short answers are refused as retry and leave both options open; a valid answer reaches the write trimmed, and the other option is then refused.
- AC-12: pass — `choices.test.ts` AC12.
  - Live with the real model, as Nimal (2026-W42 approved): "Change Monday's Contoso Portal hours to 7" gave one choice card with the reason box.
  - Sending "I logged a client call twice" on "Your entry: 2.3 h → 1.3 h" created `time.change_request` (correct, pending, 2.3 → 1.3, with that reason).
  - Axe is clean in light and dark.
- During the build, the picked option's preview was indented to the figure column (it wrapped to four lines in the narrow chat).
- Checks: chat 36/36 and web 317/317 (353 together); `pnpm lint` ok; build ok; time e2e 9/9.
- Screenshots: ask-open.png, ask-filled.png and ask-dark.png in the session scratchpad (`ui/`).

Amendment 2 (2026-10-25; product owner: "remove the scroll bar in the chat bot and the text area, I need it to look clean"):
- Scrollbars are hidden on the conversation, the history list, the message box and a choice card's answer box. They still scroll by wheel, trackpad, touch and keyboard.
- The answer box no longer has a resize grip; it grows up to 140 px.
- A wide table in a reply keeps its sideways bar, since it's the only sign of more columns.
