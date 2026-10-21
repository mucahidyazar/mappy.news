import { sql } from "drizzle-orm";

/**
 * A timestamp parameter for raw `sql` fragments. Drizzle only converts Dates for column comparisons such as
 * `gte(column, date)`; inside `sql` templates postgres.js would receive the Date itself and fail.
 */
export function sqlTimestamp(date: Date) {
  return sql`${date.toISOString()}::timestamptz`;
}
