# Review gate: a covering loop counts

**Change:** 078-review-covered-by · **Created:** 2026-10-30 · **Review:** change

## Problem

On a stacked branch, one specclaw-review loop often reviews several changes at once: 073's loop covered the 074–077
commits its branch carries (073 `## Verify`). The fork PR's `review-gate` only reads each change's own `review/`, so
074-dev-demo-data, 075-team-time-status-band, 076-chat-choice-cards and 077-time-requests-history fail with
"no final review round (review/ has 0 rounds)", although their code was reviewed.

## Mock Delta

What changes on screen, and where to see it: [`078-review-covered-by`](../../mock/index.html#078-review-covered-by)

No app screen. The mock adds sample `review-gate` output for a fork PR on a stacked branch: one change passes on its own
loop, two pass as `covered-by` it, and one fails because the change it names has no final round.

## Acceptance Criteria

1. **AC-1** A `change.md` header can declare `**Review:** covered-by <NNN-slug>`. `reviewScope()` returns the scope
   `covered-by` and the named change; `change` and `module-end` read as before, and a missing line still means `change`.
2. **AC-2** On a fork PR, a covered-by change is judged by the named change's review rounds at the PR head, with the
   same rules as any change (final round that ran, at most five passes, no open blocker without a stop, reviewed head in
   the PR). The line reads `pass — covered by <NNN-slug>: <that change's reason>` or `fail — covered by <NNN-slug>: <reason>`.
   The named change is read from the PR head whether or not the PR touches it.
3. **AC-3** A covered-by line fails when the named change doesn't exist at the PR head, names the change itself, or
   names a change that is itself `covered-by` (no chains). Amended after review round 2 (blocker: an old archived
   change could cover anything), it also fails when: the named change's `## Verify` doesn't name this change; its final
   pass is already in the PR's base; its final pass ran before every commit that touches this change's dir (active or
   archive); any PR commit after that final pass touches files outside `.specclaw/`, isn't a merge, and its subject
   names neither the covering change nor another change in the PR whose own final pass descends from it; or this
   change has review rounds of its own that ran. The scope is read from
   the header only, and `covered-by` takes its name from the same line.
4. **AC-4** On a same-repo PR a covered-by change skips, as a `change` scope does.
5. **AC-5** `packages/testing/tests/review-gate-covered.test.ts` covers AC-1 to AC-4, each AC-3 failure as a row of a
   variant table; `review-gate.test.ts` still passes.
6. **AC-6** AGENTS.md "Review scope" documents `covered-by`: use it only when the named change's loop actually reviewed
   this change's commits, and say so under that change's `## Verify`.
7. **AC-7** The headers of 074-dev-demo-data, 075-team-time-status-band, 076-chat-choice-cards and
   077-time-requests-history declare `**Review:** covered-by 073-time-workflow-enhancements`, and
   `node scripts/check-review-gate.mjs --base upstream/main --fork true` exits 0 on this branch.

## Tasks

- [x] `T1` — Gate reads `covered-by` and judges by the named change's rounds (AC-1, AC-2, AC-3, AC-4)
  Files: scripts/review-gate/rules.mjs, scripts/check-review-gate.mjs
- [x] `T2` — Tests for covered-by pass, missing, self, chain and same-repo skip (AC-5)
  Files: packages/testing/tests/review-gate.test.ts
  Depends: T1
- [x] `T3` — Document `covered-by` in AGENTS.md "Review scope" (AC-6)
  Files: AGENTS.md
- [x] `T4` — Declare `covered-by 073-time-workflow-enhancements` on 074–077 and run the gate on this branch (AC-7)
  Files: .specclaw/changes/074-dev-demo-data/change.md, .specclaw/changes/075-team-time-status-band/change.md, .specclaw/changes/076-chat-choice-cards/change.md, .specclaw/changes/077-time-requests-history/change.md
  Depends: T1

## Verify

**Verdict:** PASS

Verified 2026-10-30 at `3df8db96` plus the uncommitted review records.

- AC-1: pass — `reviewScope()` returns `{ scope, by }` from the header only; `change`, `module-end` and a missing line read
  as before (074 tests unchanged, 4/4); a `**Review:**` quote under `## Verify` doesn't change the scope (test AC1 AC2).
- AC-2: pass — a fork PR passes `103-stacked` by archived `101-cover`'s rounds when that loop ran after its commits, also
  after archiving, after a later commit owned by a change whose final pass follows it, after the cover's own later commit,
  and when the cover mentions `## Verify` in prose (5 rows, test AC1 AC2).
- AC-3: pass — 10 failing rows (test AC3): loop before the change, Verify doesn't name it, cover in base, own rounds,
  missing, self, unnamed (name on the next line), chain, a code commit after the cover's final pass, and an owner whose
  final pass came before the commit it claims.
- AC-4: pass — same-repo PR skips a covered-by change (test AC4).
- AC-5: pass — `review-gate.test.ts` 4/4, `review-gate-covered.test.ts` 16/16.
- AC-6: pass — AGENTS.md "Review scope" and `.specclaw/context.md` document `covered-by` and its checks.
- AC-7: pass — the gate in fork mode over this branch with the review records exits 0: 070–073 on their own loops,
  074–077 "covered by 073-time-workflow-enhancements", 078 "final round 4/5 escalate, 0 blockers, head 3df8db9 in PR"
  (`shots/gate-output.txt`; the committed `check-review-gate.mjs` confirms once the records are committed).

**Review loop (specclaw-review, cap of 5 passes), 2026-10-30.** Local copy of the reviewer (working-tree diff, base
`97269e03`, `PYTHONUTF8=1` on this Windows host). Round 1 not_run (cp1252 decode gave an empty diff), not counted.

- Round 2 (1 blocker, 1 major): an archived change with a clean loop could cover anything. Fixed: the cover's final pass
  must sit on the PR's branch after the change's commits, its `## Verify` must name the change, no own rounds.
- Round 3 (2 majors): later commits weren't all checked; archived history was lost. Fixed.
- Round 4 (5 majors): only commits touching the change dir were checked; subject-only ownership; `## Verify` matched in
  prose; git failures read as answers. Fixed, with the product owner's choice that a covered change is trusted exactly
  as far as its cover (merges and the cover's own later commits are excused; 073's fixes landed in `ea706ae4` after its
  recorded head).
- Round 5, final (escalate, 0 blockers, 3 majors): merge commits' own edits excused; renames read as records-only;
  no tests for those git edges. Two repeated, so the loop escalated.

**Stop.** The product owner chose to stop after the escalation at 4 counted passes, with 0 blockers and 3 majors open.
The majors and a redesign (rounds record the commit range they reviewed) are in `follow-ups.md`.

Commands:

- `pnpm build`: exit 0. `pnpm lint`: exit 0 (35/35). `node scripts/check-review-gate.mjs … --fork false`: exit 0.
- `pnpm turbo run test --filter @amax/testing`: exit 1, 34 passed, 4 failed, none in 078 files: `ac7-config` ×3 EPERM
  creating symlinks (Windows without symlink rights), `ac3-boundaries` ×1 5 s timeout on this host.
- `specclaw-preset-check .`: exit 1 from the repo-wide backlog; none in 078 files.
- `specclaw-quality-scan . --gate`: exit 126, not_run (jq "Argument list too long", as in 066–074).
- Screenshots: no app UI. `specclaw-screenshot` failed (Playwright not installed), so the mock was compared by eye.
- `pnpm lint` after the review fixes: exit 0 (35/35); gate tests 20/20.

- Mock `.specclaw/mock/index.html#078-review-covered-by`: compared by eye: Umar Ahamed, 2026-10-30 (no app UI).
