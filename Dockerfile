FROM node:26-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @amax/web build

# 029: the Temporal worker (AMAX_WORKFLOWS_ENGINE=temporal). Temporal's native bridge needs glibc,
# and the worker loads module manifests from source, so it ships the workspace rather than the
# standalone bundle. Build with --target temporal-worker; the default target is the web image below.
FROM node:26-bookworm-slim AS temporal-worker
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @amax/web gen && chown -R node:node /repo
USER node
WORKDIR /repo/apps/web
ENV NODE_ENV=production
CMD ["node", "--import", "tsx", "--import", "./scripts/ignore-css.mjs", "scripts/temporal-worker.ts"]

# 034: the restore drill and snapshot CLI (scripts/backups.ts). It migrates the scratch database, so it
# ships the workspace with every migration. Build with --target ops; the chart's restore-drill CronJob runs it.
FROM temporal-worker AS ops
CMD ["node", "--import", "tsx", "--import", "./scripts/ignore-css.mjs", "scripts/backups.ts", "drill"]

FROM node:26-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
# 063: standalone output leaves out public/ (the marketing video, poster, captions, share image).
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
COPY --from=build --chown=node:node /repo/apps/web/scripts/worker.mjs ./apps/web/worker.mjs
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
CMD ["node", "apps/web/server.js"]
