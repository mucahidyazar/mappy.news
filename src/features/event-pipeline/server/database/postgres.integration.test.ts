import { join } from "node:path";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  applyMigrations,
  type MigrationResult,
} from "@/features/event-pipeline/server/database/migrator";
import { PostgresPipelineJobQueue } from "@/features/event-pipeline/server/database/postgres-pipeline-job-queue";
import { PostgresXIngestionStore } from "@/features/event-pipeline/server/database/postgres-x-ingestion-store";

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
      {
        version: 2,
        name: "0002_x_ingestion_store.sql",
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

  it("persists X observations, versions, receipts, jobs, and checkpoints atomically", async () => {
    await applyMigrations({
      pool,
      directory: join(process.cwd(), "database", "migrations"),
    });
    const source = await pool.query<{ id: string }>(`
      INSERT INTO sources (source_type, display_name, reliability_score)
      VALUES ('x_account', 'Test chaos source', 0.7000)
      RETURNING id
    `);
    const endpoint = await pool.query<{ id: string }>(
      `
        INSERT INTO source_endpoints (
          source_id,
          endpoint_type,
          endpoint_key,
          external_account_id,
          handle
        )
        VALUES ($1, 'x_user_timeline', '1800123456789012345', $2, 'chaos_news')
        RETURNING id
      `,
      [source.rows[0]?.id, "1800123456789012345"],
    );
    const accountId = endpoint.rows[0]?.id;
    expect(accountId).toBeTypeOf("string");
    const store = new PostgresXIngestionStore(pool);
    const envelope = {
      accountId: accountId!,
      accountHandle: "chaos_news",
      channel: "user_timeline",
      receivedAt: "2026-07-12T08:10:00.000Z",
      post: {
        id: "1900123456789012345",
        authorId: "1800123456789012345",
        text: "Taksim Metro çıkışında yol kapatıldı.",
        createdAt: "2026-07-12T08:00:00.000Z",
        editHistoryPostIds: ["1900123456789012345"],
        referencedPosts: [],
        raw: {
          id: "1900123456789012345",
          text: "Taksim Metro çıkışında yol kapatıldı.",
          author_id: "1800123456789012345",
        },
      },
    } as const;

    const first = await store.persistBatch([envelope, envelope]);
    const replay = await store.persistBatch([envelope]);

    expect(first).toEqual({ inserted: 1, duplicates: 1, updated: 0 });
    expect(replay).toEqual({ inserted: 0, duplicates: 1, updated: 0 });
    const counts = await pool.query<{
      observations: string;
      versions: string;
      receipts: string;
      receipt_count: string;
      jobs: string;
    }>(
      `
        SELECT
          (SELECT count(*) FROM observations WHERE external_id = $1) AS observations,
          (
            SELECT count(*)
            FROM observation_versions version
            JOIN observations observation ON observation.id = version.observation_id
            WHERE observation.external_id = $1
          ) AS versions,
          (
            SELECT count(*)
            FROM observation_receipts receipt
            JOIN observations observation ON observation.id = receipt.observation_id
            WHERE observation.external_id = $1
          ) AS receipts,
          (
            SELECT sum(receipt_count)::text
            FROM observation_receipts receipt
            JOIN observations observation ON observation.id = receipt.observation_id
            WHERE observation.external_id = $1
          ) AS receipt_count,
          (
            SELECT count(*)
            FROM pipeline_jobs
            WHERE payload->>'externalId' = $1
          ) AS jobs
      `,
      [envelope.post.id],
    );
    expect(counts.rows[0]).toEqual({
      observations: "1",
      versions: "1",
      receipts: "1",
      receipt_count: "3",
      jobs: "1",
    });

    const editedEnvelope = {
      ...envelope,
      receivedAt: "2026-07-12T08:20:00.000Z",
      post: {
        ...envelope.post,
        text: "Taksim Metro çıkışında yol yeniden açıldı.",
        raw: {
          ...envelope.post.raw,
          text: "Taksim Metro çıkışında yol yeniden açıldı.",
        },
      },
    } as const;
    await expect(store.persistBatch([editedEnvelope])).resolves.toEqual({
      inserted: 0,
      duplicates: 0,
      updated: 1,
    });
    const editedCounts = await pool.query<{
      versions: string;
      jobs: string;
      current_content: string;
    }>(
      `
        SELECT
          (
            SELECT count(*)
            FROM observation_versions version
            JOIN observations observation ON observation.id = version.observation_id
            WHERE observation.external_id = $1
          ) AS versions,
          (
            SELECT count(*)
            FROM pipeline_jobs
            WHERE payload->>'externalId' = $1
          ) AS jobs,
          (
            SELECT content FROM observations WHERE external_id = $1
          ) AS current_content
      `,
      [envelope.post.id],
    );
    expect(editedCounts.rows[0]).toEqual({
      versions: "2",
      jobs: "2",
      current_content: editedEnvelope.post.text,
    });

    await expect(store.load({ accountId: accountId! })).resolves.toEqual({
      sinceId: null,
      version: 0,
    });
    await expect(
      store.advance({
        accountId: accountId!,
        expectedVersion: 0,
        sinceId: envelope.post.id,
        reconciledAt: "2026-07-12T08:30:00.000Z",
      }),
    ).resolves.toBe("advanced");
    await expect(
      store.advance({
        accountId: accountId!,
        expectedVersion: 0,
        sinceId: "1900123456789012350",
        reconciledAt: "2026-07-12T08:31:00.000Z",
      }),
    ).resolves.toBe("conflict");
    await expect(store.load({ accountId: accountId! })).resolves.toEqual({
      sinceId: envelope.post.id,
      version: 1,
    });
  });
});
