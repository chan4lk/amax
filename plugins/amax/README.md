# amax plugin for Claude Code

Developer tools for amax, over the amax MCP server. The plugin is meant to grow: each capability is
one skill under `skills/`.

| Skill | What it does |
|---|---|
| `/amax:sync-specclaw` | Pushes this repo's specclaw change status (phase, tasks, PR, verdict) to the amax project's proposals |

## Install

```text
/plugin marketplace add chan4lk/amax
/plugin install amax@amax
```

The plugin connects to `https://amaxerp.com/api/mcp`. Set `AMAX_MCP_URL` to use another
amax. Sign in when Claude Code asks, the first time a tool runs. If you already added amax as an MCP
server yourself, either connection works.

## Set up a repo

1. Add the project key to `.specclaw/config.yaml`:

   ```yaml
   amax:
     project: CON
   ```

2. Ask the project's PM to link the repo in amax chat: "link CON to https://github.com/example/portal,
   default branch main". amax refuses pushes from any repo other than the linked one, and only the
   default branch named there may update every change.

## Sync

```text
/amax:sync-specclaw
```

The skill reads `.specclaw/` at your current commit, asks amax for a preview, and applies after you
confirm. `.specclaw` must have no uncommitted changes, so the commit sent describes what is synced.

What amax accepts:

- **Who:** you're on the project (Engineer) or manage it (PM). Every write is recorded under your name.
- **Where:** only the project's linked repo. An unknown project is refused: amax never creates one from a push.
- **What:** a push from the default branch stored with the link covers every change. A push from any other branch covers
  only its own change (`specclaw/<NNN-slug>`), since it may have been cut from an older main. Never
  Released, which comes from Prod deployments. Never a step back to an earlier phase. Never a proposal
  made by hand or from another source.
- **When:** never a proposal from a commit older than the one it was last pushed from. A commit time in
  the future is refused. Pushes to one project run one at a time, and each push applies all of its
  changes or none of them.
- **How much:** at most 200 changes per call, inside amax's per-caller rate limit. A push with nothing
  new returns `unchanged`. It adds no row to the Repo sync card, and one audit entry records the commit
  it was read at.

Each project's page in amax shows a **Repo sync** card: the linked repo, the last sync, and refused pushes with their reasons.

## Sync automatically with a Claude Desktop routine

The sync reads your local checkout, so it runs as a **local** scheduled task on your machine, not as
a cloud routine.

1. In Claude Desktop, open **Code**, then create a new scheduled task (routine).
2. Set the folder to the repo, and pick a schedule, for example every hour on weekdays.
3. Use this prompt:

   ```text
   /amax:sync-specclaw --apply
   ```

With `--apply`, the skill applies the preview unless amax flags it with `needsReview`. Standing skips
don't set the flag: Released changes waiting for a Prod deployment, or a branch behind main. Anything
else sets it, so the run stops and the preview stays in the task's history for you to review.

The plugin sends only the repo's normalised name (`github.com/example/portal`), never credentials from
your `origin` URL. amax refuses a repo URL that contains a user name or token.

## Develop

`scripts/read-specclaw.mjs` is generated from `scripts/src/read-specclaw.ts`, which reuses amax's own
specclaw reader (`modules/delivery/sync/specclaw.ts`). After changing either, run `pnpm build:plugin`
from the amax repo root. `plugins/amax/tests/reader.test.ts` fails when the bundle is out
of date.
