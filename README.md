# amax

An agent-native ERP for software and professional-services companies, covering delivery, people, payroll and money. Agents keep the records: commits log time, deployments move releases, and an inbox agent turns Teams and email into suggestions. People make the decisions. Every capability is an MCP tool with the same permissions as the UI.

**Live mock:** https://chan4lk.github.io/amax/ (the interactive mock is at `/mock/`)

## What's here

| Path | What it is |
|---|---|
| `AGENTS.md` | Agent guide: key files, specclaw workflow, core rules (chat-first, pins) |
| `PRODUCT.md` | Product brief: users, purpose, positioning, principles |
| `docs/roadmap.md` | Modules and phasing, from PSA to services ERP |
| `.specclaw/changes/001-amax-foundation/` | The first specclaw change: scope, 17 acceptance criteria, and `fixtures.md` (the single source of demo data) |
| `.specclaw/mock/index.html` | The interactive whole-app mock, built as one self-contained HTML file |
| `docs/reviews/` | Adversarial reviews of the mock |
| `app/` | A minimal Next.js 16 app that statically exports the landing page and serves the mock |

## Run locally

### With the demo data (from change 074)

Five commands give a working app with the fictional Lumen Labs demo data. In PowerShell (bash: `export` instead of
`$env:`):

```powershell
docker start amax-dev-postgres                       # first time: docker compose -f deploy/dev/compose.yaml up -d
pnpm install --frozen-lockfile
$env:DATABASE_MIGRATE_URL = "postgres://amax:amax@127.0.0.1:5440/amax"
pnpm db:migrate
pnpm --filter @amax/web build                        # optional: catches type and build errors
pnpm --filter @amax/web dev                          # http://localhost:3000
```

They need `apps/web/.env.local` (not committed):

```bash
DATABASE_URL=postgres://amax_app:amax_app@127.0.0.1:5440/amax
AUTH_SECRET=<32+ random characters>
AUDIT_HASH_KEY=<openssl rand -hex 32>
CRON_SECRET=<openssl rand -hex 16>
AMAX_AUTH_DEMO=1
AMAX_AUTH_DEMO_TENANT=11111111-1111-4111-8111-111111111111
AMAX_AUTH_PASSWORD_TENANT=11111111-1111-4111-8111-111111111111
ANTHROPIC_API_KEY=<your key>                         # chat with the real model
```

On its first start against a database, `dev` loads the demo data: every module's Lumen Labs data, then the Time
walkthrough in [`docs/demo/time-070-073.md`](docs/demo/time-070-073.md). It prints `demo data: seeded …`. Later starts
print `demo data: already loaded` and change nothing. It only seeds a local database (`127.0.0.1` or `localhost`), and
`AMAX_SEED_DEMO=0` turns it off. `dev` also runs the jobs tick every 10 seconds (`AMAX_TICK_SECONDS` changes it,
`AMAX_DEV_TICK=0` turns it off), so bells, email, Finance and Reports update without posting to `/api/jobs/tick`. Sign in at `/signin` with a demo email such as `maya@lumenlabs.test`.

### Without a database

```bash
npm install
npm run dev        # http://localhost:3000, mock at /mock/
npm run build      # static export to out/
```

### Database (from change 003)

```bash
podman compose -f deploy/dev/compose.yaml up -d        # or docker compose
export DATABASE_MIGRATE_URL=postgres://amax:amax@127.0.0.1:5440/amax      # schema owner
export DATABASE_URL=postgres://amax_app:amax_app@127.0.0.1:5440/amax      # app role, RLS applies
export AUDIT_HASH_KEY=$(openssl rand -hex 32) CRON_SECRET=$(openssl rand -hex 16)
pnpm db:migrate
pnpm test          # DB tests run when DATABASE_MIGRATE_URL is set (required in CI)
```

### Sign-in (from change 002)

With `DATABASE_URL` set, every screen needs sign-in (set `AUTH_SECRET` too). Two ways in:

- **Email + password** (hosted or demo deployments without an identity provider):
  ```bash
  pnpm --filter @amax/auth admin tenant-add "Lumen Labs"          # prints the tenant id
  export AMAX_AUTH_PASSWORD_TENANT=<tenant id>
  pnpm --filter @amax/auth admin user-add --tenant <id> --email you@example.com --name "Your Name" --roles Admin
  ```
  Passwords are scrypt-hashed; five wrong attempts lock the account for 15 minutes.
- **Microsoft Entra ID**: seed the first tenant with `AMAX_SEED_*` (see `packages/auth/src/seed.ts`) and run `pnpm --filter @amax/auth seed`. The app registration must emit the `groups` claim. A Microsoft button appears only for tenants with a provider.

For local development, `AMAX_AUTH_DEMO=1` and `AMAX_AUTH_DEMO_TENANT=<id>` add a fixtures-only "sign in as" form (ignored in production).

The app still boots without a database; `/api/jobs/tick` answers 503 until one is configured.

GitHub Pages deploys from `main` through `.github/workflows/pages.yml`, with `BASE_PATH=/amax`.

All demo data is fictional (Lumen Labs, Maya Fernando and others). Client names are Microsoft sample companies.
