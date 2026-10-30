# R3 — Chat does the writes; everything on screen is pinnable

Decided by the product owner on 2026-10-17. This applies to every change that touches UI under
`modules/*/ui/` or `apps/web/`.

Report these as findings:

- **No CRUD forms in pages.** A page or component that renders a `<form>`, a write dialog, an inline
  edit field or a button bound to a server action that creates, updates or deletes a record.
  Writes go through chat: an MCP write tool in `modules/<m>/mcp.ts` that runs only after chat's
  pending-action confirm (`packages/chat/src/engine.ts` `confirmAction`). In place of the form, the
  page offers an `IntentButton` / "Ask amax" control that opens chat with the record pinned and a
  prompt filled in, or chat suggests that write on the page through the module's `chatSuggestions`
  (amended by the product owner on 2026-10-23, 070 amendment 4); the record keeps its `PinButton`
  either way.
- **Missing chat tool.** A write the UI offers (or a removed form used to offer) that has no MCP
  write tool, so chat can't do it.
- **Missing pin.** A card, tile (`.tcard`, `.ticket`), stat, stage step, list item or table row that
  shows a record or a metric and has no `PinButton` (`packages/ui/src/components/PinButton.tsx`).
  Its `PinRef` must resolve through a read tool to that exact record. A pin with no matching read
  tool counts as missing.
- **Pin keyed on a name** (059). A record's `PinRef` names it by its UUID (the read tool's
  `pin: { id, of }`), never by a name, version tag or key that can be renamed or reused; a list,
  total or period is a `pin: "view"`. A new pin-resolving read tool without a `pin` spec, or a
  pin's label rewritten after a rename instead of read from the record, is a finding.
  `apps/web/tests/pin-refs.test.ts` and the registry's startup check catch most of these.

Not findings:

- Read-only controls: filters, tabs, sorting, search, pagination, navigation, view toggles.
- A record with a pin and no per-record Ask amax button, when a `chatSuggestions` entry for that page
  leads to the write (070 amendment 4).
- Auth screens (sign-in, sign-out) and the chat drawer's own composer and confirm/cancel buttons.
- Inline forms that predate 2026-10-17 in modules that a change doesn't touch. These are listed as
  a follow-up in `BACKLOG.md`. A change that *edits* such a component must move its writes to chat.
