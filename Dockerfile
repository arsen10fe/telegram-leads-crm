# syntax=docker/dockerfile:1
# One image for all services: web (Next.js), bot (grammY worker via tsx) and migrate (one-shot).

# ── deps: full node_modules. Prisma's postinstall generates the client into src/generated;
#    openssl is required by Prisma on Alpine. The DATABASE_URL is a throwaway: prisma.config.ts
#    resolves it eagerly, but no connection is made. Never --ignore-scripts (no client otherwise).
FROM node:22-alpine AS deps
RUN apk add --no-cache openssl
WORKDIR /app
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN --mount=type=cache,target=/root/.npm npm ci

# ── builder: the Next.js production build (the client generated in deps stays in src/generated).
FROM deps AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN npm run build

# ── runtime: non-root, production node_modules kept in full (the worker needs tsx, migrate needs
#    the prisma CLI). No `standalone` output: it once silently dropped modules in crmplat.
FROM node:22-alpine AS runtime
RUN apk add --no-cache openssl
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN addgroup -g 1001 app && adduser -D -u 1001 -G app app

COPY --from=deps --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/.next ./.next
COPY --from=builder --chown=app:app /app/src ./src
COPY --chown=app:app package.json package-lock.json next.config.ts tsconfig.json prisma.config.ts ./
COPY --chown=app:app prisma ./prisma
# Operational scripts run inside the container, e.g. `npx tsx scripts/ai-smoke.ts`.
COPY --chown=app:app scripts ./scripts

USER app
EXPOSE 3000
CMD ["npx", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
