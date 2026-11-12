# Follow-ups

Deferred by the review loop: minors and pre-existing findings.

- [minor B2] `modules/delivery/tests/repo-sync-096.test.ts:85` The AC-4 `releasedAt` bound is tested only through `syncProposal`, and with two variants. The push (`sync_specclaw` → `upsertSpecProposal`) is the main writer and has no test for a future or malformed `releasedAt`, so 'every writer' isn't shown. Add push-path rows for a future time, a time with no offset, and a past time. (round 1) <!-- fp:f509ccc818e9 -->
- [minor B4] `modules/delivery/sync/sha.ts:18` The 'one read rule' gives two answers. `isRead` needs a non-empty ref before `@<sha>` (`search > 0`), but `refOf` (withdraw.ts) and the author walk use the bare `AT_SHA`, which also matches a source with no ref. The new rule also stops rejecting whitespace, which the old READ did, so arbitrary text ending in `@<sha>` now counts as a read. Fix: put the ref requirement into the shared regex (for example `^(?=\S)(\S+)@(SHA)$`) so every caller applies the same rule. (round 2) <!-- fp:363317326261 -->
- [major B6] `modules/delivery/sync/import.ts:141` When the self-sync withdraws a proposal, it sends the stored meta back through `syncProposal` unchanged, including `meta.repoPhases`. Since 094, stored phases are entries of the form `{ at, source }`. `SyncInput.meta` validates `repoPhases` with `repoPhasesInMeta`, which only accepts plain time strings (services.ts:238). So the withdrawal is refused and the whole self-sync run throws. Fix: drop `repoPhases` from the meta that goes back through the service, so the locked-row rule keeps the stored entries. The push's withdrawal at push.ts:150 already avoids this by calling `upsertSpecProposal` directly. Add a test that withdraws a proposal that has recorded repo phases. (round 3) <!-- fp:1f070e348f48 -->
- [minor B1] `modules/delivery/sync/specclaw.ts:97` When `phases.archived.at` is missing, `releasedAt` falls back to `stamps.at(-1)`. `stamps` is sorted as raw strings before `instant()` runs, so with mixed offsets or formats the last string is not always the latest time, and a string `instant()` rejects can be picked over a valid one. Fix: run each stamp through `instant()`, drop the nulls, then sort the ISO results. The plugin bundle has the same code (`plugins/amax/scripts/read-specclaw.mjs`:93). (round 3) <!-- fp:46f37966b9a5 -->
- [minor B4] `modules/delivery/server/repo-time.ts:21` The server reads repo times by two rules. `releasedAt` goes through `instant()`, which accepts a bare date, no offset, or `+0530`. Phase times go through `z.string().datetime({ offset: true })`, both in `repoPhasesInMeta` (the SyncInput refine) and in `isTime`. So one hand-written value is accepted in one field and refused or dropped in the other, and offset forms are stored as sent instead of normalised. The comment on `repoInstant` says the server applies the reader's rule, but that holds only for `releasedAt`. Run phase times through `instant()` on the server too. (round 3) <!-- fp:c15e9935cae0 -->
- [minor docs] `modules/delivery/README.md:47` The README's 096 sentence says a phase the repo reached stays recorded, but it leaves out the final pass's limit: stored phases are kept only while the row holds the same change folder (`source_ref`) and isn't withdrawn. A folder renamed on the default branch, which 091 allows, therefore starts again from its new read. The README should state this rule and its consequence for renames, so the code and the docs agree. (round 4) <!-- fp:471278b859b4 -->
- [minor B4] `modules/delivery/server/proposal-detail.ts:51` `repoBy` still has its own `@<sha>$` regex for the history line's 'read at …' text. 096 rounds 1–2 made `sync/sha.ts` (`READ` / `readParts`) the one `<ref>@<sha>` rule for every caller. This copy doesn't check the ref part, so a stored read that isn't `<ref>@<sha>` is still shown as one. It should shorten the sha through `readParts` and fall back to plain 'From the repo' when the source isn't a read. (round 4) <!-- fp:fa71f19d8854 -->

## Open at the five-pass cap (2026-11-10)

Fixed in 096: every finding of rounds 1–4 (one releasedAt rule and one time normaliser for reader and server; one
`<ref>@<sha>` rule; stored reads kept; the self-sync's withdrawal keeps recorded phases; renames keep their phases;
phase times by `instant()` on the server; the history line by the read rule; DB-backed push tests).

Still open, for the next change:

- [major B1] `modules/delivery/server/repo-time.ts:49` `storedPhasesFor` starts a withdrawn row afresh by `isWithdrawn`,
  which is also true for a proposal a person withdrew by hand (`withdrawProposal` sets `withdrawn_at`; its folder stays).
  Every later sync of such a proposal then drops phases a read leaves out, removes `meta.repoPhases` when the sender
  didn't read them, and replaces each phase's first read. Fix: start afresh only when the folder went (`meta.withdrawn`
  set by planWithdrawals), not on `withdrawn_at`; correct the README sentence and the doc comment; test a real
  `withdrawMissing` push and a hand-withdrawn proposal whose folder stays. (round 5)
