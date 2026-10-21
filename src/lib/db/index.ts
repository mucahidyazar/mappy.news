import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export { schema };

type Sql = ReturnType<typeof postgres>;

const globalForDb = globalThis as unknown as { __mappySql?: Sql };

function createSql(): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  return postgres(url, {
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idle_timeout: 30,
    connect_timeout: 10,
    onnotice: () => {},
    connection: {
      application_name: process.env.APP_NAME ?? "mappy-news",
      statement_timeout: 15_000,
      TimeZone: "UTC",
    },
  });
}

/** Created on first use so importing this module never opens a connection (builds, tests). */
export function getSql(): Sql {
  if (!globalForDb.__mappySql) globalForDb.__mappySql = createSql();
  return globalForDb.__mappySql;
}

function createDb() {
  return drizzle(getSql(), { schema, casing: "snake_case" });
}

export type Database = ReturnType<typeof createDb>;

const globalForDrizzle = globalThis as unknown as { __mappyDb?: Database };

function getDb(): Database {
  if (!globalForDrizzle.__mappyDb) globalForDrizzle.__mappyDb = createDb();
  return globalForDrizzle.__mappyDb;
}

/** The shared Drizzle client. A proxy keeps it lazy while letting callers write `db.select()`. */
export const db = new Proxy({} as Database, {
  get(_target, property) {
    const instance = getDb();
    const value = Reflect.get(instance, property, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

export async function closeDb() {
  const sql = globalForDb.__mappySql;
  globalForDb.__mappySql = undefined;
  globalForDrizzle.__mappyDb = undefined;
  await sql?.end({ timeout: 5 });
}
