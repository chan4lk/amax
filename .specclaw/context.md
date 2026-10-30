# Project Context

_Last updated: never — run `/specclaw-extras:context add` or merge a change to populate._

## Architecture Overview

<!-- High-level system description: key components, entry points, data flow. -->

_Not yet documented._

## Coding Style & Conventions

<!-- Language version, formatting rules, naming conventions, comment policy. -->

_Not yet documented._

## Key Patterns

<!-- Reusable patterns used across the codebase — auth, error handling, data access, logging, etc. -->

_Not yet documented._

## Technology Decisions

<!-- Why specific libraries/frameworks were chosen; version pins and why; migration paths. -->

_Not yet documented._

## Constraints

<!-- What NOT to do — banned patterns, deprecated APIs, performance floors, security rules. -->

- Review gate (074): a PR from a fork fails CI unless every change dir it touches holds a final
  specclaw-review round (`final: true`, not `not_run`/`skipped`, no open blocker, head inside the PR, at most
  five passes). Same-repo PRs are checked only for changes whose header says `**Review:** module-end`;
  that loop must run with `--since`. A fork PR that changes code with no change dir fails: propose first.
  A change reviewed by another change's loop on a stacked branch declares `**Review:** covered-by <NNN-slug>`
  and is judged by that change's final round (078): its `## Verify` must name this change, and its final pass
  must sit on the PR's branch after this change's commits (later commits: `.specclaw/` only, merges, the cover's
  own, or owned by another change in the PR whose final pass follows them). No chains, and no rounds of its own.

## Recent Decisions

<!-- Last 5 significant decisions from merged changes. Updated automatically on each PR merge. -->

_No decisions recorded yet._
