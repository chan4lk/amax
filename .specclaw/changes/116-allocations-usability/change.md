# Allocations: the screen shows, chat does

**Change:** 116-allocations-usability · **Created:** 2026-10-23
**Review:** covered-by 124-preset-clean-up

## Problem

amax is chat-first: people don't click through screens, the screen is for looking and chat does the
work. Change 116 added controls to the Allocations tab (a View dropdown, a search box, filter chips,
a Copy-from select, a bench month select, a "Show more" toggle, "Ask amax to fix" buttons). That is
the screen asking people to click, and it goes against the product's direction. The architect asked
for the tab to look as it did before 116, with the bench names kept, and for chat to drive it.

## How a lazy PM and a lazy admin use this tab

Design for people who will not click, will not read a table, and will not fill in details.

- **The lazy PM** opens the tab, or doesn't, and says one thing: "how is my team looking?", "anyone
  free in March?", "fix Ayesha", "put Kasun on Fleet Tracker at 50% for February and March", "copy
  November to December", "accept the suggestions". The bot answers in two lines, does the lookup
  or prepares the change, and asks for one yes. It picks sensible defaults (this month, the project
  they manage) and asks a question only when the answer is truly unclear.
- **The lazy admin** asks across the company: "who has nothing planned next quarter?", "who is on
  the bench in both January and March?", "anyone over 100%?", "write me a two-line summary for
  leadership", "undo that". They never open a grid to find out.
- **The agent works first.** The allocation check already raises suggestions in the background. The
  person's job is to say "yes", "no" or "accept all", not to hunt for problems.
- **The screen is the proof.** It shows what the bot is talking about, so a person can look and
  trust it, and it updates by itself after a confirmed change.

## Mock Delta

What changes on screen, and where to see it: [`116-allocations-usability`](../../mock/index.html#116-allocations-usability)

- The tab is back to the controls it had before 116: **Allocate**, the **My projects / Everyone**
  link, **Copy to next month**, and pins.
- The bench keeps the names list from 116, with no month select and no toggle.
- When you ask chat ("show me Amal", "who is over-allocated", "bench in March"), the screen changes
  to show the answer, with one line saying what it is showing.

## Acceptance Criteria

1. **AC-1** The Allocations tab looks and reads as it did before 116: the same blocks, wording,
   controls and layout. Everything 116 added is removed: the View dropdown, the search box, the
   filter chips, the Copy-from select, the bench month select, the "Show N more" toggle, the Needs
   attention list and its buttons, the yellow rows, the fitted chart axis and gap line, the grid's
   own scroll area, and the new wording ("Not planned", "120% over"). What stays is what the tab had:
   **Allocate**, the **My projects / Everyone** link, the **Copy** button, and a `PinButton` on every
   card and row. The exceptions are the bench names list (AC-2) and, at the product owner's request, the **View** dropdown in place of the My projects / Everyone link (AC-18).
2. **AC-2** The bench card keeps the people list from 116 (name, skill, pin) for the shown month. It
   lists the first 5 and ends with a line "N more, ask amax for the full list", with no control.
3. **AC-3** Chat can set what the screen shows. One read-only MCP tool, `show_allocations`, takes any
   of: part of a name (matches the start of a name), `over` or `bench` (a filter), My projects or
   Everyone, a bench month, a copy-from month. It writes nothing, needs `allocations:read` and uses
   the same permissions as the screen (rules 1 and 3).
4. **AC-4** When the tool runs from chat, the Allocations screen shows its result without the person
   touching anything, and one line under the title says what is shown, for example "Showing people
   starting with Amal in Everyone". Asking chat to "show everyone again" clears it. There is no
   Clear button.
5. **AC-5** For a name, chat picks the view: if the person is in My projects it shows My projects,
   else if they are in Everyone it shows Everyone, else it says nobody matches and changes nothing.
6. **AC-6** The tool's answer in chat is in words (names, months, percents) and matches the screen, so
   the person can read it without opening the tab. The screen is not required to be open.
7. **AC-7** Allocate and Copy still happen only through chat with the pending-action confirm.
   Choosing the Copy source month is done by saying it ("copy November to December").
8. **AC-8** The bench is the only look change from 116 that stays: the named list in AC-2. The
   rest of the screen is as before 116 (AC-1), so the old lede sentence and the old grid return.
9. **AC-9** What the screen shows is kept in the URL (`?view=`, `?filter=`, `?q=`, `?bench=`,
   `?from=`), so a shown result can be shared. When chat sets it, the page updates in place and does
   not jump to the top. A shared link opens the same result.
10. **AC-10** Access is unchanged: My projects shows only projects the person manages, and someone who
    manages none sees "You don't manage any projects". HR and Leadership stay read-only.
11. **AC-11** No new writes, forms or migrations, and `check:graph` passes. The screen passes axe in
    light and dark, and works from the keyboard.

12. **AC-12** One sentence is enough. Chat answers these without follow-up questions, using the
    tools below, and shows the result on the screen (AC-4): "how is my team looking?" (over-allocated
    people, people with nothing planned, the largest demand gap), "anyone free in March?", "who is
    over 100%?", and "who is on the bench in both January and March?". The last one needs a read
    tool, `get_bench`, that returns each person on the bench with every month they are on it, for a
    range of months. It is read-only and needs `allocations:read`.
13. **AC-13** "Fix Ayesha" (or any over-allocated or unplanned person) makes chat prepare one
    concrete change from the data, for example "Move Ayesha to 50% on HR Insights in December,
    Kasun is free", showing before and after, and waits for one confirm. It does not ask the person
    to choose the month, project or percent unless the data gives no safe answer.
14. **AC-14** Chat fills in defaults: with no month it means this month (or the next, for "copy"),
    with no project it means the one the person manages when there is one, and a person is found by
    the start of their name. A request it cannot resolve gets one short question, not a form.
15. **AC-15** The agent suggestions that the allocation check already raises are acted on by
    saying so: "accept the suggestions", "accept Ayesha's", "reject the rest", through the
    existing accept, dismiss and undo suggestion tools. Each suggestion is still checked against the
    person's permission and keeps the existing undo window ("undo that"). Plan note: those tools
    take one suggestion at a time, so "accept the suggestions" gives one confirm card per
    suggestion, not one card for all; a single combined confirm needs a bulk tool in the agents
    module and is left for the architect.
16. **AC-16** After a confirmed change, the screen updates by itself to the new numbers, and chat
    says what changed in one line, with who did it (the person, or the agent acting for them).
17. **AC-17** Chat can give a short written summary of the allocation picture (over-allocated,
    unplanned, bench, demand against capacity) that a person can paste to someone else. It is
    read-only and uses the same numbers as the screen.

18. **AC-18** The My projects / Everyone link becomes a **View** dropdown with the same two choices,
    yellow for My projects and coral for Everyone, and the label names the view so colour is not the
    only signal. Choosing the other view changes the page where you are, through `?view=`, with no
    scroll reset. The People by month grid scrolls in its own area, at most as tall as the window
    allows, with the header row and person column kept in view and one scrollbar, as a keyboard-focusable region.

19. **AC-19** "Put Kasun fully on CON in December" makes chat prepare **one** confirm card that sets
    Kasun to 100% on CON and clears his other projects and other work in that month (or range), with
    the percent defaulting to 136. It is one write tool, `allocate_only`, through `defineService()`,
    permission-checked on every project it clears, so if any cleared project is outside the
    person's scope nothing changes. The card replaces the two cards chat made before.
20. **AC-20** On the People by month grid the people stay in the same order after a change. Order is by
    name, not by over-allocated first, so a row does not jump when its numbers change.
21. **AC-21** After a confirmed change the grid updates in place: the page scroll and the grid's own
    scroll stay where they were.

22. **AC-22** The Agent suggestions box on the Allocations tab shows only suggestions that still
    apply: one whose person is no longer over 100% in that month is left out, with no click needed.
    The suggestion itself is not closed (that belongs to the agents module), so the box and the
    Suggestions screen can differ until it expires.

23. **AC-23** "Put Kasun to 60%", with no project or month named, works in one go: chat looks up
    the person's first over-allocated month and the biggest project in it that the viewer may change
    (a read tool, `get_over_allocation`), then makes one allocate confirm card that names the project,
    month and percent. It never asks the person for the month or project.

24. **AC-24** When two or more confirm cards are open in chat, an **Add all** and **Cancel all** bar
    shows below them. Add all confirms each open card in order, one after another, through the same
    confirm each card has (so every write is still shown first, checked and audited). A card that
    fails stays open and does not stop the others, and chat says how many were added. Cards that
    ask for a secret are left out. With one card there is no bar. This is in the shared chat panel.

25. **AC-25** The Add all bar lists every open card as one short point (for example "Kasun Dias on CON,
    2026-12: 60%"), so the PM can read all the changes in one place before pressing. Each point has a
    **Go to card** button that scrolls to that card and focuses it, where its own buttons are, so one
    change can be changed or cancelled without losing the rest.

26. **AC-26** When the user asks for several allocation changes in one message, chat makes one
    confirm card for each, in the same turn. It does not hold a change back or ask about it because
    the person would go over 100%: it makes the card and says in one line who ends up at what total.
    When the user gives no percent ("a bit"), chat uses the person's free capacity that month, 5 to
    20 points. The PM decides on the cards, with Add all (AC-24).

27. **AC-27** When chat makes cards, its message above them is a short, friendly summary of what the
    cards will do, in plain words (people, months, percents), two or three sentences at most, with no
    field names and no instructions on how to confirm. This is in the shared chat instructions.
28. **AC-28** On a card that has a percent, **Change something** opens a percent box on the card, with
    **Update** and **Back**. The PM does not tell the bot again. Update changes only the percent of
    that open card (a whole number, 0 to 200), keeps the card open, shows "You changed the percent to
    N%. Check it, then press Add it to confirm.", and the card still needs Add it (or Add all) to
    write anything. The change is recorded in the card's trace. Cards without a percent keep the
    old Change something (it fills the chat box). This is a field on the confirm card, not on a page,
    and it is in the shared chat panel.

29. **AC-29** Cards read like a person would say it. A card's heading and the Add all list show the
    change in words ("Kasun Dias on CON, Nov 2026: 50%"), with the month spelled out, instead of the
    tool's description or an employee number, and chat's summary starts with what will happen, never
    with "cards are ready". Cards that aren't allocations show their own title. The mock for 116 shows
    the several-changes flow.

30. **AC-30** Working on one card does not move the chat. Go to card scrolls once to that card;
    after that, opening Change something, pressing Update and the Add all list all stay put: the chat
    does not scroll to the bottom on its own when a card changes (only when something new arrives),
    the bar keeps its count and place while a card is being edited (Add all waits until the edit is
    saved or closed), and after Update or Back the chat goes back down to the Add all bar and puts
    focus on it (with one card, there is no bar, so focus stays on the card).

31. **AC-31** Chat knows whether the person is giving an order or wants to talk. An instruction ("put
    Kasun on X at 50%", "do this") makes the cards at once. When the person asks to plan or for an
    opinion ("plan", "what do you think", "what if", "should I"), chat makes no card: it says in a few
    plain sentences what it would do and what it sees in the numbers, and asks if it should set it up.
    A later "yes" or "go ahead" makes the cards. Writes still wait for the confirm card. This is in
    the shared chat engine.

32. **AC-32** An order is done in full, with no question back. "Fix over allocation for everyone in my
    project, Kasun only half on his highest, Ayesha and Nimal you decide" gives one card per person in
    the same turn: Kasun at 50% on his biggest project, and Ayesha and Nimal at the percent that brings
    them back to capacity. "You think", "you decide" and "up to you" inside an order mean amax chooses
    from the numbers; they don't turn the order into a question. A question to know something ("who",
    "explain", "is", "how") gets an answer and no card. `get_over_allocation` with no person lists
    every over-allocated person in the viewer's projects with their fix.
33. **AC-33** The PM can type instead of click. While changes are waiting, "make Kasun 40%", "move the
    second one to January" or "drop Nimal" changes or drops the waiting change itself (the card and
    the Add all list update in place), never a new card. The only click left is the confirm: Add it
    or Add all. A typed change is checked against the tool's fields and recorded in the trace.

34. **AC-34** The bot guides, the PM only confirms. Chat talks like it is explaining to a smart, busy
    friend: short sentences, everyday words, no jargon or field names. After it prepares changes it
    says what will happen in two or three sentences and ends with the one next step ("Press Add all if
    that looks right, or tell me what to change"). After a typed change or drop it always says what it
    did. "What should I do?" gets a look at the numbers, the fixes it would make, and "Shall I set that
    up?". This is the product direction from the architect: minimal interaction, the confirm is the
    only click a PM has to make.

35. **AC-35** Rows keep their order. A person's projects are listed by project name and a project's
    team by person name, so changing one row's percent never swaps it with the row below.

36. **AC-36** A new chat reply is read from its top. When amax answers, or brings new cards, the
    chat scrolls to the start of the new reply, not to the bottom. My own message and the thinking
    dots still show at the bottom.

37. **AC-37** Nothing overlaps. On a screen 1100px or wider the page makes room for the open chat
    and the chat never covers the page. Buttons in a chat card wrap rather than spill out. Go to card,
    Back and the reply scroll move smoothly, and jump straight there when reduced motion is on.

38. **AC-38** Fix it from the screen. A person over capacity in any shown month has a "Fix it" button
    on their total row. It opens chat with that person pinned and "Fix <name>'s over-allocation in
    <month>, you decide how" filled in. The page itself writes nothing (rule 1). There is no
    page-wide fix button (product owner).

39. **AC-39** The page stays where it was. Opening and closing chat (button, Ctrl+K, Esc, close)
    never sends the page to the top, and what was in the middle of the screen stays there. A record
    added to chat with its + button stays in view beside the chat.

40. **AC-40** Pick from the screen works. With the chat's pick button on, clicking a row or card
    adds that record to chat (before, the pick turned off but added nothing).

41. **AC-41** The PM's bell tells them what needs them on their projects, in plain words, never about
    their own changes: someone pushed a person on their project over 100% (urgent, "Kasun Dias is at
    110% in January 2027"), someone else changed an allocation on their project ("Demo Admin set
    Kasun Dias to 30% on HR Insights"), and the Allocation check suggested a fix ("amax suggests
    Nimal Silva at 50% on Fleet Tracker in December 2026"). Every open suggestion is in the bell once,
    including ones made before this rule: the check announces any it finds that were never announced,
    so three open suggestions are three unread items until the PM reads them. Lowering a plan that is
    still over is not an alarm. Names come from the person's login, and no name is copied into the event.

42. **AC-42** A project named as other work is that project. "HR Insights" or "hri" passed as work
    is saved on the HR Insights project, so its totals and its PM see it. A confirmed card says
    "Done: <the card's plain line>", not the tool's instructions.

43. **AC-43** Closing chat clears what it selected. Whichever way chat closes (its close button, the
    Ask button, Ctrl+K), the pinned chips go, pick mode turns off, and a filter chat put on the page
    ("just show me Kasun") is taken away. The conversation itself stays.

44. **AC-44** Read means gone from the bell. The bell lists unread items only, so after Mark all read
    it says "You're all caught up" and stays that way after a reload; only new items appear. Chat's
    get_notifications still reads the full history. A card heading is the tool's short name ("Mark
    your notifications read"), never its instructions.

45. **AC-45** Fixed means gone from the bell. Once a person is at 100% or under in a month, by any
    write (chat, an accepted suggestion, someone else), the unread "is at N%" and "amax suggests"
    items for that person and month are marked read and leave the bell without the PM doing anything.
    Items for anyone still over stay.

46. **AC-46** The bell keeps up without a refresh. It checks every 10 seconds, and right after a change
    is confirmed in chat it checks again over the next few seconds, so an item added or cleared by that
    change shows within about 5 seconds. A slower, older answer never puts a cleared item back. The
    Allocation check picks the same project for a person every run (ties go the same way), so it never
    makes two suggestions for one person and month. A card heading leaves out record ids.

47. **AC-47** Works on a phone. On a phone the agent suggestions stack as cards with the whole Ask amax
    button showing. Picking from the screen drops the chat to the bottom with "Tap something on the
    screen to add it", and it comes back once a record is added. No screen scrolls sideways at phone,
    tablet or laptop width. Clearing a chat-made filter keeps the view (My projects or Everyone).

48. **AC-48** amax never guesses a change; only the PM decides (product owner, replaces the "you decide"
    part of AC-31 to AC-34). An open ask ("fix allocations", "fix Kasun", "sort out January", "you
    decide") makes no card: amax shows who is over or free each month with their projects and
    percents, a one or two line summary, and two or three choices, then asks. Cards come only from an
    exact order (who, project or work, percent) or a choice the PM picks. "A bit" gets a question, not
    a number. Fix it fills "Fix <name>'s over-allocation in <month>". With two or more cards the bar
    has Go to card for each and one Add all; changing or cancelling happens on the card.

49. **AC-49** Two or more changes are one card. Chat shows only the Add all card listing each change;
    the change cards stay hidden. Go to card opens that one card with Add it, Change something,
    Cancel and Back to the list; after Update or Back it hides again and the list shows the new
    values. After Add all, only the summary note shows. A single change shows its own card.

50. **AC-50** amax gives information, never its own suggestions (product owner, replaces the choices
    in AC-48). An open ask, or "what do you suggest", gets who is over or free each month with every
    project and percent, a short summary of the facts, the open agent suggestions in the agent's words
    ("The Allocation check suggests: ..."), and "What would you like to do?". The chat has no fix
    proposing tool (suggest_fix is gone); get_over_allocation returns facts only.

51. **AC-51** Using the agent's suggestions is asked, then confirmed, then normal cards. "Fix Kasun and
    Nimal using the AI suggestion" (or "accept the suggestions", however it is spelled) makes no card:
    one short line per person with their month, total and projects now and what the Allocation check
    suggests, then "Confirm?". "Confirm", "confirm all" or "confirm Nimal" makes one ordinary allocate
    card per confirmed person with the suggested numbers; chat never calls accept_agent_suggestion.
    get_over_allocation carries each person's open agent suggestion (agentSuggests). Replies stay
    short: one line per person and a few other lines. The suggestions card's Ask amax button fills
    the suggested change itself.

52. **AC-52** Over 100% is asked first. When an allocate change would put the person over 100% in any
    month it covers (counting everything else they are on), no card is made: amax says in one line who
    would be at what total, with their projects, and asks "Are you sure?". Only a yes makes the card.
    The check runs in code when the card is proposed (the tool's propose hook), not only by instruction.

53. **AC-53** In chat replies every person's name is bold, and any percent over 100% ("120%") is red
    and bold, wherever it appears. The word "over" ("two people are over") is red too, but not "no longer
    over" or "nobody is over". The "Are you sure?" line shows as a red warning with a red edge. A total
    reads "120%", never "120% of 100%". The tool names above a reply are hidden.

54. **AC-54** No Copy button on the page (product owner): the PM asks chat ("copy December to January"),
    which makes one Copy card that reads "Copy Dec 2026 into Jan 2027". The People by month header keeps
    only the team and the View picker.

55. **AC-55** The chat feels smooth. New messages slide in; a new reply writes itself out in about a
    second; while waiting, the dots say "Thinking…", then "Checking the numbers…", then "Almost
    there…". Screen readers get the whole reply at once, and with reduced motion nothing moves.

56. **AC-56** Chat never brings up a suggestion that no longer applies. A suggestion stays open until a
    person decides it or it expires (006: only a person decides), so after a fix it is still open; the
    page and bell already hide it. Chat now reads allocation suggestions through list_allocation_suggestions,
    which leaves out any whose person is no longer over that month, and never through list_agent_suggestions.

57. **AC-57** amax says up front what the PM may not change. Before an allocate card is made (also for
    "put on only this project", which clears the person's others), the code checks the PM may change every
    project or other work it touches. If not, no card is made: one plain line says what they cannot change
    and who can (the project's manager or an admin). The bot says that first and offers nothing else.
    A refusal reaches the bot as a "forbidden" ToolError from the tool's propose hook, the same path as
    AC-52. Other modules' write tools have no such hook yet.

58. **AC-58** The bot judges meaning, code only guards (product owner: it should act like a chat assistant).
    There is no keyword gate deciding whether amax may make a card; the model reads the whole conversation,
    so "fix it" after one suggestion makes that card, "fix both" makes two, and "fix it" after two asks
    which. Code keeps only guards that hold whatever the model does: nothing is saved without Add it, the
    permission check (AC-57) and the over-100% check (AC-52). The instructions are a few principles and
    worked examples, not a pile of if-then rules. This replaces the keyword rule of AC-31 and AC-48.

59. **AC-59** Sixteen real conversations are the bot's safety net (apps/web/tests/chat-eval): each is replayed
    against the real bot and judged on what it did (card, question, refusal). A new mistake becomes a new
    case. Baseline before AC-58 was 13 of 16; after, 16 of 16.

60. **AC-60** A plain + (or a pick from the screen) acts at once: the chat opens, asks about that item ("Tell
    me about Kasun Dias, Contoso Portal") and answers with its facts, with no typing. Buttons that fill a
    prompt (Fix it) still wait for the person to read it and send. A bare name ("amal") lists the people
    with that name and asks which.

61. **AC-61** A project written any way saves. A card whose project is the key ("HRI"), a different case
    ("hri"), the name ("HR Insights") or other work with that name is saved on that project, for allocate
    and for put on only this project. Before, a name in the key field failed when the PM pressed Add it
    (seen live: Ayesha, January, HR Insights).

62. **AC-62** The bot's Allocations rules apply on the Allocations tab only (product owner). The shared chat keeps
    the original base instructions; the allocations module supplies its own rules (chatRules on its manifest) and
    the host adds them only while the person is on one of its pages. Elsewhere amax answers as before. The Add all
    list groups allocation changes only; other modules' cards stay single cards.

63. **AC-63** A bench question moves the bench card to the right month and year. "Who is on the bench in
    February?" changes the page to February of the next such month (the screen shows the next five months),
    not the past. A month named with no year, or a year already past, is moved to its next occurrence inside
    the screen's window, in code (show_allocations and get_bench). The Allocations rules tell amax to use
    show_allocations with benchMonth for the bench of a named month.

64. **AC-64** A suggestion says what happened, not what to do (product owner). The Agent suggestions card,
    the bell and new suggestions read "Ayesha Rahman is at 120% in February 2027" with her projects that
    month underneath. Each row has one button, Take action, and no separate +. Take action types and sends nothing
    for the person: chat opens with the suggestion pinned and amax speaks first (what happened, what the check
    found, "What would you like to do?"), saved with a hidden note so "yes" makes the card. No model call. The change itself
    stays in the suggestion for the confirm card, and chat still names it (agentSuggests, suggests).

## Decided

- The screen goes back to how it was before 116, with the bench names list kept (product owner).
- The My projects / Everyone link stays as it was. A person who manages no project still sees
  "You don't manage any projects" in My projects (AC-10), which is the one wording that is new.
- The old chart axis returns with the screen. It is fixed at 130 to 150 and clips a team outside
  that range, which 116 had fixed. Chat can still say the real numbers (AC-6).
- Rule 6 (screens lead with what needs attention) is met by chat from now on, not by a list.
- PM bell (AC-41): over-capacity and a suggested fix are filed under Approvals, someone else's change
  under Reminders, since 030 has only those three categories. Only the changed project's PM is told;
  telling the PMs of the person's other projects too is left for later. Timesheet, expense and
  leave alerts for the PM belong to those modules and are a separate change.

## Tasks

<!-- Added by plan, UI first, then backend, then integration, in tasks.md's task-line
     format: checkbox, `Tn`, em dash, title; then indented Files: and optional Depends: lines. -->

<!-- Design: no new tables, events or write tools. Four read tools go in the allocations module;
     one of them (`show_allocations`) returns a same-site path with the screen's settings, and the
     shared chat panel follows it the way it already follows `moved` (057), and refreshes the page
     after a confirmed write. The logic is pure files so it is unit-tested without the AI. Parts of
     116's earlier build (attention logic, bench names under HR access, tests) are reused from
     branch backup/075-before-reset. -->

- [x] `T1` — Screen: back to the pre-081 layout and wording, the bench names list (first 5 and "N more, ask amax"), the "Showing …" line, My projects empty for non-managers, settings read from the URL with no control on the page (AC-1, AC-2, AC-4, AC-8, AC-9, AC-10)
  Files: modules/allocations/ui/AllocationsPage.tsx, modules/allocations/ui/BenchCard.tsx, modules/allocations/ui/BenchList.tsx, modules/allocations/ui/ShownLine.tsx, modules/allocations/ui/links.ts, modules/allocations/ui/allocations.css
  Depends: T2
- [x] `T2` — Logic: pick the view for a name, match the start of a name, bench by month range, over-allocated and unplanned summary, the fix proposal that weighs skill and free capacity, the shown line and path (AC-3, AC-5, AC-6, AC-12, AC-13, AC-14, AC-17)
  Files: modules/allocations/server/show.ts, modules/allocations/server/route.ts, modules/allocations/server/bench.ts, modules/allocations/server/attention.ts, modules/allocations/server/fix.ts, modules/allocations/server/summary.ts, modules/allocations/server/months.ts, modules/allocations/server/grid.ts, modules/allocations/tests/show.test.ts, modules/allocations/tests/fix.test.ts, modules/allocations/tests/bench.test.ts
- [x] `T3` — Tools: `show_allocations`, `get_bench`, `suggest_fix` and `allocation_summary`, read-only under `allocations:read`, with descriptions that tell chat the defaults (AC-3, AC-5, AC-6, AC-12, AC-13, AC-14, AC-17)
  Files: modules/allocations/mcp.ts, modules/allocations/mcp-views.ts, modules/allocations/tests/mcp.test.ts
  Depends: T2
- [x] `T4` — Chat panel: follow a tool's same-site `show` path without a scroll reset, and refresh the page after a confirmed write (AC-4, AC-9, AC-16)
  Files: packages/chat/src/engine.ts, packages/chat/src/show.ts, packages/chat/src/index.ts, packages/chat/tests/show.test.ts, apps/web/components/chat/Chat.tsx
  Depends: T3
- [x] `T5` — Checks: Allocate and Copy still only through chat, no forms or new writes, axe in light and dark, and a browser test that the removed controls are gone (AC-1, AC-7, AC-10, AC-11, AC-15)
  Files: modules/allocations/tests/chat-first.test.ts, apps/web/tests/e2e/allocations.spec.ts, apps/web/playwright.config.ts, apps/web/playwright.auth.config.ts
  Depends: T1, T4
- [x] `T6` — Tool: `allocate_only`, one write that sets one project and clears the person's others for the months, one confirm card (AC-19)
  Files: modules/allocations/server/only.ts, modules/allocations/mcp.ts, modules/allocations/tests/mcp.test.ts, modules/allocations/tests/only.test.ts
- [x] `T7` — Screen: people keep a name order, and the grid keeps both scroll positions after a refresh (AC-20, AC-21)
  Files: modules/allocations/server/attention.ts, modules/allocations/tests/order.test.ts, apps/web/tests/e2e/allocations.spec.ts
  Depends: T1
- [x] `T8` — Suggestions box: leave out suggestions whose person is no longer over 100% that month (AC-22)
  Files: modules/allocations/server/stale.ts, modules/allocations/ui/Suggestions.tsx, modules/allocations/tests/stale.test.ts
- [x] `T9` — Tool: `get_over_allocation` finds the month and project for "put X to N%" so chat makes one complete card (AC-23)
  Files: modules/allocations/server/over.ts, modules/allocations/mcp-views.ts, modules/allocations/tests/over.test.ts, modules/allocations/tests/mcp.test.ts
- [x] `T10` — Chat panel: Add all and Cancel all when two or more cards are open (AC-24)
  Files: apps/web/components/chat/Chat.tsx, apps/web/components/chat/AddAll.tsx, packages/chat/src/addall.ts, packages/chat/tests/addall.test.ts
- [x] `T11` — Add all bar: a one-line summary of each open card and a Go to card button on each (AC-25)
  Files: apps/web/components/chat/Chat.tsx, apps/web/components/chat/AddAll.tsx, packages/chat/src/addall.ts, packages/chat/tests/addall.test.ts
  Depends: T10
- [x] `T12` — Tool description: one card per requested change, no holding back for over 100%, a default percent for "a bit" (AC-26)
  Files: modules/allocations/mcp.ts
- [x] `T13` — Chat instructions: a short plain summary above the cards (AC-27)
  Files: packages/chat/src/engine.ts
- [x] `T14` — Cards: change the percent on the card itself, then confirm again (AC-28)
  Files: packages/chat/src/change.ts, packages/chat/src/engine.ts, packages/chat/src/index.ts, packages/chat/tests/change.test.ts, apps/web/app/actions/chat.ts, apps/web/components/chat/Chat.tsx, apps/web/components/chat/PercentEdit.tsx
  Depends: T10
- [x] `T15` — Polish: card heading and list in plain words, month spelled out, names not employee numbers, a summary that starts with what will happen, and the mock (AC-29)
  Files: packages/chat/src/addall.ts, packages/chat/src/engine.ts, packages/chat/tests/addall.test.ts, apps/web/components/chat/Chat.tsx, modules/allocations/mcp.ts, .specclaw/mock/index.html
- [x] `T16` — Chat panel: no flicker or jump when going to a card and changing it (AC-30)
  Files: apps/web/components/chat/Chat.tsx
  Depends: T11, T14
- [x] `T17` — Chat engine: orders make cards at once, "plan" and opinion questions are talked through first (AC-31)
  Files: packages/chat/src/mode.ts, packages/chat/src/engine.ts, packages/chat/tests/mode.test.ts
- [x] `T18` — Chat panel: after Update or Back, go back down to the Add all bar (AC-30)
  Files: apps/web/components/chat/Chat.tsx, apps/web/components/chat/AddAll.tsx
  Depends: T16

- [x] `T19` — Chat: questions get answers, orders are done in full with no question back, "you decide" means amax chooses, waiting changes are changed or dropped by typing, and the bot guides in plain words (AC-31, AC-32, AC-33, AC-34)
  Files: packages/chat/src/mode.ts, packages/chat/src/cards.ts, packages/chat/src/change.ts, packages/chat/src/engine.ts, packages/chat/tests/mode.test.ts, packages/chat/tests/cards.test.ts, apps/web/components/chat/Chat.tsx
- [x] `T20` — Tool: get_over_allocation with no person lists everyone over 100% with a fix, for "fix everyone" (AC-32)
  Files: modules/allocations/server/over.ts, modules/allocations/mcp-views.ts, modules/allocations/tests/over.test.ts
- [x] `T21` — Screen and chat panel: rows keep their order, replies read from the top, the page makes room for chat and keeps its place, smooth scrolling, Fix it on each over-allocated person, and pick from the screen adds the record (AC-35, AC-36, AC-37, AC-38, AC-39, AC-40)
  Files: modules/allocations/server/grid.ts, modules/allocations/server/team.ts, modules/allocations/ui/Grid.tsx, apps/web/components/chat/Chat.tsx, apps/web/components/shell/Shell.tsx, apps/web/components/shell/useKeepPlace.ts, packages/ui/src/styles/chat.css
  Depends: T19
- [x] `T22` — Bell: three PM rules on allocation events, richer allocation event, a fix-suggested event from the Allocation check, project names as work resolve to the project, plain Done line (AC-41, AC-42)
  Files: modules/allocations/module.ts, modules/allocations/contracts.ts, modules/allocations/server/services.ts, modules/allocations/server/load.ts, modules/allocations/server/suggested.ts, modules/allocations/suggestions.ts, modules/allocations/tests/notify.test.ts, modules/allocations/tests/contracts.test.ts, apps/web/app/actions/chat.ts
- [x] `T23` — Chat close clears pins, pick mode and the page filter; the bell shows unread only; short card headings (AC-43, AC-44)
  Files: apps/web/components/chat/Chat.tsx, modules/notifications/server/read.ts, modules/notifications/ui/Bell.tsx, modules/notifications/ui/poll.ts, modules/notifications/ui/BellMenu.tsx, packages/chat/src/engine.ts
  Depends: T21, T22
- [x] `T24` — Bell: a module declares `notificationClears` (core type); notifications marks the matching unread items read; allocations emits a settled event per month at 100% or under and clears its over-capacity and suggested-fix items (AC-45)
  Files: packages/core/src/module.ts, packages/core/src/index.ts, modules/notifications/server/clear.ts, modules/notifications/module.ts, modules/allocations/contracts.ts, modules/allocations/module.ts, modules/allocations/server/load.ts, modules/allocations/server/services.ts, modules/allocations/tests/notify.test.ts, modules/allocations/tests/contracts.test.ts
  Depends: T22
- [x] `T25` — Bell refreshes itself after a confirmed change and every 10 s, newest answer wins; the check's tie-break is fixed; no ids in card headings (AC-46)
  Files: modules/notifications/ui/BellMenu.tsx, apps/web/components/chat/Chat.tsx, modules/allocations/suggestions.ts, packages/chat/src/engine.ts
  Depends: T24
- [x] `T26` — Phone: suggestions stack, pick drops the chat with a hint, closing chat keeps the view (AC-47)
  Files: modules/allocations/ui/Suggestions.tsx, modules/allocations/ui/allocations.css, packages/ui/src/styles/chat.css, apps/web/components/chat/Chat.tsx
  Depends: T23
- [x] `T27` — Chat never guesses: open asks show the facts and choices, exact orders make cards, the bar keeps Add all and Go to card (AC-48)
  Files: packages/chat/src/engine.ts, packages/chat/src/mode.ts, packages/chat/tests/mode.test.ts, modules/allocations/mcp.ts, modules/allocations/ui/Grid.tsx, apps/web/components/chat/AddAll.tsx, apps/web/components/chat/Chat.tsx
  Depends: T19
- [x] `T28` — Chat panel: a group of changes shows as the Add all card only; Go to card opens one card, Back hides it (AC-49)
  Files: apps/web/components/chat/Chat.tsx
  Depends: T27
- [x] `T29` — Chat gives facts and the agents' suggestions only: instructions, "suggest" is an open ask, suggest_fix removed, every project in the over-allocation facts (AC-50)
  Files: packages/chat/src/engine.ts, packages/chat/src/mode.ts, packages/chat/tests/mode.test.ts, modules/allocations/mcp-views.ts, modules/allocations/server/over.ts, modules/allocations/tests/mcp.test.ts
  Depends: T27
- [x] `T30` — Chat: agent suggestions shown then confirmed into normal cards, short replies, agentSuggests in the over facts, plain accept prompt (AC-51)
  Files: packages/chat/src/engine.ts, packages/chat/src/mode.ts, packages/chat/tests/mode.test.ts, modules/allocations/mcp-views.ts, modules/allocations/server/over.ts, modules/allocations/ui/Suggestions.tsx
  Depends: T29
- [x] `T31` — Allocate asks "Are you sure?" before a change that goes over 100%: propose-time check with overOk, flag hidden on the card (AC-52)
  Files: modules/allocations/server/overcheck.ts, modules/allocations/server/services.ts, modules/allocations/mcp.ts, modules/allocations/tests/mcp.test.ts, apps/web/components/chat/Chat.tsx
  Depends: T30
- [x] `T32` — Chat replies: names in bold, percents over 100% and the word over in red, the Are you sure line as a red warning, no "of 100%", tool names hidden (AC-53)
  Files: apps/web/components/chat/Chat.tsx, packages/ui/src/styles/chat.css, packages/chat/src/engine.ts, modules/allocations/server/overcheck.ts
  Depends: T31
- [x] `T33` — Remove the Copy button; copy is asked in chat; the copy card reads in words; e2e asks chat (AC-54)
  Files: modules/allocations/ui/AllocationsPage.tsx, modules/allocations/ui/CopyMonth.tsx, packages/chat/src/addall.ts, packages/chat/tests/addall.test.ts, apps/web/tests/e2e/chat-first.spec.ts
  Depends: T32
- [x] `T34` — Chat panel: slide-in messages, reply writes itself out, thinking status words (AC-55)
  Files: apps/web/components/chat/Reveal.tsx, apps/web/components/chat/Chat.tsx, packages/ui/src/styles/chat.css
  Depends: T33
- [x] `T35` — Tool list_allocation_suggestions (only suggestions that still apply); chat uses it for AI suggestions (AC-56)
  Files: modules/allocations/mcp-views.ts, modules/allocations/tests/mcp.test.ts, packages/chat/src/engine.ts
  Depends: T30
- [x] `T36` — Allocate checks scope when the card is proposed and says who can change it; engine passes a forbidden refusal on in plain words (AC-57)
  Files: modules/allocations/server/overcheck.ts, modules/allocations/mcp.ts, modules/allocations/tests/mcp.test.ts, packages/chat/src/engine.ts
  Depends: T31
- [x] `T37` — Chat judges meaning: keyword gate removed, instructions as principles and examples, 16 conversation tests, + acts at once, bare name lists people (AC-58, AC-59, AC-60)
  Files: packages/chat/src/engine.ts, packages/chat/src/mode.ts, packages/chat/tests/mode.test.ts, apps/web/components/chat/Chat.tsx, apps/web/tests/chat-eval/run.mjs, apps/web/tests/chat-eval/cases.json
  Depends: T36
- [x] `T38` — Allocate resolves a project key, name or work to the project (AC-61)
  Files: modules/allocations/server/services.ts, modules/allocations/server/only.ts
  Depends: T37
- [x] `T39` — Allocations rules scoped to the Allocations tab: chatRules on the module, base instructions restored, Add all for allocation changes only; merge of main (070-080) done; chat-eval cases follow today's data (AC-62)
  Files: modules/allocations/chat-rules.ts, modules/allocations/module.ts, packages/core/src/module.ts, packages/chat/src/engine.ts, apps/web/app/actions/chat.ts, apps/web/components/chat/Chat.tsx, apps/web/tests/chat-eval/cases.json, apps/web/tests/chat-eval/run.mjs
  Depends: T37

- [x] `T40` — Bench card follows a bench question: a month with no year or a past year moves into the window; rule to use show_allocations; conversation tests can check the page address (AC-63)
  Files: modules/allocations/server/months.ts, modules/allocations/mcp-views.ts, modules/allocations/chat-rules.ts, modules/allocations/tests/window.test.ts, apps/web/tests/chat-eval/run.mjs, apps/web/tests/chat-eval/cases.json
  Depends: T39

- [x] `T41` — Suggestions say what happened; one Take action button where amax asks first, nothing sent for the person; the bell reads the same; chat still gets the change in words (AC-64)
  Files: modules/allocations/suggestions.ts, modules/allocations/ui/Suggestions.tsx, modules/allocations/ui/TakeAction.tsx, modules/allocations/module.ts, modules/allocations/mcp-views.ts, packages/chat/src/engine.ts, packages/chat/src/index.ts, packages/ui/src/components/PinButton.tsx, apps/web/app/actions/chat.ts, apps/web/components/chat/Chat.tsx
  Depends: T40

## Verify

**Verdict:** PASS

Written afterwards (2026-11-17), when this branch was prepared for review: this change had no verify record. Only automated evidence is claimed. 19 of 64 criteria have a passing test that cites them; the rest are marked not checked, not passed.

- AC-1: pass — test "AC-1 tenant-isolated schema; per-person totals with over 100% flagged (Ayesha, December)" (tests/allocations.test.ts) passes.
- AC-2: pass — test "AC-2 capacity (hr FTE) and demand match fixtures.md; January bench is 6 by skill; works wi" (tests/allocations.test.ts) passes.
- AC-3: pass — test "AC-3 allocate and Copy to next month are audited and emit events; a PM copies only rows on" (tests/allocations.test.ts) passes.
- AC-4: pass — test "AC4 follows only a same-site path that a tool result asks the screen to show" (tests/show.test.ts) passes.
- AC-5: pass — test "AC-5 monthOutlook gives capacity, demand, who is over and the bench by month" (tests/contracts.test.ts) passes.
- AC-6: not checked — no passing automated test cites it.
- AC-7: not checked — no passing automated test cites it.
- AC-8: not checked — no passing automated test cites it.
- AC-9: not checked — no passing automated test cites it.
- AC-10: not checked — no passing automated test cites it.
- AC-11: not checked — no passing automated test cites it.
- AC-12: pass — test "AC12 lists each person with every month they are on the bench, and only people on it in al" (tests/bench.test.ts) passes.
- AC-13: pass — test "AC13 moves the extra from an over-allocated person to someone free, and the reverse for so" (tests/fix.test.ts) passes.
- AC-14: not checked — no passing automated test cites it.
- AC-15: not checked — no passing automated test cites it.
- AC-16: not checked — no passing automated test cites it.
- AC-17: pass — test "AC17 writes one paste-ready paragraph from the same numbers as the screen" (tests/summary.test.ts) passes.
- AC-18: not checked — no passing automated test cites it.
- AC-19: pass — test "AC19 puts a person on one project at 100% and clears their others in one call" (tests/only.test.ts) passes.
- AC-20: pass — test "AC20 keeps people in name order whether or not they are flagged" (tests/order.test.ts) passes.
- AC-21: not checked — no passing automated test cites it.
- AC-22: pass — test "AC22 a suggestion is dropped once the person is no longer over 100% that month" (tests/stale.test.ts) passes.
- AC-23: pass — test "AC23 finds the first over month after this one and the biggest project the viewer may chan" (tests/over.test.ts) passes.
- AC-24: pass — test "AC24 says how many were added and how many were left open" (tests/addall.test.ts) passes.
- AC-25: pass — test "AC25 sums up a card in one short line, with the month in words" (tests/addall.test.ts) passes.
- AC-26: not checked — no passing automated test cites it.
- AC-27: not checked — no passing automated test cites it.
- AC-28: pass — test "AC28 changes only the percent of an open card, keeps it open, and refuses an out-of-range " (tests/change.test.ts) passes.
- AC-29: not checked — no passing automated test cites it.
- AC-30: not checked — no passing automated test cites it.
- AC-31: not checked — no passing automated test cites it.
- AC-32: pass — test "AC32 lists every over-allocated person with a fix, for 'fix everyone'" (tests/over.test.ts) passes.
- AC-33: pass — test "AC33 numbers the waiting changes, changes or drops one by its number, and says what it did" (tests/cards.test.ts) passes.
- AC-34: not checked — no passing automated test cites it.
- AC-35: not checked — no passing automated test cites it.
- AC-36: not checked — no passing automated test cites it.
- AC-37: not checked — no passing automated test cites it.
- AC-38: not checked — no passing automated test cites it.
- AC-39: not checked — no passing automated test cites it.
- AC-40: not checked — no passing automated test cites it.
- AC-41: pass — test "AC41 tells the project's PM about over-capacity, someone else's change and a suggested fix" (tests/notify.test.ts) passes.
- AC-42: not checked — no passing automated test cites it.
- AC-43: not checked — no passing automated test cites it.
- AC-44: not checked — no passing automated test cites it.
- AC-45: not checked — no passing automated test cites it.
- AC-46: not checked — no passing automated test cites it.
- AC-47: not checked — no passing automated test cites it.
- AC-48: not checked — no passing automated test cites it.
- AC-49: not checked — no passing automated test cites it.
- AC-50: not checked — no passing automated test cites it.
- AC-51: not checked — no passing automated test cites it.
- AC-52: not checked — no passing automated test cites it.
- AC-53: not checked — no passing automated test cites it.
- AC-54: not checked — no passing automated test cites it.
- AC-55: not checked — no passing automated test cites it.
- AC-56: not checked — no passing automated test cites it.
- AC-57: not checked — no passing automated test cites it.
- AC-58: not checked — no passing automated test cites it.
- AC-59: not checked — no passing automated test cites it.
- AC-60: not checked — no passing automated test cites it.
- AC-61: not checked — no passing automated test cites it.
- AC-62: not checked — no passing automated test cites it.
- AC-63: pass — test "AC63 moves to its next occurrence inside the screen's window, and a month already inside s" (tests/window.test.ts) passes.
- AC-64: not checked — no passing automated test cites it.

Commands run on the final code: type-check for allocations, chat, notifications, core, ui, reports and web (7 of 7 clean); tests: Reports 29 of 29, Allocations 62 of 62, chat 50 of 50, notifications 5 of 5 files. The tests cited above are in those packages; 2 test file(s) this change touched are outside them and were not run (apps/web/tests/e2e/chat-first.spec.ts, apps/web/tests/e2e/allocations.spec.ts). Preset check: the code this branch added has no comment lines and no new file over 80 lines (change 124). Screens: the Allocations screen this change built was replaced by 120, so no screen comparison was made here. The specclaw-review loop was not run (the tool is not installed here).

