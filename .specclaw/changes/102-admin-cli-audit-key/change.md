# Admin CLI audit key

**Change:** 102-admin-cli-audit-key · **Created:** 2026-11-12

## Problem

`pnpm --filter @amax/auth admin principal-add` and `admin user-deactivate` crash before they do anything, with
"amax: configureRuntime({ db, auditKey }) before writing to the audit or trace chain". Both write an audit entry, but
`packages/auth/bin/admin.ts` opens the database without ever configuring the runtime's audit key. So nobody can create
a service principal from the CLI (the specclaw sync principal is the file's own example), or deactivate a user from it.

## Mock Delta

What changes on screen, and where to see it: [`102-admin-cli-audit-key`](../../mock/index.html#102-admin-cli-audit-key)

No screen changes. The section shows the CLI's output for `principal-add` before (the crash) and after (the principal and
its token), and the message it gives when `AUDIT_HASH_KEY` isn't set.

## Acceptance Criteria

1. **AC-1** With `DATABASE_MIGRATE_URL` and `AUDIT_HASH_KEY` set, `admin principal-add` creates the principal, prints
   its id and its token once, and writes the principal's audit entry, which verifies on the audit chain.
2. **AC-2** With the same variables, `admin user-deactivate` deactivates the user and writes its audit entry.
3. **AC-3** Every command that writes an audit entry (`principal-add` and `user-deactivate`) refuses to start when
   `AUDIT_HASH_KEY` is unset, with the message "set AUDIT_HASH_KEY (the deployment's audit key)", and exits non-zero
   before anything is written. `tenant-add`, `user-add` and `scim-token` keep working without it.
4. **AC-4** After its command finishes, the CLI exits on its own: it doesn't hang on an open database connection.
5. **AC-5** The usage comment at the top of `admin.ts` and the README's sign-in section name `AUDIT_HASH_KEY` for the
   commands that need it.
6. **AC-6** (added in review: round 1, then rounds 3–4 with the product owner's decision of 2026-11-12) Every command
   reads the environment through core's `loadEnv`, so an empty key or one under 32 characters stops it, as it stops
   the app. `principal-add` and `user-deactivate` also refuse, with "AUDIT_HASH_KEY is not this deployment's key"
   and nothing written, a key that doesn't reproduce the newest keyed audit row anywhere in the deployment. That
   includes a tenant with no audit rows of its own. They skip the check only when the deployment has no keyed rows.
   The cross-tenant read is one SECURITY DEFINER function (`core.latest_keyed_actor()`) that only the schema owner
   can call; the app role can't.

## Tasks

No UI: the change is the admin CLI only (the mock section shows its output).

- [x] `T1` — Admin CLI configures the runtime with `AUDIT_HASH_KEY` before `principal-add` and `user-deactivate`, and refuses them without it before connecting or writing (AC-1, AC-2, AC-3, AC-4); review rounds add the env check and the deployment-key probe (AC-6)
  Files: packages/auth/bin/admin.ts, packages/db/migrations/0032_deployment_key_probe.sql
- [x] `T2` — Test the CLI as a process against the test database: both commands succeed with the key and their audit entries verify on the chain, both exit non-zero with the message and write nothing without it, the other three commands still run without it, each run exits on its own within a timeout, and an empty, short or wrong key (on an old or a new tenant) is refused (AC-1, AC-2, AC-3, AC-4, AC-6)
  Files: packages/auth/tests/admin-cli-102.test.ts
  Depends: T1
- [x] `T3` — Name `AUDIT_HASH_KEY` for those two commands in the CLI's usage comment and the README's sign-in section (AC-5)
  Files: packages/auth/bin/admin.ts, README.md
  Depends: T1

## Verify

**Verdict:** PASS, with the review stopped at the five-pass cap (AGENTS.md): 0 blockers, 1 major and 1 minor open
(below). Verified at `c7fe3b66` on 2026-11-12.

- AC-1: pass — `admin-cli-102.test.ts` AC-1: `principal-add` exits 0, prints `principal <id>  token (shown once): <token>`,
  writes `auth.principal.create`, and `verifyAuditChain` is ok.
- AC-2: pass — AC-2: `user-deactivate` exits 0, the user is `deactivated`, an audit row is added and the chain verifies.
- AC-3: pass — AC-3 row `null`: both audited commands exit non-zero with "set AUDIT_HASH_KEY (the deployment's audit
  key)", the audit count is unchanged, and `tenant-add`, `user-add` and `scim-token` run without the key.
- AC-4: pass — AC-4 runs `principal-add`, `user-deactivate` and `scim-token`; each returns with no spawn error and no
  signal inside the 60 s budget.
- AC-5: pass — the header of `packages/auth/bin/admin.ts` and README.md's sign-in section name `AUDIT_HASH_KEY` for
  the two commands and say every command checks the environment as the app does.
- AC-6: pass — AC-3 rows `""` and `"short-key"` stop with "AUDIT_HASH_KEY: at least 32 characters"; the wrong-key rows,
  on the seeded tenant and on a new one, stop with "AUDIT_HASH_KEY is not this deployment's key" and write nothing.
  The app role gets "permission denied for function latest_keyed_actor" on the local database. Open on this AC: the
  major below (a deployment with no keyed rows at all still takes any long-enough key).

**Commands** (Windows host, local Postgres 16):

- `pnpm --filter @amax/auth test`: exit 0, 71/71 (102: 8/8). `@amax/db` tests: exit 0, 9/9.
- `@amax/core` tests after the migration: 166/167; the one failure is `ac5-adapters` (backslash paths, host-only).
- `pnpm lint`: exit 0. `pnpm build`: exit 0.
- `pnpm turbo run test --continue --force`: exit 1, 28/35 packages. Every failure is host-only or load: 60 s setup-hook
  timeouts (time, core), vitest cache races with a parallel run, `ac5-adapters`/`releases` backslash paths,
  `ac7-config` symlink EPERM, `spawn npx ENOENT`, `grid-perf` 2064 ms against 2000 ms, and compliance `daysLeft`
  (fixture date drift). None is in auth or db. CI's Linux run is the check of record.
- Quality: not_run (`specclaw-quality-scan` fails on Windows: jq "Argument list too long"). `specclaw-preset-check`
  flags none of this change's files; it fails repo-wide on files this change doesn't touch.
- Screenshot: not_run (`specclaw-screenshot`: `playwright` isn't on PATH). The mock section
  `#102-admin-cli-audit-key` was compared with the real CLI output on the local database (unset, short and wrong
  key: each message, exit 1). Compared by eye: Umar Ahamed.

### Review loop (2026-11-12)

Scope: commits after `90b4b7f6` (098's head; this branch is stacked on it). Models opus/opus.

| Round | Pass | Result |
|---|---|---|
| 1 | round | 1 major (key length unchecked, a second copy of core's rule) → `loadEnv`; 1 minor (AC-4 scope) fixed |
| 2 | round, since `d3f6b3fc` | clean; 2 pre-existing (sync bin, dev-seed read the raw key) to follow-ups |
| 3 | final | 1 major (a long-enough wrong key accepted) → per-tenant key check; 2 minors (docs, AC-1 action) fixed |
| 4 | round, since `9faae143` | 1 major (new tenant skips the check) → `core.latest_keyed_actor()` probe, product owner's decision |
| 5 | final | escalate: 1 major, 1 minor open; stopped at the cap |

**Open after pass 5 (not fixed; the cap stops the loop):**

- major [B6] `packages/auth/bin/admin.ts:41`: the check passes when the deployment has no keyed audit row yet, so on a
  fresh install the first `principal-add` takes any key of 32+ characters. That row then becomes the reference. The
  fix needs a stored key fingerprint (an HMAC of a fixed label, written when the app first configures the runtime) or
  a refusal until a reference exists. AC-3's wrong-key rows rely on AC-1 having written a row first.
- minor [B10] `packages/db/migrations/0032_deployment_key_probe.sql:10`: the header says the probe returns only a
  keyed hash, but it also returns the raw `actor` of another tenant's row. Comparing in SQL would return only
  match or no match.

Both, and the pre-existing sync-bin and dev-seed findings, are in `follow-ups.md` for a follow-up change.
