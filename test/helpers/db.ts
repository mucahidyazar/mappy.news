import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import * as schema from "@/lib/db/schema";
import type { AppDatabase } from "@/lib/db/types";
import { CATEGORY_SEEDS } from "@/lib/domain/seed-data";

/** A migrated in-memory Postgres (PGlite) with the seed categories. */
export async function createTestDatabase() {
  const client = new PGlite();
  const db = drizzle(client, { schema, casing: "snake_case" });
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(schema.categories).values(CATEGORY_SEEDS.map((category, index) => ({ ...category, sortOrder: index })));
  return { db: db as unknown as AppDatabase, close: () => client.close() };
}
