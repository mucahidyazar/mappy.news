import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import type { Pool, PoolClient } from "pg";

const MIGRATION_FILE_PATTERN = /^(\d{4})_[a-z0-9_]+\.sql$/;
const MIGRATION_LOCK_NAME = "mappy.news:event-pipeline:schema-migrations";

export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly checksum: string;
  readonly sql: string;
}

export interface MigrationResult {
  readonly version: number;
  readonly name: string;
  readonly status: "applied" | "skipped";
}

interface AppliedMigrationRow {
  readonly checksum: string;
  readonly name: string;
}

export interface ApplyMigrationsOptions {
  readonly pool: Pool;
  readonly directory: string;
}

function parseMigrationVersion(name: string): number {
  const match = MIGRATION_FILE_PATTERN.exec(name);

  const version = match?.[1];

  if (!version) {
    throw new Error(`Invalid migration filename: ${name}`);
  }

  return Number.parseInt(version, 10);
}

function checksum(sql: string): string {
  return createHash("sha256").update(sql, "utf8").digest("hex");
}

function assertUniqueVersions(migrations: readonly Migration[]): void {
  const duplicate = migrations.find(
    (migration, index) =>
      index > 0 && migrations[index - 1]?.version === migration.version,
  );

  if (duplicate) {
    throw new Error(`Duplicate migration version: ${duplicate.version}`);
  }
}

export async function discoverMigrations(
  directory: string,
): Promise<readonly Migration[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const names = entries
    .filter(
      (entry) => entry.isFile() && MIGRATION_FILE_PATTERN.test(entry.name),
    )
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const migrations = await Promise.all(
    names.map(async (name): Promise<Migration> => {
      const sql = await readFile(join(directory, name), "utf8");

      return Object.freeze({
        version: parseMigrationVersion(name),
        name,
        checksum: checksum(sql),
        sql,
      });
    }),
  );

  assertUniqueVersions(migrations);
  return migrations;
}

async function ensureMigrationLedger(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      checksum CHAR(64) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      CONSTRAINT schema_migrations_checksum_format
        CHECK (checksum ~ '^[a-f0-9]{64}$')
    )
  `);
}

async function applyMigration(
  client: PoolClient,
  migration: Migration,
): Promise<MigrationResult> {
  const applied = await client.query<AppliedMigrationRow>(
    `
      SELECT name, checksum
      FROM schema_migrations
      WHERE version = $1
    `,
    [migration.version],
  );
  const installed = applied.rows[0];

  if (installed) {
    if (
      installed.name !== migration.name ||
      installed.checksum !== migration.checksum
    ) {
      throw new Error(
        `Migration ${migration.version} differs from the applied migration`,
      );
    }

    return Object.freeze({
      version: migration.version,
      name: migration.name,
      status: "skipped",
    });
  }

  await client.query(migration.sql);
  await client.query(
    `
      INSERT INTO schema_migrations (version, name, checksum)
      VALUES ($1, $2, $3)
    `,
    [migration.version, migration.name, migration.checksum],
  );

  return Object.freeze({
    version: migration.version,
    name: migration.name,
    status: "applied",
  });
}

async function applyInOrder(
  client: PoolClient,
  migrations: readonly Migration[],
  index = 0,
): Promise<readonly MigrationResult[]> {
  const migration = migrations[index];

  if (!migration) {
    return [];
  }

  const current = await applyMigration(client, migration);
  const remaining = await applyInOrder(client, migrations, index + 1);
  return Object.freeze([current, ...remaining]);
}

export async function applyMigrations({
  pool,
  directory,
}: ApplyMigrationsOptions): Promise<readonly MigrationResult[]> {
  const migrations = await discoverMigrations(directory);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      MIGRATION_LOCK_NAME,
    ]);
    await ensureMigrationLedger(client);
    const results = await applyInOrder(client, migrations);
    await client.query("COMMIT");
    return results;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
