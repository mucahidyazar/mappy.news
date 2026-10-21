import { createHash } from "node:crypto";

import type { Pool, PoolClient } from "pg";

import type {
  AdvanceCheckpointInput,
  AdvanceCheckpointResult,
  PersistBatchResult,
  ReconciliationCheckpoint,
  ReconciliationCheckpointStore,
  XPostEnvelope,
  XPostRepository,
} from "@/features/event-pipeline/server/ingestion/x/contracts";

interface SourceEndpointRow {
  readonly source_id: string;
}

interface ObservationIdentityRow {
  readonly id: string;
}

interface ExistingObservationRow extends ObservationIdentityRow {
  readonly content_hash: string;
}

interface CheckpointRow {
  readonly last_external_id: string | null;
  readonly version: number;
}

type PersistOutcome = "inserted" | "duplicates" | "updated";

const EMPTY_PERSIST_RESULT: PersistBatchResult = Object.freeze({
  inserted: 0,
  duplicates: 0,
  updated: 0,
});

function assertNonEmpty(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${field} must not be empty`);
  }
}

function assertDecimalId(value: string, field: string): void {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${field} must be a decimal X identifier`);
  }
}

function parseTimestamp(value: string, field: string): Date {
  const timestamp = new Date(value);

  if (!Number.isFinite(timestamp.getTime())) {
    throw new Error(`${field} must be a valid timestamp`);
  }

  return timestamp;
}

function validateEnvelope(envelope: XPostEnvelope): void {
  assertNonEmpty(envelope.accountId, "accountId");
  assertNonEmpty(envelope.accountHandle, "accountHandle");
  assertDecimalId(envelope.post.id, "post.id");
  assertDecimalId(envelope.post.authorId, "post.authorId");
  parseTimestamp(envelope.receivedAt, "receivedAt");
  parseTimestamp(envelope.post.createdAt, "post.createdAt");

  if (
    !envelope.post.raw ||
    typeof envelope.post.raw !== "object" ||
    Array.isArray(envelope.post.raw)
  ) {
    throw new Error("post.raw must be a JSON object");
  }
}

function contentHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function incrementResult(
  result: PersistBatchResult,
  outcome: PersistOutcome,
): PersistBatchResult {
  if (outcome === "inserted") {
    return Object.freeze({ ...result, inserted: result.inserted + 1 });
  }

  if (outcome === "updated") {
    return Object.freeze({ ...result, updated: result.updated + 1 });
  }

  return Object.freeze({ ...result, duplicates: result.duplicates + 1 });
}

export class PostgresXIngestionStore
  implements XPostRepository, ReconciliationCheckpointStore
{
  public constructor(private readonly pool: Pool) {}

  public async persistBatch(
    items: readonly XPostEnvelope[],
  ): Promise<PersistBatchResult> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const result = await items.reduce<Promise<PersistBatchResult>>(
        async (resultPromise, envelope) => {
          const result = await resultPromise;
          const outcome = await this.persistEnvelope(client, envelope);
          return incrementResult(result, outcome);
        },
        Promise.resolve(EMPTY_PERSIST_RESULT),
      );
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async load(input: {
    readonly accountId: string;
  }): Promise<ReconciliationCheckpoint> {
    assertNonEmpty(input.accountId, "accountId");
    const result = await this.pool.query<CheckpointRow>(
      `
        SELECT last_external_id, version
        FROM collection_cursors
        WHERE source_endpoint_id = $1
      `,
      [input.accountId],
    );
    const checkpoint = result.rows[0];

    return Object.freeze({
      sinceId: checkpoint?.last_external_id ?? null,
      version: checkpoint?.version ?? 0,
    });
  }

  public async advance(
    input: AdvanceCheckpointInput,
  ): Promise<AdvanceCheckpointResult> {
    assertNonEmpty(input.accountId, "accountId");
    assertDecimalId(input.sinceId, "sinceId");

    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) {
      throw new Error("expectedVersion must be a non-negative integer");
    }

    const reconciledAt = parseTimestamp(input.reconciledAt, "reconciledAt");
    const cursorValue = JSON.stringify({ sinceId: input.sinceId });
    const result = await this.pool.query<{ readonly version: number }>(
      `
        INSERT INTO collection_cursors (
          source_endpoint_id,
          cursor_value,
          last_external_id,
          last_observed_at,
          last_success_at,
          consecutive_failures,
          updated_at,
          version,
          reconciled_at
        )
        SELECT $1, $2::jsonb, $3, $4, $4, 0, $4, 1, $4
        FROM source_endpoints
        WHERE id = $1
          AND $5 = 0
        ON CONFLICT (source_endpoint_id)
        DO UPDATE SET
          cursor_value = EXCLUDED.cursor_value,
          last_external_id = EXCLUDED.last_external_id,
          last_observed_at = EXCLUDED.last_observed_at,
          last_success_at = EXCLUDED.last_success_at,
          consecutive_failures = 0,
          updated_at = EXCLUDED.updated_at,
          version = collection_cursors.version + 1,
          reconciled_at = EXCLUDED.reconciled_at
        WHERE collection_cursors.version = $5
          AND (
            collection_cursors.last_external_id IS NULL
            OR length(EXCLUDED.last_external_id)
              > length(collection_cursors.last_external_id)
            OR (
              length(EXCLUDED.last_external_id)
                = length(collection_cursors.last_external_id)
              AND EXCLUDED.last_external_id
                > collection_cursors.last_external_id
            )
          )
        RETURNING version
      `,
      [
        input.accountId,
        cursorValue,
        input.sinceId,
        reconciledAt,
        input.expectedVersion,
      ],
    );

    return result.rows[0] ? "advanced" : "conflict";
  }

  private async persistEnvelope(
    client: PoolClient,
    envelope: XPostEnvelope,
  ): Promise<PersistOutcome> {
    validateEnvelope(envelope);
    const endpoint = await this.loadEndpoint(client, envelope.accountId);
    const hash = contentHash(envelope.post.text);
    const receivedAt = parseTimestamp(envelope.receivedAt, "receivedAt");
    const publishedAt = parseTimestamp(envelope.post.createdAt, "post.createdAt");
    const rawPayload = JSON.stringify(envelope.post.raw);
    const canonicalUrl = `https://x.com/${envelope.accountHandle}/status/${envelope.post.id}`;
    const inserted = await client.query<ObservationIdentityRow>(
      `
        INSERT INTO observations (
          source_id,
          source_endpoint_id,
          external_id,
          canonical_url,
          author_external_id,
          author_handle,
          content,
          content_hash,
          raw_payload,
          published_at,
          first_observed_at,
          last_observed_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $11)
        ON CONFLICT (source_id, external_id) DO NOTHING
        RETURNING id
      `,
      [
        endpoint.source_id,
        envelope.accountId,
        envelope.post.id,
        canonicalUrl,
        envelope.post.authorId,
        envelope.accountHandle,
        envelope.post.text,
        hash,
        rawPayload,
        publishedAt,
        receivedAt,
      ],
    );
    const insertedObservation = inserted.rows[0];

    if (insertedObservation) {
      await this.insertVersion({
        client,
        observationId: insertedObservation.id,
        content: envelope.post.text,
        hash,
        rawPayload,
        receivedAt,
      });
      await this.recordReceipt({
        client,
        observationId: insertedObservation.id,
        accountId: envelope.accountId,
        channel: envelope.channel,
        receivedAt,
        rawPayload,
      });
      await this.enqueueClassification({
        client,
        observationId: insertedObservation.id,
        externalId: envelope.post.id,
        hash,
      });
      return "inserted";
    }

    const existing = await client.query<ExistingObservationRow>(
      `
        SELECT id, content_hash
        FROM observations
        WHERE source_id = $1 AND external_id = $2
        FOR UPDATE
      `,
      [endpoint.source_id, envelope.post.id],
    );
    const observation = existing.rows[0];

    if (!observation) {
      throw new Error(`observation disappeared during persistence: ${envelope.post.id}`);
    }

    const outcome: PersistOutcome =
      observation.content_hash === hash ? "duplicates" : "updated";
    await client.query(
      `
        UPDATE observations
        SET
          source_endpoint_id = CASE
            WHEN $7 >= last_observed_at THEN $1
            ELSE source_endpoint_id
          END,
          canonical_url = CASE
            WHEN $7 >= last_observed_at THEN $2
            ELSE canonical_url
          END,
          author_external_id = CASE
            WHEN $7 >= last_observed_at THEN $3
            ELSE author_external_id
          END,
          author_handle = CASE
            WHEN $7 >= last_observed_at THEN $4
            ELSE author_handle
          END,
          content = CASE WHEN $7 >= last_observed_at THEN $5 ELSE content END,
          content_hash = CASE
            WHEN $7 >= last_observed_at THEN $6
            ELSE content_hash
          END,
          raw_payload = CASE
            WHEN $7 >= last_observed_at THEN $8::jsonb
            ELSE raw_payload
          END,
          last_observed_at = GREATEST(last_observed_at, $7),
          updated_at = clock_timestamp()
        WHERE id = $9
      `,
      [
        envelope.accountId,
        canonicalUrl,
        envelope.post.authorId,
        envelope.accountHandle,
        envelope.post.text,
        hash,
        receivedAt,
        rawPayload,
        observation.id,
      ],
    );
    await this.recordReceipt({
      client,
      observationId: observation.id,
      accountId: envelope.accountId,
      channel: envelope.channel,
      receivedAt,
      rawPayload,
    });

    if (outcome === "updated") {
      await this.insertVersion({
        client,
        observationId: observation.id,
        content: envelope.post.text,
        hash,
        rawPayload,
        receivedAt,
      });
      await this.enqueueClassification({
        client,
        observationId: observation.id,
        externalId: envelope.post.id,
        hash,
      });
    }

    return outcome;
  }

  private async loadEndpoint(
    client: PoolClient,
    accountId: string,
  ): Promise<SourceEndpointRow> {
    const result = await client.query<SourceEndpointRow>(
      `
        SELECT source_id
        FROM source_endpoints
        WHERE id = $1 AND is_active = TRUE
        FOR SHARE
      `,
      [accountId],
    );
    const endpoint = result.rows[0];

    if (!endpoint) {
      throw new Error(`active X source endpoint not found: ${accountId}`);
    }

    return endpoint;
  }

  private async insertVersion(input: {
    readonly client: PoolClient;
    readonly observationId: string;
    readonly content: string;
    readonly hash: string;
    readonly rawPayload: string;
    readonly receivedAt: Date;
  }): Promise<void> {
    await input.client.query(
      `
        INSERT INTO observation_versions (
          observation_id,
          version_number,
          content,
          content_hash,
          raw_payload,
          observed_at
        )
        SELECT $1, COALESCE(MAX(version_number), 0) + 1, $2, $3, $4::jsonb, $5
        FROM observation_versions
        WHERE observation_id = $1
        ON CONFLICT (observation_id, content_hash) DO NOTHING
      `,
      [
        input.observationId,
        input.content,
        input.hash,
        input.rawPayload,
        input.receivedAt,
      ],
    );
  }

  private async recordReceipt(input: {
    readonly client: PoolClient;
    readonly observationId: string;
    readonly accountId: string;
    readonly channel: string;
    readonly receivedAt: Date;
    readonly rawPayload: string;
  }): Promise<void> {
    await input.client.query(
      `
        INSERT INTO observation_receipts (
          observation_id,
          source_endpoint_id,
          channel,
          first_received_at,
          last_received_at,
          last_raw_payload
        )
        VALUES ($1, $2, $3, $4, $4, $5::jsonb)
        ON CONFLICT (observation_id, source_endpoint_id, channel)
        DO UPDATE SET
          first_received_at = LEAST(
            observation_receipts.first_received_at,
            EXCLUDED.first_received_at
          ),
          last_raw_payload = CASE
            WHEN EXCLUDED.last_received_at >= observation_receipts.last_received_at
              THEN EXCLUDED.last_raw_payload
            ELSE observation_receipts.last_raw_payload
          END,
          last_received_at = GREATEST(
            observation_receipts.last_received_at,
            EXCLUDED.last_received_at
          ),
          receipt_count = observation_receipts.receipt_count + 1,
          updated_at = clock_timestamp()
      `,
      [
        input.observationId,
        input.accountId,
        input.channel,
        input.receivedAt,
        input.rawPayload,
      ],
    );
  }

  private async enqueueClassification(input: {
    readonly client: PoolClient;
    readonly observationId: string;
    readonly externalId: string;
    readonly hash: string;
  }): Promise<void> {
    const payload = JSON.stringify({
      observationId: input.observationId,
      externalId: input.externalId,
      contentHash: input.hash,
    });
    await input.client.query(
      `
        INSERT INTO pipeline_jobs (job_type, dedupe_key, payload)
        VALUES ('classify_observation', $1, $2::jsonb)
        ON CONFLICT (dedupe_key) DO NOTHING
      `,
      [`classify:${input.observationId}:${input.hash}`, payload],
    );
  }
}
