import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { discoverMigrations } from "@/features/event-pipeline/server/database/migrator";

describe("discoverMigrations", () => {
  it("loads numbered SQL migrations with stable SHA-256 checksums", async () => {
    const migrations = await discoverMigrations(
      join(process.cwd(), "database", "migrations"),
    );

    expect(migrations.map((migration) => migration.name)).toEqual([
      "0001_event_pipeline_foundation.sql",
      "0002_x_ingestion_store.sql",
    ]);
    expect(migrations[0]?.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(migrations[0]?.sql).toContain("CREATE EXTENSION IF NOT EXISTS postgis");
    expect(migrations[1]?.sql).toContain("CREATE TABLE observation_receipts");
  });
});
