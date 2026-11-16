# Follow-ups

Deferred by the review loop: minors and pre-existing findings.

- [minor B4] `modules/delivery/sync/import.ts:58` The rule for which email names the owner (`r.owner ?? r.author ?? null`) is written twice: in `desired()` at line 28 and again in the staleness pre-pass. Make it one helper so the staleness check and the write can't drift apart. (round 1) <!-- fp:9c92bbbceaff -->
- [minor B4] `modules/delivery/sync/authors.ts:18` The shallow-clone check is written twice: inline in `authorsOf` (line 18) and again as `isShallow` (line 33). Both copies treat a failure as shallow today, but a later edit to one won't reach the other. Have `authorsOf` call `isShallow(root)`. (round 2) <!-- fp:8854b92d9fac -->
- [minor B3] `modules/delivery/sync/authors.ts:25` When `git log` succeeds but finds no commit that added the change.md, the author is `null` ('the repo names nobody'), and the sync then clears the stored owner. The self-sync (`bin.ts`) never checks that the working tree it reads matches `--sha`. So a folder that is in the tree but not committed at that sha reads as 'nobody', not as 'unknown'. Return `undefined` when the path isn't in the tree at `at` (for example, check first with `git cat-file -e <at>:<path>`). (round 2) <!-- fp:d29b921cf620 -->
- [minor B4] `modules/delivery/sync/authors.ts:25` 091 AC-3 adds `sync/sha.ts` as the one commit-sha rule for every specclaw writer. `authorsOf` still writes its own `/@([0-9a-f]{7,40})$/i` to take the sha off a record's `source`, and the bundled copy in plugins/amax/scripts/read-specclaw.mjs repeats it. If `SHA` changes, this copy stops finding the sha, and `authorsOf` falls back to the wrong revision. Build the regex from `SHA` in ./sha (same directory, so the plugin bundle picks it up). Minor because the two copies agree today. (round 3) <!-- fp:5c05dfd78182 -->
- [minor docs] `apps/mock/public/mock/index.html:3533` The mock's Repo sync row shows the skips of two different numbers merged into one group: "two changes numbered … (2): CON-074, CON-075". `groupSkips` (ui/skips.ts) groups by the exact reason text, and that text names the number and the folders ("two changes numbered 074: 074-a, 074-b"). So the code always gives one line per number. Show two lines in the mock, or change the grouping to match. (round 3) <!-- fp:8a1f8da7ed95 -->
- [minor B4] `modules/delivery/server/services.ts:307` The rule for when a sync must leave the stored owner alone (`owner_set_by_person`, or the email is unknown) is written twice. One copy is the SQL `personSet` in `upsertSpecProposal`. The other is the early return in `repoOwnerStale` (`server/owner.ts`). The two agree today. If either is edited alone, the 'unchanged' short-circuit and the actual write can disagree, giving a needless rewrite or a missed one. Fix: derive both from one predicate, or have the upsert take the frozen flag from `repoOwnerStale`'s own check. (round 4) <!-- fp:d108cada91bf -->
- [minor B3] `modules/delivery/mcp.ts:116` `SyncInput` now has `ownerEmail`, but the `sync_proposal` tool passes only a fixed list of fields to `syncProposal` and leaves `ownerEmail` out. A caller's `ownerEmail` is accepted and then silently dropped, so it reads as "couldn't be read": a new row gets no owner and an existing row keeps its owner. Either pass it through or remove it from the tool's input schema, so callers can't think it was applied. (round 4) <!-- fp:ee1720e53bfd -->
- [minor B1] `scripts/specclaw-sync-ci.mjs:23` `sameOnMain` treats a squash- or rebase-merged branch as merged only while its change folder on `main` is byte-identical to the branch's copy. If `main` edits that folder after the merge, before it's archived (status.md, a verify note), the branch counts as open again. CI then pushes it on every run, amax skips it as stale and sets needsReview, and the Repo sync card shows "Needs you" until the change is archived or the branch is deleted. A better rule: the branch's tip commit time is older than `main`'s last commit that touched the folder, or the branch tree is an ancestor state of `main`'s folder. (round 4) <!-- fp:5f5e958c00de -->
- [minor B6] `modules/delivery/server/push.ts:108` The AC-2 branch guard compares against any stored `source_ref`, including a proposal that was withdrawn because its folder was deleted from `main`. A new branch that reuses that number is then refused as "two changes numbered NNN", but no second folder exists anywhere. The CI's `taken` check doesn't see this case. Leave out withdrawn rows (`meta.withdrawn`), or give the skip its own wording so the reason isn't false. (round 4) <!-- fp:c6042574c238 -->
- [minor module-standard] `modules/delivery/db/migrations/0021_owner_set_by_person.sql:5` The backfill reads `core.audit_event` from inside a delivery migration. The module standard says migrations touch only the module's own schema. It also depends on the audit row format: any owner set that was audited under another action or resource stays false, and the next sync overwrites it. Write down why this cross-schema read is allowed, or do the backfill in a one-off script owned by the platform. (round 4) <!-- fp:a4f3405a5be5 -->
- [minor B10] `modules/delivery/server/owner.ts:41` Two JSDoc blocks are stacked. The first describes `repoOwnerStale`, but it sits above `ownerFrozen`, so it is attached to the wrong declaration and `repoOwnerStale` has no doc. Move it down to `repoOwnerStale`. (round 5) <!-- fp:b7769672eacb -->

## Open at the five-pass cap (round 5, final, 2026-11-10)

The review loop stopped here (AGENTS.md: five passes at most). No blocker. All four are for follow-up change 092, before
PR #113 merges: the first and last are regressions from round 4's fixes.

- **[major B7] `modules/delivery/server/services.ts:307`** "A person set the owner" is decided in JS from `found`, read
  without a lock before the upsert. An `update_proposal` or Suggested-owner accept that commits in between is
  overwritten by the sync's owner. Fix: decide it in SQL on the conflicting row (`delivery.proposal.owner_set_by_person
  or <email unknown>`), as before round 4, and keep `ownerFrozen` for the unchanged check only; test a real
  `update_proposal` racing a real push.
- **[major B1] `modules/delivery/sync/specclaw.ts:95`** The Owner line's email takes trailing punctuation (`,` `;` `.`)
  and markdown link brackets, so it matches nobody and the proposal goes Unassigned. Fix: match an email token ending in
  an alphanumeric TLD, trim `[]`; add those forms to the reader table; rebuild the plugin bundle.
- **[major B3] `modules/delivery/sync/authors.ts:34`** When the file is in the tree but `git log --follow
  --diff-filter=A` finds no add commit, the author is `null` ("nobody") and clears the owner. Fix: `undefined`
  (unknown), as for every other case git can't answer.
- **[major B1] `scripts/specclaw-sync-ci.mjs:28`** Squash-merge detection by commit time can leave out a branch with
  newer progress when main received an older copy of its folder later (a stacked PR). Fix: merged by content only when
  main's tree for the path equals the branch's, or the branch's last commit touching the path is an ancestor of HEAD;
  no timestamps.
- [minor B10] `modules/delivery/server/owner.ts:41` `repoOwnerStale`'s doc comment sits above `ownerFrozen`.
