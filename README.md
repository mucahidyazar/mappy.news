# mappy.news

A map of local incidents in Türkiye — traffic accidents, fires, crime, disasters — with the sources behind every
story. Readers report what they see and refine locations; a news bot reads RSS feeds and official X accounts,
picks out local incidents with AI, places them on the map and sends them to an editor.

- **Map** of published stories with clustering, category and time filters, search and a list of what is in view.
- **Stories** with sources, follow-ups, comments and reader location checks. Sensitive categories never show more
  than neighborhood-level positions.
- **Accounts** with email/password (verified) or Google, points and ranks for reports, checks and comments.
- **Admin panel**: review queue, story editor (merge duplicates, attach follow-ups), location checks, comments,
  users (roles, suspensions), categories, audit log.
- **News bot**: sources, live activity, every collected item with its decision, AI provider and model, budget and
  auto-publishing rules.

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · PostgreSQL with Drizzle ORM · Better Auth ·
next-intl (Turkish at `/`, English at `/en`) · Tailwind CSS v4 and shadcn/ui · MapLibre GL with OpenFreeMap tiles ·
AI SDK (OpenAI, DeepSeek, Google, Anthropic, xAI) · Nominatim geocoding · Resend for email.

## Getting started

Requirements: Node.js 24, pnpm 10 and Docker (for the local database).

```bash
pnpm install
cp env.example .env          # then fill in BETTER_AUTH_SECRET (openssl rand -base64 32) and the keys you have
pnpm db:up                   # PostgreSQL on localhost:54329
pnpm db:migrate
pnpm db:seed --demo          # categories, RSS sources, bot settings and sample stories
ADMIN_PASSWORD='…' pnpm create-admin you@example.com --name "Your Name"
pnpm dev                     # http://localhost:3000
pnpm worker:dev              # the news bot, in a second terminal
```

Without `RESEND_API_KEY`, verification and password-reset links are printed to the server log instead of emailed.

## News bot

The worker (`src/worker/index.ts`) runs three loops: collecting due sources, processing collected items, and hourly
maintenance. One worker runs per database (PostgreSQL advisory lock); the admin page shows its heartbeat and a live
event feed (LISTEN/NOTIFY).

For every item: cheap screening (age, length, incident keywords, topics that are never published) → the story page
is read when the feed only has a teaser → AI analysis (classification, a neutral Turkish write-up, the place as
written) → geocoding with Nominatim, never more precise than the text supports → de-duplication (the same incident
from another outlet becomes a source of the existing story; related reports get a suggested parent) → the review
queue, or auto-publishing when it is switched on and every threshold passes.

The AI provider and model are chosen in **Admin → News bot → Settings**. Only that provider is used — there is no
automatic fallback. When it refuses calls (no credit, a rejected key, a rate limit) analysis pauses, nothing is
lost, and the admin page says why; pressing "Scan now" or saving the settings retries right away. A daily budget
caps the estimated spend.

`/api/cron/bot` runs one pass for hosts that cannot keep a worker process running (`Authorization: Bearer $CRON_SECRET`).

## Scripts

| Command | |
| --- | --- |
| `pnpm dev` / `pnpm build` / `pnpm start` | web app |
| `pnpm worker:dev` / `pnpm worker` / `pnpm worker:once` | news bot worker |
| `pnpm check` | type-check, lint and tests |
| `pnpm validate` | `check` plus every production build |
| `pnpm db:generate` | SQL migration from schema changes (`drizzle/`) |
| `pnpm db:migrate` / `pnpm db:seed` | apply migrations / reference data (`--demo`, `--reset-categories`) |
| `pnpm create-admin <email>` / `pnpm make-admin <email>` | create an admin (password from `ADMIN_PASSWORD`) / promote a user |

## Deployment

`Dockerfile` builds three targets — `web` (Next.js standalone on port 3000), `worker` and `migrate` — and
`docker-compose.coolify.yml` runs them on Coolify: `migrate` applies migrations and the idempotent seed on every
deploy, then `web` and `worker` start. PostgreSQL is external (`DATABASE_URL`). Set the variables from
`env.example` in Coolify, and add `https://<domain>/api/auth/callback/google` to the Google OAuth client.
`/api/health` reports whether the app reaches the database.
