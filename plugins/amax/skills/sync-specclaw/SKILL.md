---
name: sync-specclaw
description: Push this repo's specclaw change status (phase, tasks, PR, verdict) to its amax project's proposals through amax's sync_specclaw MCP tool. Use when the user asks to sync specclaw to amax, update amax proposals from the repo, or when a scheduled routine runs /amax:sync-specclaw --apply.
argument-hint: "[--apply] [--project KEY]"
---

# Sync specclaw to amax

amax decides what it accepts. It refuses a push from a repo that isn't the project's linked repo, or
from someone not on the project. A push from the project's default branch (stored with the repo link)
covers every change. A push from any
other branch covers only its own change (`specclaw/<NNN-slug>`). For each proposal, amax skips anything
that would be Released, would move back a phase, or is older than the commit the proposal was last
pushed from. Report what amax says. Never work around a refusal.

`--apply` means an unattended run, such as a scheduled routine: apply without asking, but only when the
preview is clean (step 4). `--project KEY` overrides `amax.project` in `.specclaw/config.yaml`.

1. **Read the repo.** Run:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/read-specclaw.mjs" [--project KEY] > "${TMPDIR:-/tmp}/amax-sync.json"
   ```

   If it fails, show its one-line error and stop. The usual cause is uncommitted `.specclaw` edits or
   no project key. The file holds `projectKey`, `repoUrl` (the normalised name, never credentials), `ref`,
   `sha`, `committedAt` and `records`.

2. **Preview.** Call the amax MCP tool `sync_specclaw` with every field from the file and
   `dryRun: true`. If `records` has more than 200 entries, send it in batches of 200, in order.

3. **Show the result** in a few lines:

   ```
   amax sync: <repoUrl> @ <ref> <sha 7>  →  <projectKey>
   preview: <created> created · <updated> updated · <withdrawn> withdrawn · <unchanged> unchanged · <skipped> skipped · <ignored> not this branch's
     skipped <each skipped line>
   ```

   If `outcome` is `refused`, show the `reason` and stop. A missing or wrong repo link is fixed by the
   project's PM in amax ("link <KEY> to <repoUrl>"), not here.
   If `created` and `updated` are both 0 and `needsReview` is false, nothing changes. Still call
   `sync_specclaw` with `dryRun: false`, without asking, so amax records the commit each proposal was
   read at. Then say "amax is up to date" and stop.

4. **Apply.**
   - **Interactive (no `--apply`):** ask "Apply <n> changes to <projectKey>?". On yes, call
     `sync_specclaw` again with the same fields and `dryRun: false`, then show the counts. The
     outcome is `applied` when the push is listed on the project's Repo sync card. It is `unchanged`
     when there was nothing new and nothing to review.
   - **`--apply`:** apply as above when `needsReview` is false. amax sets it true only for skips a
     person should look at, such as an unreadable `state.json` or a key held by another proposal. It is
     false for the standing ones that come back on every run until main or a Prod deployment catches up.
     If it is true, apply nothing and report the preview.

5. Delete `${TMPDIR:-/tmp}/amax-sync.json`.
