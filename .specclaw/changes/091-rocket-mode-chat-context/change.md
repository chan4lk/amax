# The rocket-mode page skill and how the chat uses pins and page rules

**Change:** 091-rocket-mode-chat-context · **Created:** 2026-11-16

## Problem

These five commits (2026-11-05) were made without a specclaw change, so this record covers them after the fact. They were the tooling and chat side of the "rocket mode" redesign of Reports and Allocations: a skill that says how to rebuild an amax tab, and two chat-engine rules. Their UI half is recorded under 081, 082 and 083, and was later replaced by 088 and 089.

## Mock Delta

No screen changes: the skill is a file for the coding assistant and the chat changes are in how the bot is instructed. There is no mock section.

## Acceptance Criteria

1. **AC-1** A `rocket-mode` skill (`.claude/skills/rocket-mode/SKILL.md`) says how to rebuild an amax tab so it reads top to bottom with each fact once, and that reports are documents and pins never limit the chat.
2. **AC-2** On a page that has its own bot rules, the chat adds the rocket-mode answer style: the answer first in bold, two to five short bullets, problems first, and the page's show tool called so the page shows the same thing.
3. **AC-3** A pinned item is context, never a limit: the bot uses a pin only when the question is about it, and answers a different question with its tools as if nothing were pinned.

## Tasks

- [x] `T1` — The rocket-mode skill (AC-1)
  Files: .claude/skills/rocket-mode/SKILL.md
- [x] `T2` — Rocket-mode answers and pins as context in the chat engine (AC-2, AC-3)
  Files: packages/chat/src/engine.ts, packages/chat/src/rocket.ts

## Verify

**Verdict:** PASS

- AC-1: pass — `.claude/skills/rocket-mode/SKILL.md` is in the repository and is the skill the assistant lists as rocket-mode.
- AC-2: pass — `packages/chat/src/rocket.ts` holds the answer style and `engine.ts` adds it through `withRocket` when a page has its own rules.
- AC-3: pass — the line "Pinned items are context, never a limit" is in the chat engine's instructions.

This record was written afterwards for work done on 2026-11-05 without a change, so it was checked by reading the code that is in the repository now, not by building it again. Chat tests: 11 pass and 39 are skipped because they need the database; they were not run here.

