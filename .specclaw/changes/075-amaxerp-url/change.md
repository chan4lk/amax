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

- [x] `T1` — Point the plugin's default MCP URL and the docs at amaxerp.com (AC-1, AC-2, AC-3)
  Files: plugins/amax/.mcp.json, plugins/amax/README.md, docs/parallel-builds.md

## Verify

**Verdict:** PASS

- AC-1: pass — `plugins/amax/.mcp.json` defaults to `${AMAX_MCP_URL:-https://amaxerp.com/api/mcp}`; `claude plugin validate plugins/amax` passes; `POST https://amaxerp.com/api/mcp` answers 401 (live, needs sign-in).
- AC-2: pass — `plugins/amax/README.md` and `docs/parallel-builds.md` name `https://amaxerp.com`.
- AC-3: pass — `git grep tecbizsolutions -- ':!.specclaw/changes/archive' ':!.specclaw/changes/075-amaxerp-url'` exits 1 (no hits). The only remaining hits are in this change doc, which leaves the grep scope when it's archived.

Commands:
- `pnpm lint` exit 0 (includes `amax graph check: ok`); `claude plugin validate plugins/amax` exit 0.
- No code changed (one JSON value, two doc lines), so test/build/e2e were not re-run.

Notes:
- `specclaw-preset-check .`: exit 1 from the repo-wide comment backlog; none in 075 files.
- Quality: `specclaw-quality-scan` not_run (jq "Argument list too long", as in 066–074).
- Screenshots: no app UI and no mock section.
- specclaw-review: not run per change (operator rule: review once per module end). Same-repo `change`-scope PR, so the review gate skips it.
- Server side (not in repo): Caddy `@amax` matches only `amaxerp.com` and `amax.tecbizsolutions.com` returns 404. The operator was asked to delete the old DNS CNAME in Cloudflare.
