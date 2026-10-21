# mappy.news

Map of local incidents in Türkiye with sources, reader reports and an AI news bot. Next.js 16 (App Router) ·
React 19 · TypeScript · PostgreSQL + Drizzle ORM · Better Auth · next-intl · Tailwind v4 + shadcn/ui · MapLibre.

## Commands
- `pnpm check` runs type-check (`next typegen && tsc`), lint and tests. Run it before calling a change done;
  `pnpm validate` adds the web, worker and script builds.
- Local database: `pnpm db:up` (Docker, localhost:54329), `pnpm db:migrate`, `pnpm db:seed --demo`.
- `pnpm dev` (web, :3000), `pnpm worker:dev` (news bot), `pnpm worker:once` (one bot pass).
- Schema changes: edit `src/lib/db/schema/*`, run `pnpm db:generate`, review the SQL in `drizzle/`.

## Layout
- `src/app/[locale]/(site)` public pages, `(auth)` sign-in and friends, `admin/` the admin panel, `src/app/api` routes.
- `src/lib/domain` pure helpers (text, location, ranks); `src/lib/bot` the news bot pipeline; `src/lib/news` story
  writes and schemas; `src/lib/auth` Better Auth, sessions and role permissions.
- `src/server` server-only queries (`server/admin`, `server/news`) and server actions (`server/actions`).
- `src/worker/index.ts` is the bot process; `drizzle/` holds the migrations; `messages/` the translations.

## Conventions
- All UI copy goes through next-intl. `messages/tr.json` and `messages/en.json` keep the same keys and ICU arguments
  (`test/i18n.test.ts`). Keys and arguments are type-checked against `messages/tr.d.json.ts`, which `next typegen`,
  `next dev` and `next build` generate. Numbers go through `{n, number}` or plurals, not bare `{n}`.
- Keys built from runtime data (DB codes, worker events, zod messages) go through `translateDynamic()`.
- Pages use the layout primitives in `src/components/layout/container.tsx` (`Container`, `Page`, `PageIntro`,
  `Panel`); don't introduce other page widths or paddings.
- Style with Tailwind and the theme tokens in `src/app/globals.css`; inline `style` only for runtime values and map
  markers. `globals.css` also defines the `data-open`, `data-checked`, `data-active`… variants the shadcn components rely on.
- Server actions return `ActionResult` through `runAction()`; throw `ActionError` for failures the UI explains and
  map its message to copy on the client.
- Raw `sql` fragments must not receive `Date` values (postgres.js can't serialize them there): use drizzle operators
  or `sqlTimestamp()`. PGlite, used in tests, accepts what postgres.js rejects.
- Tests: unit tests sit next to the code (`*.test.ts`); database tests live in `test/` on PGlite
  (`createTestDatabase()`); network access in bot code is injectable (`ctx.net`) and never real in tests.
- News bot: only the provider chosen in Admin → News bot → Settings is used, never a fallback. Provider refusals
  (credit, key, rate limit) pause analysis through `aiPause` without spending item attempts.
- The seed is idempotent and never overwrites admin edits; `--reset-categories` restores category defaults.
