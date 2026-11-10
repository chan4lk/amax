# amax architecture

Two goals drive every choice here:
- **Simple to deploy anywhere:** Vercel, Cloudflare or k3s.
- **Modular enough** that separate teams, and separate agent runs, can build modules in parallel without stepping on each other.

## Runtime: one app, one database

```
            ┌──────────────── apps/web (Next.js 16) ─────────────────┐
browser ──► │ pages · server actions · /api/mcp · /api/chat · /api/jobs │ ──► Postgres
agents  ──► │        module registry (loads every module)              │ ──► S3-compatible files
            └──────────────────────────────────────────────────────────┘
                     ▲ scheduler calls runDueJobs() every minute
```

| Concern | Choice | Why it travels well |
|---|---|---|
| Web | Next.js 16, App Router, `output: "standalone"` | One build output: Vercel serves it natively, Cloudflare runs it through the OpenNext adapter, and k3s runs it as a Docker image |
| Database | Postgres through **Drizzle ORM** with the `postgres` driver | Works in Node and on Cloudflare Workers (via Hyperdrive); Neon, Supabase, RDS and an in-cluster Postgres all just work |
| Auth | Auth.js (NextAuth v5) with OIDC; Microsoft Entra ID is the first provider | Google Workspace and Okta work later through the same code path |
| Files | An S3 API | AWS S3, Cloudflare R2, or MinIO on k3s |
| Background work | `@amax/workflows`: durable workflows (`step`, `sleep`, `waitForEvent`, `cron`) for agent runs and schedules. Default engine: Postgres, driven by the tick (Vercel Cron, Cloudflare Cron Trigger, or the k3s `worker` Deployment). Optional engine: **Temporal** (self-hosted on k3s or Temporal Cloud) for heavy, long agent runs | The same module code runs on either engine; nothing extra to operate unless you choose Temporal |
| Notifications | `modules/notifications` turns domain events into in-app, email (Graph/SMTP) and Teams messages, with preferences, digests and quiet hours | Modules never send messages themselves |
| Events between modules | Transactional outbox (`core.event`), processed by `runDueJobs()` | No message broker required |
| Config | Environment variables only, validated at boot | The same config works on every host |
| Deploy artifacts | `vercel.json`, `wrangler.jsonc` (OpenNext), `Dockerfile` and `deploy/helm/amax` | CI builds all three on every pull request |

Rule: **no host-specific APIs in module code.** Anything that depends on the host (files, scheduling, environment) goes through `packages/core` adapters.

## Repository layout

```
apps/
  web/                 Next.js app: layout, shell, the module mount point, API routes
packages/
  core/                tenancy, entities, currency, service pipeline, audit, outbox, jobs, adapters
  db/                  Drizzle client, migration runner (runs each module's migrations in order)
  auth/                Auth.js config, roles, data scopes, field masking, the "View as" helper
  ui/                  design tokens (CSS variables), components (cards, tables, chips, charts, chat bubbles)
  mcp/                 MCP server; modules register tools here
  chat/                amax chat engine; modules register intents here
  agents/              suggestions (evidence, confidence, approve, undo), the agent run model
  workflows/           durable workflow API; Postgres engine (default) and Temporal adapter
  testing/             fixtures loader, contract tests, a11y and visual-diff helpers
modules/
  delivery/  time/  allocations/  hr/  leave/  onboarding/  payroll/  payroll-lk/  payroll-au/
  finance/  expenses/  accounting/  presales/  it-access/  helpdesk/  recruitment/  learning/
  insights/  reports/  inbox-agent/  keyflow/  notifications/
deploy/
  helm/amax/           web Deployment, worker Deployment, Ingress, Postgres optional (bitnami subchart)
```

## The module contract

Every module is a workspace package (`@amax/<name>`) with the same shape:

```
modules/hr/
  module.ts            manifest: id, nav entries, roles and permissions, routes, MCP tools,
                       chat intents, jobs, events it emits and handles, fixtures
  db/schema.ts         tables in its own Postgres schema (hr.employee, hr.document …)
  db/migrations/       its own migrations, which only touch its own schema
  server/              services, built with core's pipeline: authorize → validate → write → audit → emit
  actions.ts           server actions for its screens (they call the services)
  mcp.ts               MCP tools (they call the same services)
  chat.ts              chat intents: fields, prompts, the create call
  ui/                  React screens and components, built only from @amax/ui
  contracts.ts         the only thing other modules may import: types, read functions,
                       command functions, event names
  fixtures/            demo data for this module (it reads shared people and projects from core fixtures)
  tests/
```

- **Mounting:** `apps/web/app/(app)/[module]/[[...path]]/page.tsx` resolves the route through the registry. Adding a module means one line in `apps/web/modules.ts`; nothing else in the app changes.
- **Shell slots (030):** `topBar` adds a control to the top bar (the notifications bell) and `menu: "profile"` puts a module's root screen in the profile menu instead of the rail. `events.handlesFrom` builds handlers from every installed manifest (notifications turns other modules' `notifications` rules into outbox handlers). A module starts a 029 run with `startWorkflow()` from `@amax/workflows`; the host registers its engine with `setWorkflowEngine()`, so no module imports an engine.
- **Module slots (081):** when a module's screen needs what a module depending on it knows, the screen's owner declares a slot (its name and type) in its `contracts.ts`, and the other module fills it through its manifest's `provides`. The owner reads it with `provided()` from `@amax/core/server`. The app sets slots once at boot with `setProvided()`, from the installed list, so a switched-off module fills nothing and the slot reads empty. The graph keeps its direction. Time fills Delivery's `delivery.proposal-time` with a proposal's time lines, filtered by Time's own visibility rule.
- **Boundaries** are enforced by an ESLint import rule plus a CI check:
  - A module may import `@amax/core`, `@amax/ui`, `@amax/auth`, `@amax/db`, `@amax/ai`, `@amax/agents`, `@amax/workflows` and other modules' `contracts.ts`, and nothing else. No module or package imports a model provider SDK; every LLM call goes through `@amax/ai` (033).
  - For example, `payroll` reads leave through `@amax/leave/contracts`, never through `leave/db`.
- **Data ownership:**
  - A module writes only its own schema.
  - Cross-module reads go through contract functions, which apply the caller's data scope.
  - Cross-module writes go through **command functions** on the owning module's contract (for example `hr.contracts.createPersonFromHire`). A command runs the owner's service, authorised as the caller and audited; it never touches another schema directly.
  - Cross-module reactions go through events. Example: `hr.person.left` makes `it-access` revoke access as a suggestion that someone must approve.
- **Dependencies:** manifest slots that are plain data (chat intents, notification rules, retention rules) need no dependency on the change that consumes them. Calling `@amax/agents` (suggestions) or `@amax/workflows` (jobs, schedules) is a hard dependency on 006 or 029.
- **Every write** goes through the service pipeline, so every path (UI, MCP, chat, agent, pipeline) gets the same permission check and the same audit record.
  - **Idempotency keys (042, 043):** a caller that may retry a write (chat's "Add it", presales' promote) runs it under `withIdempotency(key, fn)` from `@amax/core/idempotency`. The rules:
    - The call makes exactly one top-level service write. The caller checks the count. A chat confirm also declares the tool's service, and any other service is refused before it writes.
    - A command run from inside another service's `run` is nested. It takes a key derived from the outer one (`<outer>/1`, `<outer>/2`, … in call order), so a retry replays it instead of writing it twice. It isn't counted as a second top-level write. Its commit is counted apart, and a failure after it closes the chat card as unknown, never as a retry.
    - The caller looks the key up once before running. The service claims the key and settles it in its own transaction. A stored outcome comes back as `ReplayedError` or `CancelledByKeyError`, never as a value cast to the service's result.
    - Chat binds its records to the person, and a lookup by anyone else is refused.
  - Three writes are exempt from `defineService()` (052, 035). A new exemption needs its own entry here, with its reason.
    - **Chat's own transcript:** the messages, pending cards, decisions, title and pins in `chat.conversation`. It is the person's working state, not a business record. Each row is reachable only by its owner (`user_id` plus tenant RLS), and every turn, proposed card and decision is a step in the immutable trace (`core.trace_event`). What a person decides through chat still goes through a service and is audited: archiving a conversation and every confirmed write tool.
    - **The OAuth protocol's token writes** in `packages/mcp/src/oauth.ts`: `issueCode` (consent), `exchangeToken` (code exchange and refresh rotation, including reuse detection) and `revokeToken`. They run before there is a signed-in viewer to authorise: the protocol itself is the check (PKCE, the client, the code or refresh token). Each one still writes its audit row with `appendAudit` in the same transaction, as the person the token belongs to (`auth.oauth.*`). The Admin's revoke of a client grant is a service (`revokeMcpClient`).
    - **The client-credentials token write** in `packages/auth/src/client-credentials.ts` (035): a service credential trades its key for a short-lived access token at `/oauth/token`. There is no viewer yet: the key itself is the check. It writes its audit row with `appendAudit` in the same transaction, as the credential (`auth.principal.token_issued`). Creating, rotating and revoking credentials are services.
- **Retention and erasure (032):** modules declare retention as data in their manifest (`retention`, with `subject`, `subjectName` and `entity` columns, and `subjectIds` for the ids they know a person by). The app registers the platform's own entries (chat, workflows, api) beside the modules' from one list, `apps/web/lib/privacy-sources.ts`. A request refuses to open or complete while any rule can't be counted, so nothing is left behind unseen. Rows found only by a `subjectName` (a name, not an id) are never acted on automatically: the request lists them for review and the approver includes or excludes them when completing it, and that decision is recorded. The platform enforcer in `@amax/core/privacy` applies those declarations; modules write no purge code.
  - The daily purge is the `core.privacy-purge` workflow (029). It runs `purgeDue`, a `defineService` under a system job context, so it is audited once per run by class and count, never by value. It replaces `workflows.prune`, which ignored legal holds.
  - A legal hold pauses the purge for rows whose `subject` columns name the held person or matter, or whose `subjectName` columns hold a held person's name. A rule with no `subject` column can't be tied to a person, so it pauses entirely while any hold is active.
  - Periods: the longest of the module's declaration (or the tenant's own period) and the country pack's statutory minimum for the row's legal entity (or every entity, when the table has no entity column). A tenant can never set a period below a statutory minimum.
  - **Append-only stores keep their rows.** `core.audit_event`, `core.trace_event` and `ai.call` are append-only and their triggers stay. Retention for them means the daily write-once export (050), not a delete. Erasure nulls a person's raw identifying values in the audit and trace chains (chain v2 hashes only keyed values, so both chains still verify). Audit rows written before migration 0021 (chain v1) hash the raw values, so they are kept and listed in the request as "kept: pre-2026-10-17 audit format". `ai.call` holds no content, only an id, and is kept.
  - **The erasure gate:** only `amax_privacy`, a NOLOGIN role, has EXECUTE on `core.erase_subject()`. The app reaches it only through `privacy.erase_request(id)`, a SECURITY DEFINER function owned by `amax_privacy` that erases the stored subjects of one erasure request, and only once a second person has approved it. `amax_app` is never granted `core.erase_subject()`.
  - **Two-person rule:** an access or erasure request is opened and completed through chat write tools. Completing it needs a different person with the Admin or HR role. The rule is one function, `setSecondApproval()` in `@amax/core/privacy`, which 006 (agent governance) replaces with its approval flow.
- **Agent output is a suggestion (006).** A module declares suggestion kinds in its manifest (`suggestions`, `defineSuggestionKind()` from `@amax/agents`). Only a person's acceptance runs the change, inside the decision's transaction; sensitive kinds need someone other than the person the agent acted for, irreversible ones a second approver, and the rest can be undone for 7 days or until the kind's cutoff. Agent runs are the `agents.run` workflow, with a read-only tool allow-list. See `packages/agents/README.md`.
- **Backups and export (034):** point-in-time recovery is the host's (CloudNativePG on k3s, managed Postgres on Vercel and Cloudflare). On top of it, `@amax/core/backup` takes a nightly snapshot of each tenant, sealed with the tenant's data key and written only in its data region, drills a restore of it every week into a scratch database (`apps/web/scripts/backups.ts drill`), builds whole-tenant exports behind a second Admin, and destroys a leaving tenant's data key after 30 days through a gated database function (`backup.destroy_data_key`). Modules declare nothing for it: every table with a `tenant_id` is included. See `docs/operations.md`.
- **Ownership:** `CODEOWNERS` maps each `modules/<name>/` folder to its team (HR team → `hr`, `leave`, `onboarding`; IT department → `it-access`, `helpdesk`; and so on). The platform team owns `packages/` and `apps/web`.

## Parallel development, for teams and agent runs

- Each specclaw change names the module it touches and its **Depends on** list (see `.specclaw/STATUS.md` and the roadmap).
- Changes with no unmet dependency can be built at the same time. specclaw uses `worktree-per-change`, so each agent run works in its own git worktree and branch.
- Module changes only touch their own `modules/<name>/` folder plus one line in `apps/web/modules.ts`, so merge conflicts are rare and trivial.
- **Contract-first:** when module B needs something from A, A's change publishes the contract (types plus a stub) first, so B can build against it before A finishes.

## Static mock

The GitHub Pages site (`app/` at the repo root today) only hosts the interactive mock. When change 001 lands, the real app moves into `apps/web`. The mock site then becomes `apps/mock` (static export), separate from the deployable product.
