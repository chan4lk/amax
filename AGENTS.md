# amax — agent guide

amax is an agent-native ERP for software and professional-services companies. Agents keep the
records; people review and decide. Read this before changing anything.

## Key files

| File | Read it for |
|---|---|
| [`PRODUCT.md`](PRODUCT.md) | **Start here.** Users, purpose, positioning, product principles |
| [`docs/architecture.md`](docs/architecture.md) | Runtime, repo layout, the module contract |
| [`docs/module-standard.md`](docs/module-standard.md) | What every module change must meet before verify |
| [`docs/roadmap.md`](docs/roadmap.md) | Modules and phasing |
| [`.specclaw/mock/index.html`](.specclaw/mock/index.html) | The whole-app mock; each change owns a `<section data-change>` |
| [`.specclaw/review/rules/`](.specclaw/review/rules/) | Repo review rules (R1, R2, …) applied by specclaw-review |

## Every change goes through specclaw

Use specclaw for **any** change: a feature, a fix, a config value, a doc. Never edit source without
a proposal.

`/specclaw:propose` → approve → `/specclaw:plan` → `/specclaw:build` → `/specclaw:verify` → `/specclaw:pr` → `/specclaw:archive`

The change directory under `.specclaw/changes/<NNN>-<slug>/` is the paper trail, and it exists only if
propose created it. A small change still gets a proposal; it's just a short one.

**Review passes: five at most.** Run the specclaw-review loop for at most five passes per change. That
counts rounds and final passes; a round that returns not_run doesn't count. After the fifth pass, stop:
record the open findings and the stop under `## Verify`, then go to the PR. If a blocker is still open,
ask the product owner first.

**Review scope.** Each `change.md` header declares `**Review:** change` (the default when the line is
missing) or `**Review:** module-end` for a module's last change, whose loop runs with `--since` over the
whole module. CI's `review-gate` job (`scripts/check-review-gate.mjs`) checks the review files under
`review/`. A PR from a fork must carry a finished loop for every change it touches, whatever the scope.
A same-repo PR needs one only for a `module-end` change.

## Core rules

1. **Chat does the writes.** No CRUD forms, write dialogs or inline edit fields in pages. Every
   create, update or delete is an MCP write tool in `modules/<m>/mcp.ts`, and chat runs it only after
   the pending-action confirm. Where a form would go, put an `IntentButton` ("Ask amax") that opens
   chat with the record pinned and a prompt filled in. Read-only controls (filters, tabs, sort,
   search, navigation) are fine.
2. **Everything is pinnable.** Every card, tile, stat, stage step, list item and table row that shows
   a record or a metric has a `PinButton` (`packages/ui/src/components/PinButton.tsx`). Its `PinRef`
   resolves through a read tool to that exact record.
3. **Every capability is an MCP tool.** The UI and MCP use the same tools and the same permission
   model. There are no UI-only writes.
4. **Every record says who did it:** the person, or an agent acting for that person.
5. **Writes go through `defineService()`**, so each one is permission-checked, audited and emits its
   events. A module writes only to its own schema, and imports only shared packages and other modules'
   `contracts.ts`. `npm run check:graph` enforces the boundaries.
6. **Screens lead with what needs attention**, then the detail. People review and decide; they don't
   type data in.
7. **Mock and demo data stay clearly fictional.**
8. **Accessibility:** WCAG 2.2 AA, keyboard-complete, respects reduced motion, light and dark themes.

Review enforces rules 1 and 2 through `.specclaw/review/rules/R3-chat-first-and-pins.md`.

## Git workflow

- `git pull --ff-only origin main` before starting work.
- Work on a feature branch, never on `main`: `claude/<task>`, `<handle>/<topic>`, or the specclaw branch.
- Make small, focused commits whose messages say *why*.
- Push with `git push -u origin <branch>`, then `gh pr create --base main`. Ask for review in the PR body.

## Commands

```bash
pnpm install
pnpm dev           # web app
pnpm test          # vitest via turbo
pnpm lint          # lint + module graph check
pnpm build
```
