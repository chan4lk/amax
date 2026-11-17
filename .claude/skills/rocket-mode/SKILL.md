---
name: rocket-mode
description: Rebuild an amax tab (Reports, Allocations, Time or any module page) so it reads top to bottom with each fact shown once, looks like the Time and Allocations pages, keeps clicking to a minimum and lets the chat bot drive the page. Use when the user says "rocket mode", "rocket mood", "use rocket mode", "use this skill", "use the page skill", "make it like the reports tab", "make this tab beautiful", "it looks messy/ugly", "too many buttons", "the bot should do it", or asks to redesign, clean up or polish any amax page.
---

# Rocket mode

The website is for looking; the bot is for doing. A page is read from top to bottom, and each section answers a different
question. Nothing is said twice. This is how the Reports tab was rebuilt (082, commits `6ab73bec`, `c3eaa7e9`).

## Before you touch anything

1. Screenshot the page as it is (logged in, full page) and the two reference pages, Team time (`/time`) and Allocations
   (`/allocations`). Read their components: `modules/time/ui/StatusBand.tsx`, `Summary.tsx`, `ThisWeek.tsx`, `band.css`,
   `time.css`; `modules/allocations/ui/*`. Copy their patterns and class shapes, not new ones.
2. List every fact the page shows and where. Mark each fact that appears more than once. That list is the problem.
3. Project rule (memory: never remove, only modify or add): what was on the page **before our work** stays (titles, the
   original sentence, tabs, Export, Change target and other original buttons, every column, every pin). Cards and
   controls *we* added can be merged or removed. If the user asks to remove an original control, say it conflicts with
   the rule and ask.

## The page shape (Time's pattern)

1. **Title row**: `h1` plus small chips for the period and the scope ("Your people" / "Everyone").
2. **The original sentence** (lede), unchanged.
3. **Band**: two hero cards side by side. Each has a small uppercase label, one big figure with a plain sub-line, a
   segmented bar, and legend pills with the numbers. Each answers one question ("Where the hours went", "Plan vs
   actual").
4. **Four figures**: small stat cards (label, big number, one-line sub). Only numbers not already in the band.
5. **Two columns** (`minmax(0,1fr) 380px`): the main chart on the left, a list card on the right (like Time's "This
   week": headline, bar, one row per item with a coloured dot and a value).
6. **A timeline or detail card** for what is coming next, in date order, one line per event with a date pill.
7. **The main table** last, with the detail per row (pills for status, a small trend per row, the total row tinted).

Every card, stat, row and list item has a `PinButton` (rule 2). Red means a problem and nothing else.

## Fewer clicks, the bot drives

- No filters, chips, search boxes or "Ask amax" buttons that the bot can do. Keep only the original controls.
- Give the module a read tool that changes the page (e.g. `show_reports`, `show_allocations`): it returns `{ show: "/path?query" }`
  and the facts, so the chat answer and the page agree. The page reads the query (searchParams) and filters server-side,
  with a small "Showing … · show everyone" line.
- Give the module `chatRules` (see `modules/reports/chat-rules.ts`): every number from a tool, answer first in one line,
  problems first, say whose data it is (PM vs Admin), call the show tool when they ask to see/show/list/filter, files via
  the export tool, names in bold, one next step at most.
- Add a few `chatSuggestions` for the questions people really ask on that page.

## The bot and the files

- Chat answers on a page follow `ROCKET_STYLE` (packages/chat/src/rocket.ts), added to any module's `chatRules`: a bold
  one-line answer, a few bullets with each fact once, problems first, the show tool called so the page matches.
- PDF and Word files are reports, not the website: a kind per question (Reports has utilisation, availability, delivery),
  each with numbered sections: 1. Summary in prose, 2. Key figures (Measure | Value | Context), 3. numbered Findings with the
  evidence, then captioned detail tables (Table n), a figure only where it helps, and Method. Page numbers, no cards or tiles.
  See modules/reports/server/export-*.ts.
- Reports are built Markdown first (sections → .md → PDF/Word, modules/reports/server/export-md.ts); the .md is downloadable too.
- On pages with chatRules, tool results reach the model as compact Markdown (packages/chat/src/compact.ts), about 46% fewer
  characters on big tables.
- A pinned card is context for the question it came with, never a limit on what the user can ask next.

## Check before you commit

- Rebuild (`apps/web`: `node scripts/gen-registry.mjs && npx next build`, then `next start -p 3000`) and screenshot as the PM
  (`pm.demo`) and as the Admin. Read top to bottom: does any fact repeat? Is anything empty or clashing (check old CSS rules
  in the module css that share a class name)?
- Ask the bot 3 to 4 real questions with Playwright and check the page follows the answer.
- Module tests pass (`DATABASE_MIGRATE_URL` passed inline from `apps/web/.env.local`, never printed). Update e2e expectations.
- Secret-scan the diff. One commit for the redesign, so it can be reverted. Tell the user the commit id and how to revert.
