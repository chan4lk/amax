# Dev demo data in the main database

**Change:** 074-dev-demo-data · **Created:** 2026-10-25 · **Review:** covered-by 073-time-workflow-enhancements

## Problem

A fresh local setup (`docker start`, `pnpm install`, `pnpm db:migrate`, build, `pnpm --filter @amax/web dev`) gives an
almost empty app. The demo data lives in a separate `amax_demo` database built by a Git-excluded script
(`setup-demo.ps1`), so nobody else can run it. `seed:demo` exists but nothing calls it, and its command-line entry never
fires on Windows. Old test runs also leave about 20 stray databases behind.

**Amendment 1, 2026-10-25** (product owner: "is there a way to set this permanently so whenever the server is running it's
running"): in local dev, bells, email, Finance and Reports only update when someone posts to `/api/jobs/tick` by hand.
Production has a worker (`scripts/worker.mjs`) that ticks every minute; `dev` starts nothing. AC-9 to AC-11 cover this.

## Mock Delta

What changes on screen, and where to see it: [`074-dev-demo-data`](../../mock/index.html#074-dev-demo-data)

No app screen changes. The mock shows the terminal output of `pnpm --filter @amax/web dev` on a fresh database (the
demo seed runs, then Next starts) and on a second start (nothing new to add), plus Team time for week 43 showing the
demo data.

## Acceptance Criteria

1. **AC-1** `pnpm --filter @amax/web dev` seeds the Lumen Labs demo data before Next starts. That is every installed
   module's fixtures, then the 070–073 walkthrough extras: week-43 timesheets, Maya scoped to Lumen Labs Lanka, the AI
   data policy confirmed, and the Reports backfill. It uses `DATABASE_URL` from the environment or `apps/web/.env.local`.
   It prints one line, such as `demo data: seeded auth, time, …` or `demo data: already loaded`.
2. **AC-2** Seeding is idempotent. A second `dev` start adds no rows: every table's row count is unchanged. The walkthrough
   extras run once per database: they are skipped when the week-43 timesheets already exist, so they never overwrite
   later edits (a week Maya approved stays approved).
3. **AC-3** It runs only against a local database (host `127.0.0.1` or `localhost`). With any other host, or with
   `AMAX_SEED_DEMO=0`, it prints `demo data: skipped (…)` and starts Next unchanged. If seeding fails, the error is
   printed and Next still starts.
4. **AC-4** `pnpm --filter @amax/web seed:demo` works on Windows: the command-line check compares paths with
   `pathToFileURL`. The walkthrough extras move from the Git-excluded `demo-extras.sql` into a tracked seed file in
   `apps/web/scripts/`. `build`, `start`, CI and `pnpm db:migrate` don't seed.
5. **AC-5** Tests: AC-2 (seed twice, row counts unchanged, an approved week stays approved); AC-3 (a remote host and
   `AMAX_SEED_DEMO=0` skip); AC-4 (the command-line check with a Windows path). Existing tests pass unmodified.
6. **AC-6** Docs. The README's "Run locally" section opens with the five commands (PowerShell and bash) and the
   `apps/web/.env.local` keys they need (`DATABASE_URL`, `AUTH_SECRET`, `AUDIT_HASH_KEY`, `CRON_SECRET`, the demo
   sign-in keys, and `ANTHROPIC_API_KEY` for chat), and says the demo data loads on `dev`.
   `DEMO.md` moves to `docs/demo/time-070-073.md`, pointed at the main database and those commands, with no
   `amax_demo` or `setup-demo.ps1`. `setup-demo.ps1` and `demo-extras.sql` are removed, and so is the
   `.git/info/exclude` line for the old demo folder.
7. **AC-7** Local cleanup, run once and recorded under Verify, not code: drop `amax_demo`, `amax_e2e_time` and every
   leftover `amax_test_*` and `amax_tpl_*` database on the dev Postgres, leaving `amax`. Tests rebuild their templates
   on the next run.
8. **AC-8** A live check: from the five commands on a fresh `amax` database, sign in as Maya. Team time for week 43
   shows 125.0 h, and the DEMO steps A1 and C1 match.

9. **AC-9** `pnpm --filter @amax/web dev` also starts the jobs tick: `scripts/worker.mjs`'s `runWorker` posts to
   `http://localhost:{PORT or 3000}/api/jobs/tick` with `CRON_SECRET` (from the environment or `.env.local`) every 10 s
   (`AMAX_TICK_SECONDS` overrides it) while Next runs, and stops when Next stops (Ctrl+C included).
10. **AC-10** Same guard as the seed: it runs only for a local `DATABASE_URL` and with `CRON_SECRET` set; otherwise, or with
    `AMAX_DEV_TICK=0`, it prints `jobs tick: off (…)` once. Its log is quiet: one line when a tick delivered something
    (`jobs tick: 3 events`) or failed after Next is ready, nothing for an empty tick. `worker.mjs`'s own command-line
    check works on Windows too.
11. **AC-11** Tests: the guard (local, remote, no secret, `AMAX_DEV_TICK=0`) and the quiet log. Live: Maya approves a week
    and, with no manual tick, Kasun's bell has the notice within 30 s. The README and the demo guide drop the manual
    tick step.

## Decisions

- **D1** Seed on `dev` start, not in `db:migrate` (product owner, 2026-10-25). CI and production run migrate but never
  `dev`, so they get no demo data.
- **D2** The walkthrough extras keep their fixed dates (week 43 is Oct 19–23, 2026), as the fixtures do. Rolling dates
  are out of scope.
- **D3** (amendment 1) Tick every 10 s in dev, not production's 60 s, so a demo sees results quickly. Finance's two ticks
  then take about 20 s.

## Tasks

- [x] `T1` — Dev seed on `dev` start with the walkthrough extras, local-only guard and the Windows CLI fix (AC-1, AC-2, AC-3, AC-4)
  Files: apps/web/scripts/dev-seed.ts, apps/web/scripts/demo-extras.ts, apps/web/scripts/seed-demo.ts, apps/web/package.json
- [x] `T2` — Tests for idempotency, the guard and the CLI check (AC-5)
  Files: apps/web/tests/dev-seed.test.ts
  Depends: T1
- [x] `T3` — README "Run locally", the demo guide moved to docs and pointed at the main database; old demo scripts removed (AC-6)
  Files: README.md, docs/demo/time-070-073.md, .specclaw/changes/073-time-workflow-enhancements/demo/setup-demo.ps1, .specclaw/changes/073-time-workflow-enhancements/demo/demo-extras.sql, .specclaw/changes/073-time-workflow-enhancements/demo/DEMO.md, .git/info/exclude
  Depends: T1
- [x] `T4` — Drop the stray local databases and run the live check from the five commands (AC-7, AC-8)
  Files: .specclaw/changes/074-dev-demo-data/change.md
  Depends: T1, T3
- [x] `T5` — `dev` starts the jobs tick beside Next, with the same local guard, a quiet log, and worker.mjs's Windows check (AC-9, AC-10)
  Files: apps/web/scripts/dev.ts, apps/web/scripts/dev-tick.ts, apps/web/scripts/dev-seed.ts, apps/web/scripts/worker.mjs, apps/web/package.json
- [x] `T6` — Tests for the tick guard and the quiet log (AC-11)
  Files: apps/web/tests/dev-tick.test.ts
  Depends: T5
- [x] `T7` — README and demo guide without the manual tick; live check that a bell arrives with no manual tick (AC-11)
  Files: README.md, docs/demo/time-070-073.md, .specclaw/changes/074-dev-demo-data/change.md
  Depends: T5

## Verify

Build notes (2026-10-25):
- `dev` runs `scripts/dev-seed.ts` before `next dev` (`… || echo demo data: not loaded`, so Next always starts).
  - The seed needs `AUDIT_HASH_KEY`: the compliance fixtures verify the audit chain, so it calls `configureRuntime` with the app's key.
  - It skips everything once the walkthrough is loaded. That keeps later starts at about 2 s, and it avoids a new `compliance.chain_check` row on every start.
  - `seed:demo` reloads module data on demand.
- AC-7: dropped 25 stray databases: `amax_demo`, `amax_e2e_time`, 20 `amax_test_*` and 3 `amax_tpl_*`.
  - Only `amax` and `postgres` remain.
  - The product owner also chose to recreate `amax` from scratch.
- AC-8, live: recreated `amax`, ran `pnpm db:migrate` (74 applied) and `pnpm --filter @amax/web dev`.
  - The dev log printed "demo data: seeded auth, allocations, … backup + the 070–073 walkthrough".
  - A1, as Maya: Team hours 125.0 h, Average utilisation 63%, People with missing days 3, Waiting for your approval 3. Rows: AR, DW, KD, NS, TW.
  - C1, as Tharushi: the chat header is "My timesheet · Week of Oct 12", with Fix an entry, Submit my week, What did I log this week? and What can you help me do here?
  - A second run of the seed printed "demo data: already loaded".
- Tests:
  - `apps/web/tests` 311/311, including `dev-seed.test.ts` (AC2, AC3 ×6, AC4) and the existing `seed-demo.test.ts` unchanged.
  - web `tsc` ok; `pnpm lint` ok.

Amendment 1 build notes (2026-10-25):
- `dev` now runs `scripts/dev.ts`, which starts `next dev` as a child process and runs `runWorker` beside it.
  - The tick posts to `localhost:{PORT}` every 10 s.
  - It stops when Next exits, and Next's exit code is passed on.
  - `scripts/dev-tick.ts` holds the guard (`tickPlan`, sharing `notLocal` with the seed) and the quiet log.
  - `worker.mjs`'s command-line check uses `pathToFileURL`.
- Live, after a restart:
  - The log printed `jobs tick: every 10 s` and Next was ready, then `jobs tick: 31 events`, then `jobs tick: 35 events` (the backlog).
  - Maya approved Kasun's 2026-W43 in chat (receipt "Approved · Kasun Dias, 2026-W43").
  - With no manual tick, his bell read "Your timesheet for 2026-W43 was approved" 10 s later (`jobs tick: 1 events`, now worded "1 event").
  - Ctrl+C wasn't exercised from a console; stopping the background task stopped both.
- Tests: `apps/web/tests` 317/317 (`dev-tick.test.ts`: AC10 ×5 plus the quiet log); web `tsc` ok; `pnpm lint` ok.
- The README and the demo guide no longer have the manual tick command.
