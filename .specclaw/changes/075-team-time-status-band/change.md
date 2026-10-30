# Team time status band

**Change:** 075-team-time-status-band · **Created:** 2026-10-25 · **Review:** covered-by 073-time-workflow-enhancements

## Problem

Team time opens with one long sentence: "Week 42, Mon Oct 12 to Fri Oct 16. 3 of 5 people have submitted 87.5 h. Agents
logged 90.2 h, 66% of the team's 137.4 h." The dates repeat the week picker and the hours repeat the summary strip. The
two facts that matter, how far the team is with submitting and how much the agents logged, are buried, and they can't
be clicked or pinned.

Approved by the product owner, 2026-10-25: "build it in the current branch end to end", after the status band was
proposed in chat.

**Amendment 1, 2026-10-25** (product owner: "Team time section doesn't state which week currently, makes the user confuse,
can you add the week number?"; approved: "build in the current branch"): the sentence this change removed was the only
place that named the week number. AC-8 and AC-9 cover it.

**Amendment 2, 2026-10-25** (product owner: "the my timesheet also has description, make it similar UI to team time but
minimal … make sure the week number is properly aligned"): My timesheet still opens with a sentence, and the week pill
sits high against the title's letters. AC-10 and AC-11 cover these.

## Mock Delta

What changes on screen, and where to see it: [`075-team-time-status-band`](../../mock/index.html#075-team-time-status-band)

Team time's header sentence is replaced by a status band of two bars: **Submissions** ("3 of 6", one segment per status)
and **Who logged it** (agents vs people, with the agents' share). Each status in the legend links to the grid filtered
to it, and each bar has a **+** pin.

## Acceptance Criteria

1. **AC-1** Team time no longer has the header sentence. Under the title, a status band shows two parts side by side:
   **Submissions** and **Who logged it**. With nobody on the week it shows nothing, and the empty state stays as it is.
2. **AC-2** Submissions: "{submitted or approved} of {everyone}", and a bar with one segment per status, its width in
   proportion to the count: Approved, Submitted, Sent back, Draft, Not started. "Everyone" counts people with no
   timesheet (073's Not started rows). The legend names each status with an icon (✓ ● ↩ ◐ ○) and its count, so colour is
   never the only signal. A status with no one is left out.
3. **AC-3** Who logged it: the week's total hours, and a bar split into agent hours and hours people entered, with each
   part's hours and %. With no hours it reads "No hours logged yet".
4. **AC-4** Each legend item is a link that sets the grid's status filter, keeping the other filters: Approved →
   `approved`, Submitted → `submitted`, Sent back → `rejected`, Draft and Not started → `not_submitted`. It lands on the
   Timesheets card (`#timesheets`). The band counts the whole week whatever the filters are.
5. **AC-5** Each part has a **+** that pins it ("Submissions, 2026-W42", "Who logged it, 2026-W42") and resolves through
   `get_team_week` like the summary strip.
6. **AC-6** Accessible: each bar has a text alternative ("3 of 6 submitted: 1 approved, 2 submitted, 2 draft, 1 not
   started"), links work from the keyboard with a visible focus, contrast holds in light and dark, and at phone width
   the two parts stack. Axe finds nothing.
7. **AC-7** Tests: the band's counts and percentages from a week's rows (unit); the e2e check that read the header
   sentence reads the band instead, and a legend link filters the grid. Every other test passes unmodified.
8. **AC-8** Beside the page title on Team time, My timesheet and a member's timesheet, a pill names the week and how far
   it is from now: "Week 42 · Last week" ("This week", "Next week", "2 weeks ago", "In 3 weeks"), with the year added
   when it isn't this year's ("Week 52, 2025 · …"). This week's pill is highlighted. It sits outside the `<h1>`, so
   the heading text is unchanged, and it reads as one phrase to screen readers.
9. **AC-9** Tests: the relative label for this, last, next and far weeks and across a year (unit); e2e: Team time for
   2026-W42 shows "Week 42". Every other test passes unmodified.
10. **AC-10** My timesheet's sentence becomes one slim, pinnable band (`get_my_week`) in the same style as Team time's:
    "{hours} h of {target} h" with a thin bar and the %, and "{n}% by agents" with a thin split bar and
    "Agents {a} h · You {b} h". An approved week adds "Approved · locked". With no hours it reads "No hours logged yet"
    against the target. Each bar has a text alternative; at phone width the two readings stack.
11. **AC-11** The week pill sits on the title's text baseline on every page that has it. Tests: the band's figures
    (unit); every other test passes unmodified.

## Tasks

- [x] `T1` — The status band on Team time: two bars, legend links, pins, accessible and responsive (AC-1 to AC-6)
  Files: modules/time/ui/StatusBand.tsx, modules/time/ui/band.ts, modules/time/ui/TeamPage.tsx, modules/time/ui/Timesheets.tsx, modules/time/ui/time.css, modules/time/server/grid.ts
- [x] `T2` — Tests: band figures, and the e2e check reads the band and follows a legend link (AC-7)
  Files: modules/time/tests/status-band.test.ts, modules/time/tests/e2e/time.spec.ts
  Depends: T1
- [x] `T3` — The week pill beside the title (AC-8, AC-9)
  Files: modules/time/ui/parts.tsx, modules/time/week.ts, modules/time/ui/time.css, modules/time/tests/week-pill.test.ts, modules/time/tests/e2e/time.spec.ts
- [x] `T4` — My timesheet's slim band, and the pill on the title's baseline (AC-10, AC-11)
  Files: modules/time/ui/MyBand.tsx, modules/time/ui/MyPage.tsx, modules/time/ui/band.css, modules/time/ui/time.css, modules/time/tests/status-band.test.ts

## Verify

**Verdict:** PASS
- AC-1: pass — the header sentence is gone; the band sits under the title (`TeamPage.tsx`, `StatusBand.tsx`); the empty week keeps its date line and empty state.
- AC-2: pass — week 42 "3 of 5 submitted", with 3 submitted and 2 draft; week 43 shows 1 approved, 2 submitted, 1 draft and 1 not started, each segment and chip with its own icon. Unit test AC7.
- AC-3: pass — "66% by agents, of 137.4 h", with Agents 90.2 h · 66% and People 47.2 h · 34%; "No hours logged yet" when there are no hours (unit test).
- AC-4: pass — e2e: clicking "2 draft" goes to `?status=not_submitted#timesheets` and the grid shows 2 rows; other filters are kept in the link.
- AC-5: pass — a **+** on each part pins "Submissions, 2026-W42" / "Who logged it, 2026-W42" through `get_team_week`.
- AC-6: pass — each bar has a text alternative (`role="img"`).
  - Axe (wcag2a/aa, 21aa, 22aa) is clean in light, dark, phone and week 43.
  - At phone width the parts stack.
  - Product owner, during the build: "make sure every button's text is properly aligned". The legend glyphs (● ◐ ✦) rendered at different sizes and sat low, so they were replaced by 14 px SVG icons (`BandIcon.tsx`) in 28 px chips. Measured: every chip 28 px tall, each icon centred on its label (0 px offset).
- AC-7: pass — `tests/status-band.test.ts`; e2e AC3 reads the band and follows a legend link.
- Commands: time vitest 141/141; `pnpm lint` ok; `pnpm build` ok; time e2e 9/9.
- Screenshots: band-light.png, band-dark.png, band-phone.png and band-w43.png in the session scratchpad (`ui/`).

Amendment 1 (2026-10-25):
- AC-8: pass — `Head` (`ui/parts.tsx`) shows `WeekPill` beside the `<h1>` on Team time, My timesheet and a member's timesheet.
  - Live: W42 reads "Week 42 · Last week"; W43 reads "Week 43 · This week", highlighted.
  - The pill is centred on the title's line (both midlines at 155 px, and 103 px at phone width).
  - Axe is clean in light, dark and phone.
  - The h1 text is unchanged.
- AC-9: pass — `tests/week-pill.test.ts`: this, last and next week, 3 weeks ago, in 3 weeks, and "Week 52, 2025". The e2e test checks "Week 42" on Team time W42.
  - Time 147/147; `pnpm lint` ok; build ok; time e2e 9/9.
- Screenshots: pill-light.png, pill-dark.png and pill-phone.png in the session scratchpad (`ui/`).

Amendment 2 (2026-10-25):
- AC-10: pass — `MyBand.tsx` replaces My timesheet's sentence with one slim, pinnable strip.
  - Live, Tharushi W42: "24.9 h of 40 h · 62%", "77% by agents", "Agents 19.1 h · You 5.8 h".
  - Live, Kasun W43 (approved): "47.0 h of 40 h · 118%" with an over-target bar, and "Approved · locked".
  - At phone width the two readings stack. Axe is clean in light, dark, phone and on the approved week.
  - Unit test AC10 covers `myBandOf`.
- AC-11: pass — the week pill is centred on the title's capital letters, as the product owner asked during the build ("lift a little up, in one line").
  - Measured: cap middle 156.0 against pill middle 154.8 at desktop, and 103.6 against 103.0 at phone width, on Team time and My timesheet.
  - Baseline alignment was tried first and rejected: the pill hung below the letters.
  - Then, at the product owner's request ("go a little bit down, in desktop view"), desktop moves the pill down 3 px (`top:3px` from 861 px wide), so it sits between the middle of the capitals and the middle of the lowercase letters.
    - Measured at desktop: cap middle 156.0, x-height middle 159.0, pill middle 157.8.
    - Phone is unchanged: 103.0 against cap middle 103.6.
    - Screenshots: pill3-team.png and pill3-my.png.
- Checks: time 148/148; `pnpm lint` ok; build ok; time e2e 9/9.
- Screenshots: my-light/dark/phone/approved.png and pill2-team/my/phone.png in the session scratchpad (`ui/`).

Amendment 3 (2026-10-25; product owner: "the description under team time in employee page is not needed, it's already
covered by the label and calendar picker"):
- Team time no longer shows the "Week 43, Mon Oct 19 to Fri Oct 23." line. It was the empty-team state, for an employee with no timesheets to review.
- A member's timesheet drops the same week-and-dates prefix and keeps "30.5 h logged, 76% of 40 h."
- `weekSpan` and its `date` helper, now unused, are removed.
