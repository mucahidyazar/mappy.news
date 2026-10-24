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

// Only the connection pool outlives a dev reload. The Drizzle client is cheap and caches the schema's column
// names, so it is rebuilt with this module: a changed schema works without restarting `next dev`.
let instance: Database | undefined;

function getDb(): Database {
  instance ??= createDb();
  return instance;
}

/** The shared Drizzle client. A proxy keeps it lazy while letting callers write `db.select()`. */
export const db = new Proxy({} as Database, {
  get(_target, property) {
    const client = getDb();
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export async function closeDb() {
  const sql = globalForDb.__mappySql;
  globalForDb.__mappySql = undefined;
  instance = undefined;
  await sql?.end({ timeout: 5 });
}
