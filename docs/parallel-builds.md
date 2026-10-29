# Building on two machines

Two Claude Code sessions build amax at the same time: **vps** (the primary, a VPS that also hosts https://amaxerp.com) and **mac** (the secondary). They coordinate only through git on `github.com/chan4lk/amax`. There's no other service to run.

## How it works

- `node scripts/queue.mjs status` shows every change as done, claimed by a machine, ready, not approved, or blocked on a dependency.
- `node scripts/queue.mjs next --machine <name> --lanes <lanes>` claims the next **ready** change in those lanes. It commits `.specclaw/changes/<id>/claim.md` and pushes. Git rejects a second push of the same claim, so two machines can never claim the same change.
- A change is **ready** when all three are true:
  - Its proposal is approved.
  - Nobody has claimed it.
  - Every **Depends on** change is done.
- **Integrates with** never blocks: build against the other module's `contracts.ts` stub and degrade gracefully if it's missing.
- A change is **done** when it's merged and archived (`/specclaw:archive` moves its folder to `.specclaw/changes/archive/` on `main`). That's the moment the changes depending on it become ready.

## Who builds what

The lane split keeps the machines in different folders, so merges stay trivial.

| Machine | Lanes | Changes | Starts |
|---|---|---|---|
| vps (primary) | Platform, Delivery, Finance, Intelligence | 002–010, 017–019, 025–027, 029–035, 038, 039 | now (002 and 003 are approved) |
| mac (secondary) | People, Payroll, IT, Talent, Sales, Integrations | 011–016, 020–024, 028, 036, 037 | once 002 and 003 are archived (011 HR core is its first) |

The primary owns the critical path (platform, then delivery) and the deployment; the secondary picks up module lanes and helps the primary when its lanes have nothing ready.

When one machine runs out of ready work in its lanes, run `next` with no `--lanes` and it will take anything ready.

## The loop (same on both machines)

1. `git pull` then `node scripts/queue.mjs next --machine <name> --lanes <lanes>`. Exit code 2 means nothing is ready; wait and retry later.
2. `/specclaw:plan <id>`, then `/specclaw:build <id>`. With `git.strategy: worktree-per-change`, each build runs in its own worktree and branch.
3. `/specclaw:verify <id>`, then `/specclaw:pr <id>`. Merge the PR once CI is green: three deploy targets, boundaries, the module standard and tests.
4. `/specclaw:archive <id>` on `main`, then push. This is what unblocks dependants.
5. If a change has to be abandoned: `node scripts/queue.mjs release <id> --machine <name>`.

## Rules for both machines

- The project's Claude Code hooks (`.claude/settings.json`) are in the repo, so both machines run the same boundary and graph checks on every edit, commit and push.

- Follow `docs/module-standard.md`: touch only your module's folder. The mock is read-only during builds.
- Platform packages (`packages/*`, `apps/web`) are changed only by Platform-lane changes. If a module needs something from a platform package, raise it in a Platform change; don't edit the package from the module.
- Each module change publishes its `contracts.ts` (with stubs) in its first task and pushes it early, so the other machine can build against it.
- Never claim or build a change that isn't approved. Approvals stay with the product owner.

## Setting up the secondary (mac)

1. Install Node 22+, pnpm, Docker or Podman (for local Postgres and MinIO), `git` and `gh` (`gh auth login` as an account with push access to `chan4lk/amax`).
2. Install Claude Code and the specclaw plugin: `/plugin` → `chan4lk/specclaw`.
3. `git clone https://github.com/chan4lk/amax && cd amax`.
4. Start Claude Code in the repo and give it the prompt below.

### Prompt for the mac agent

> You are the **mac** builder for amax, the secondary machine. Read `docs/parallel-builds.md`, `docs/architecture.md` and `docs/module-standard.md` first. Work only on lanes People, Payroll, IT, Talent, Sales and Integrations.
>
> Loop:
> 1. Run `node scripts/queue.mjs next --machine mac --lanes People,Payroll,IT,Talent,Sales,Integrations`. If it prints "nothing ready", wait 30 minutes (`node scripts/queue.mjs status` shows what you're waiting on) and try again.
> 2. For the claimed change, run `/specclaw:plan`, `/specclaw:build`, `/specclaw:verify` and `/specclaw:pr`.
> 3. When CI is green, merge, then `/specclaw:archive` and push.
>
> Never edit `packages/*`, `apps/web`, the mock, or another module's folder. Never claim a change that isn't approved. If something in a platform package blocks you, release the claim (`node scripts/queue.mjs release <id> --machine mac`) and write the blocker in that change's `status.md` Issues section.
