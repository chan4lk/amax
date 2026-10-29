# Point the hosted amax URL at amaxerp.com only

**Change:** 075-amaxerp-url · **Created:** 2026-10-29 · **Review:** change

## Problem

The hosted amax now lives only at `https://amaxerp.com`; `amax.tecbizsolutions.com` was removed from the
server's Caddy routes on 2026-10-29 and returns 404. The repo still points at the old host: the `amax`
Claude Code plugin's default MCP URL, its README and `docs/parallel-builds.md`. A plugin installed with
the default config would therefore fail to connect.

## Mock Delta

None. No screen changes; this is config and docs. [`075-amaxerp-url`](../../mock/index.html#075-amaxerp-url)
has no section.

## Acceptance Criteria

1. **AC-1** `plugins/amax/.mcp.json` defaults `AMAX_MCP_URL` to `https://amaxerp.com/api/mcp`, and
   `claude plugin validate plugins/amax` passes.
2. **AC-2** `plugins/amax/README.md` and `docs/parallel-builds.md` name `https://amaxerp.com` as the hosted URL.
3. **AC-3** `git grep tecbizsolutions -- ':!.specclaw/changes/archive'` returns nothing. Archived change
   records keep the old host as history.

## Tasks

- [ ] `T1` — Point the plugin's default MCP URL and the docs at amaxerp.com (AC-1, AC-2, AC-3)
  Files: plugins/amax/.mcp.json, plugins/amax/README.md, docs/parallel-builds.md

## Verify
