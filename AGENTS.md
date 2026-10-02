# AGENTS.md

> Project map for AI agents. Keep it factual and update it when the structure changes
> (the Documentation section is maintained by `/aif-docs`).

## Project Overview

Lidogram (working title) is a mini-CRM for a digital agency. Leads come in from a Telegram bot, from a
connected personal Telegram account (Telegram Business), or are added manually. Leads get tags. An AI
layer qualifies leads, drafts replies, and can answer clients with handoff to a manager. Built as a
3-day job test assignment; details and grading criteria live in `.ai-factory/DESCRIPTION.md`.

## Tech Stack

- **Programming language:** TypeScript
- **Framework:** Next.js 16 (App Router) + grammY bot worker
- **Database:** PostgreSQL
- **ORM:** Prisma ORM 7.x (pinned)
- **AI:** OpenAI Responses API with zod structured outputs
- **UI:** shadcn/ui (`radix-nova`) + Tailwind CSS v4

## Project Structure

The layout follows `.ai-factory/ARCHITECTURE.md` (Structured Modules, Technical Layer). The package
is ESM (`"type": "module"`); the bot worker runs TypeScript directly with `tsx`.

```
.
├── .ai-factory/              # AI Factory context: config, description, architecture, rules, plans,
│                             #   QA, patches — local only: git-ignored, not in the public repository
├── .claude/                  # agents, settings, workflow + project skills (see below)
├── .github/workflows/ci.yml  # CI: lint, typecheck, unit + integration tests (Postgres 17), build
├── data/                     # source brief from the employer (.docx) — git-ignored, read-only
├── deploy/                   # shared-host deploy: pack.sh (release tarball), snapshot.sh (read-only
│                             #   host snapshot), backup.sh + cron.d/lidogram, nginx/ vhosts
├── docker/postgres-init.sql  # creates lidogram_test in the dev Postgres container
├── docs/
│   ├── deployment.md         # production runbook: what runs where, redeploy, rollback, host rules
│   ├── process-log.md        # running log of prompts and decisions for the retrospective
│   ├── product-sketch.md     # product sketch deliverable (Russian)
│   ├── retrospective.md      # retrospective deliverable (Russian)
│   └── screenshots/          # CRM screenshots used by README.md (demo data only)
├── prisma/
│   ├── schema.prisma         # data model; generator "prisma-client" → src/generated/prisma
│   ├── migrations/           # committed migrations (never `db push`)
│   ├── seed.ts               # create-only seed: demo manager, agency profile, demo tags/leads
│   └── seed-data.ts          # demo agency «Пиксель и Код» content
├── scripts/ai-smoke.ts       # manual OpenAI check (status, latency, tokens; `--models` lists models)
├── src/
│   ├── app/                  # Next.js routes: login, (crm)/{leads,leads/[id],tags,dashboard,settings},
│   │                         #   api/healthz, api/changes (change stamp polled by AutoRefresh)
│   │   └── _lib/             # session (cookies), action results, rate limit — web layer only
│   ├── components/
│   │   ├── ui/               # shadcn primitives (radix-nova)
│   │   └── crm/              # AppShell, badges, ConversationThread, TagMultiSelect, AutoRefresh…
│   ├── lib/                  # client-safe UI helpers: cn, date formatting (Moscow), Russian labels
│   ├── modules/              # feature modules shared by web + worker
│   │   ├── leads/            # leads, tags, messages, drafts, ingestion, AI-facing API
│   │   ├── channels/         # Telegram: bot (intake form, Business), sendToLead, notifications
│   │   ├── ai/               # OpenAI adapter, prompts, qualification, copilot, autopilot
│   │   ├── settings/         # agency profile, knowledge base, AI defaults, trigger words
│   │   ├── auth/             # login, session tokens, Telegram linking for notifications
│   │   └── dashboard/        # read-only aggregates
│   ├── proxy.ts              # Next 16 proxy: redirects unauthenticated requests to /login
│   ├── shared/               # env, logger, errors, db, time, jobs (Postgres job queue)
│   ├── worker/               # bot process: main.ts (polling + job runner), job-handlers.ts
│   ├── test/                 # integration-test DB lifecycle (migrate, truncate)
│   └── generated/prisma/     # generated Prisma client — git-ignored
├── Dockerfile                # one image for web, bot and migrate
├── compose.prod.yml          # production: postgres, migrate (one-shot), web, bot; web on 127.0.0.1 only
├── compose.edge.yml          # optional Caddy edge (80/443, automatic TLS) — dedicated servers only
├── Caddyfile                 # Caddy config used by compose.edge.yml
├── compose.yml               # dev-only Postgres (127.0.0.1:5433) for those who use Docker
├── prisma.config.ts          # Prisma 7 config (loads .env, datasource URL, seed command)
├── vitest.config.mts         # projects "unit" and "int" (int needs TEST_DATABASE_URL)
├── eslint.config.mjs         # Next rules + module import boundaries
├── .env.example              # every env variable, documented (dev + production section)
└── AGENTS.md                 # this file
```

## Key Entry Points

| File | Purpose |
|------|---------|
| `data/*.docx` | The original assignment brief (Russian) |
| `.ai-factory/DESCRIPTION.md` | What we build and how it is graded — start here |
| `.ai-factory/ARCHITECTURE.md` | Where code goes, dependency rules, data model |
| `.ai-factory/plans/lidogram-mvp.md` | Implementation plan with progress checkboxes |
| `docs/process-log.md` | Prompt and decision log — append after every significant step |
| `prisma/schema.prisma` | Data model |
| `src/shared/db.ts` | The single Prisma client (lazy; UTC database sessions) |
| `src/shared/jobs/index.ts` | Job queue: `enqueue` in a transaction, `startJobRunner` |
| `src/modules/leads/services/ingest-inbound-service.ts` | Every inbound message: persist first, then jobs |
| `src/modules/channels/create-bot.ts` | grammY bot: `ALLOWED_UPDATES`, controllers, error handler |
| `src/modules/channels/services/send-to-lead-service.ts` | The only outbound path to a client |
| `src/modules/ai/services/autopilot-service.ts` | Autopilot: triggers, caps, decisions, handoff |
| `src/worker/main.ts` | Bot process entry point (long polling + job runner) |
| `src/worker/job-handlers.ts` | Job type → module service |

## Local Development

- Postgres: Homebrew `postgresql@17` on `127.0.0.1:5432` (or `docker compose up -d postgres` on 5433).
  Databases `lidogram` (dev) and `lidogram_test` (integration tests).
- `npm run dev` (CRM on http://localhost:3100), `npm run bot:dev` (bot worker with the DEV bot token),
  `npm run db:migrate`, `npm run db:seed`, `npm test` (integration tests run when
  `TEST_DATABASE_URL` is set in `.env`), `npm run typecheck`, `npm run lint`.
- Manual OpenAI check: `npx tsx --env-file-if-exists=.env scripts/ai-smoke.ts [--models]`.

## Project Skills

| Skill | Use for |
|-------|---------|
| `telegram-lead-bot` | grammY bot: intake form, Telegram Business, `sendToLead`, notifications, bot tests |
| `lead-ai-pipeline` | AI layer: qualification/tags, autopilot, copilot, prompts, OpenAI adapter, AI tests |
| `prisma-orm-setup`, `prisma-client-api` | Prisma 7 setup and queries (do **not** take the Prisma 8 path) |
| `nextjs-app-router-patterns`, `vercel-react-best-practices` | Next.js/React patterns (prefer Next 16 conventions: `proxy.ts`) |
| `shadcn` | UI components (`radix-nova` preset) |

## Documentation

| Document | Path | Description |
|----------|------|-------------|
| README | README.md | Public landing page (Russian): the brief, how each point is met, stack, demo, screenshots |
| Process log | docs/process-log.md | Prompts, decisions, and screenshots list for the retrospective |
| Deployment | docs/deployment.md | Production runbook for the shared VPS: commands, redeploy, rollback, rules |

## AI Context Files

| File | Purpose |
|------|---------|
| AGENTS.md | This file — project map for agents |
| .ai-factory/DESCRIPTION.md | Product specification, deliverables, tech stack |
| .ai-factory/ARCHITECTURE.md | Architecture decisions and guidelines |
| .ai-factory/rules/base.md | Coding conventions and lessons learned |
| .ai-factory/config.yaml | AI Factory settings (languages, paths, git) |

## Agent Rules

- Never combine shell commands with `&&`, `||`, or `;` when they change state. Run each step as a
  separate command so failures are visible and permissions stay precise.
  - Wrong: `git checkout main && git pull`
  - Right: first `git checkout main`, then `git pull origin main`
- Communicate with the user in Russian; write code, comments, and `.ai-factory` artifacts in English.
  Product UI, bot texts, and prompts are Russian.
- The required path is **Telegram message → lead → tag in the CRM**. No change may make it depend on
  the LLM.
- After every significant step (plan, feature, deploy, key decision), append an entry to
  `docs/process-log.md`: time, tool, the prompt verbatim, and the decision. The retrospective is
  built from it.
- Never commit `.env*` (except `.env.example`), tokens, or the `data/` brief. Never print secrets in
  logs or chat.
- Do not run `prisma skills sync`, `shadcn mcp init`, or `shadcn add --overwrite` without the user's
  explicit approval.
- Schema changes go through committed Prisma migrations only.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
