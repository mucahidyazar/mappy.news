# mappy.news

## Commands
- `npm run check` runs type-check, lint and unit tests. Run it before calling a change done; `npm run validate` adds coverage and a production build.
- Unit tests only collect `src/features/event-pipeline/**/*.test.ts` (see `vitest.config.ts`). Name integration tests `*.integration.test.ts` or `*.e2e.test.ts`; they run with `npm run test:integration`.

## Conventions
- Style with Tailwind classes; theme colors go through `bg-[var(--color-theme-*)]`. Inline `style={{}}` only for runtime-computed values and Leaflet markers. Use `cn()` for conditional classes and `hover:` utilities instead of mouse-enter/leave handlers.
- Forms use React Hook Form with zod. Server state uses TanStack Query rather than fetching in `useEffect`.
- All UI copy goes through next-intl `useTranslations()`; keep `messages/en.json` and `messages/tr.json` in sync.

## Data
- Auth and user profiles use Supabase (`src/lib/supabase.ts`). `src/lib/database.ts` still uses SQLite through better-sqlite3, and `npm run migrate:legacy` moves that data to Supabase. Check which store a feature uses before changing its data access.
