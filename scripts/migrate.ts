/**
 * Applies the SQL migrations in ./drizzle. Creates the database first when it does not exist and the
 * role may create databases, so a fresh server only needs `pnpm db:migrate`.
 *
 *   pnpm db:migrate                    (development)
 *   node dist/migrate.cjs              (production image, MIGRATIONS_DIR=/app/drizzle)
 */
import "./load-env";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

function quoteIdentifier(name: string) {
  return `"${name.replace(/"/g, '""')}"`;
}

async function ensureDatabase(url: string) {
  const target = new URL(url);
  const name = decodeURIComponent(target.pathname.replace(/^\//, ""));
  if (!name) throw new Error("DATABASE_URL must include a database name");

  const maintenance = new URL(url);
  maintenance.pathname = "/postgres";
  maintenance.search = "";
  const admin = postgres(maintenance.toString(), { max: 1, onnotice: () => {}, connect_timeout: 10 });
  try {
    const rows = await admin`select 1 from pg_database where datname = ${name}`;
    if (rows.length > 0) return;
    await admin.unsafe(`create database ${quoteIdentifier(name)}`);
    console.log(`[migrate] created database ${name}`);
  } catch (error) {
    // No access to the maintenance database or no CREATEDB right: assume the database is managed elsewhere.
    console.warn(`[migrate] could not check or create database ${name}: ${(error as Error).message}`);
  } finally {
    await admin.end({ timeout: 5 });
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  await ensureDatabase(url);

  const sql = postgres(url, { max: 1, onnotice: () => {}, connect_timeout: 15 });
  const startedAt = Date.now();
  try {
    await migrate(drizzle(sql), { migrationsFolder: process.env.MIGRATIONS_DIR ?? "drizzle" });
    console.log(`[migrate] database is up to date (${Date.now() - startedAt} ms)`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error("[migrate] failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
