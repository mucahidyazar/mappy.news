# syntax=docker/dockerfile:1.7
#
# One build, three runtime targets:
#   web      Next.js standalone server on port 3000
#   worker   news bot worker (a single bundled file, no node_modules)
#   migrate  applies ./drizzle migrations and the idempotent seed, then exits
#
#   docker build --target web -t mappy-news-web .

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
# Coolify passes NODE_ENV=production to every stage, but the build needs the devDependencies.
ENV NODE_ENV=development
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm config set store-dir /pnpm/store && pnpm install --frozen-lockfile

FROM deps AS builder
COPY . .
ARG NEXT_PUBLIC_APP_URL=https://mappy.news
ARG NEXT_PUBLIC_CONTACT_EMAIL=
ARG SOURCE_COMMIT=
ENV NODE_ENV=production \
  NEXT_TELEMETRY_DISABLED=1 \
  NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL} \
  NEXT_PUBLIC_CONTACT_EMAIL=${NEXT_PUBLIC_CONTACT_EMAIL} \
  SOURCE_COMMIT=${SOURCE_COMMIT}
RUN pnpm build && pnpm build:worker && pnpm build:scripts

FROM node:${NODE_VERSION}-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S -g 1001 app && adduser -S -u 1001 -G app app

FROM runtime AS migrate
COPY --from=builder --chown=app:app /app/dist/migrate.cjs /app/dist/seed.cjs ./dist/
COPY --from=builder --chown=app:app /app/drizzle ./drizzle
USER app
ENV MIGRATIONS_DIR=/app/drizzle
CMD ["sh", "-c", "node dist/migrate.cjs && node dist/seed.cjs"]

FROM runtime AS worker
COPY --from=builder --chown=app:app /app/dist/worker.cjs ./dist/worker.cjs
USER app
ENV WORKER_ALIVE_FILE=/tmp/worker-alive
# The worker touches WORKER_ALIVE_FILE on every heartbeat (15 s).
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD find /tmp/worker-alive -mmin -2 | grep -q . || exit 1
CMD ["node", "dist/worker.cjs"]

FROM runtime AS web
ENV PORT=3000 HOSTNAME=0.0.0.0
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
COPY --from=builder --chown=app:app /app/public ./public
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health > /dev/null || exit 1
CMD ["node", "server.js"]
