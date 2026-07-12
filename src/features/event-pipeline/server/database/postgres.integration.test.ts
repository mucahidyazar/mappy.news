import { join } from "node:path";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  applyMigrations,
  type MigrationResult,
} from "@/features/event-pipeline/server/database/migrator";
import { PostgresPipelineJobQueue } from "@/features/event-pipeline/server/database/postgres-pipeline-job-queue";

describe("PostgreSQL event pipeline foundation", () => {
  let container: Awaited<ReturnType<PostgreSqlContainer["start"]>>;
  let pool: Pool;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgis/postgis:17-3.6-alpine")
      .withPlatform("linux/amd64")
      .withDatabase("mappy_test")
      .withUsername("mappy")
      .withPassword("mappy_test_password")
      .start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
  });

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("applies PostGIS migrations idempotently and creates private/public boundaries", async () => {
    const directory = join(process.cwd(), "database", "migrations");

    const firstRun = await applyMigrations({ pool, directory });
    const secondRun = await applyMigrations({ pool, directory });

    expect(firstRun).toEqual<readonly MigrationResult[]>([
      {
        version: 1,
        name: "0001_event_pipeline_foundation.sql",
        status: "applied",
      },
    ]);
    expect(secondRun[0]).toMatchObject({ version: 1, status: "skipped" });

    const postgis = await pool.query<{ installed: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') AS installed",
    );
    expect(postgis.rows[0]?.installed).toBe(true);

    const tables = await pool.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    expect(tables.rows.map((row) => row.table_name)).toEqual(
      expect.arrayContaining([
        "collection_cursors",
        "incident_location_resolutions",
        "incidents",
        "location_evidence",
        "observation_versions",
        "observations",
        "pipeline_jobs",
        "places",
        "public_incident_locations",
        "source_endpoints",
        "sources",
      ]),
    );
  });

  it("enqueues idempotently and claims jobs with a lease", async () => {
    await applyMigrations({
      pool,
      directory: join(process.cwd(), "database", "migrations"),
    });
    const queue = new PostgresPipelineJobQueue(pool);

    const firstId = await queue.enqueue({
      jobType: "classify_observation",
      dedupeKey: "classify:observation-1:hash-1",
      payload: { observationId: "observation-1" },
    });
    const duplicateId = await queue.enqueue({
      jobType: "classify_observation",
      dedupeKey: "classify:observation-1:hash-1",
      payload: { observationId: "observation-1" },
    });

    expect(duplicateId).toBe(firstId);
    const claimed = await queue.claim({
      workerId: "worker-a",
      limit: 10,
      leaseMs: 60_000,
    });
    expect(claimed).toHaveLength(1);
    expect(claimed[0]).toMatchObject({
      id: firstId,
      attempts: 1,
      jobType: "classify_observation",
      payload: { observationId: "observation-1" },
    });
    await expect(
      queue.claim({ workerId: "worker-b", limit: 10, leaseMs: 60_000 }),
    ).resolves.toEqual([]);

    await queue.complete({ jobId: firstId, workerId: "worker-a" });
    const status = await pool.query<{ status: string }>(
      "SELECT status FROM pipeline_jobs WHERE id = $1",
      [firstId],
    );
    expect(status.rows[0]?.status).toBe("completed");
  });
});
