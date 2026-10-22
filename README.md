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
AI SDK (OpenAI, DeepSeek, Google, Anthropic, xAI) · OpenStreetMap geocoding (Nominatim, Photon, optionally Overpass) ·
Resend for email.

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

For every item: cheap screening (age, length, incident keywords) → the story page is read when the feed only has a
teaser → AI analysis (classification, a neutral Turkish write-up, every address part the text gives) → placing it on
the map (below) → de-duplication (the same incident from another outlet becomes a source of the existing story;
related reports get a suggested parent) → the review queue, or auto-publishing when it is switched on and every
threshold passes (score, location confidence and precision, sensitivity, daily limit).

The AI provider and model are chosen in **Admin → News bot → Settings**. Only that provider is used — there is no
automatic fallback. When it refuses calls (no credit, a rejected key, a rate limit) analysis pauses, nothing is
lost, and the admin page says why; pressing "Scan now" or saving the settings retries right away. A daily budget
caps the estimated spend.

`/api/cron/bot` runs one pass for hosts that cannot keep a worker process running (`Authorization: Bearer $CRON_SECRET`).

### Locations

People use the map to choose where to live, so a story is placed as precisely as its text allows, and never more
precisely. The model reads il, ilçe, mahalle, street, house number, the other street of an intersection, a named
place, and a road with its section; `src/lib/bot/locate.ts` finds the ilçe (or il) and the mahalle first and keeps
every finer search inside that box:

- house number → Nominatim's structured address search;
- intersection → where both streets' OSM geometries meet (the shared node, with a self-hosted Overpass);
- named place → Photon and Nominatim, accepted only when the names agree on the words that tell the place apart and
  on what kind of place it is (`src/lib/geo/place-names.ts`); large places get the precision of their size;
- street → the stretch inside the mahalle, with Photon for OSM's other spellings ("Hoca Ahmed Yesevi"); a street name
  found in several parts of the ilçe, without a mahalle to choose by, stays at ilçe level;
- road section → the road inside the named section ("TEM, Avcılar mevkii"), as precise as the section is small.

A mahalle name shared by several places in the province is settled by the story's other place names, or not at all.
Coordinates never come from the model, and answers are cached for 30 days (`geocode_cache`). `pnpm eval:locations`
runs the resolver on real-world samples against the live services.

The public Nominatim and Photon instances allow about one request per second; a story takes one to seven, which is
enough for a few hundred stories a day. For more, self-host Nominatim and Photon with a Türkiye extract (and
Overpass for exact junction nodes), set their URLs and `GEOCODER_FAST=true`.

## Scripts

| Command | |
| --- | --- |
| `pnpm dev` / `pnpm build` / `pnpm start` | web app |
| `pnpm worker:dev` / `pnpm worker` / `pnpm worker:once` | news bot worker |
| `pnpm check` | type-check, lint and tests |
| `pnpm eval:locations [sample]` | the location resolver on real-world samples, against the live OSM services |
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
