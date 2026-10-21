import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";

import type * as schema from "./schema";

type Schema = typeof schema;

/** Any Drizzle database over this schema: postgres.js in the app and worker, PGlite in tests. */
export type AppDatabase = PgDatabase<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;
export type AppTransaction = PgTransaction<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;
export type DbExecutor = AppDatabase | AppTransaction;

/** `execute()` returns an array with postgres.js and `{ rows }` with PGlite. */
export function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) {
    return result.rows as T[];
  }
  return [];
}
