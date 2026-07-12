import type { Pool } from "pg";

const MAX_CLAIM_BATCH_SIZE = 100;

type PipelineJobStatus =
  | "pending"
  | "running"
  | "completed"
  | "dead_letter";

export interface PipelineJob {
  readonly id: string;
  readonly jobType: string;
  readonly dedupeKey: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly status: PipelineJobStatus;
  readonly priority: number;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly availableAt: Date;
  readonly lockedBy: string | null;
  readonly leaseExpiresAt: Date | null;
  readonly lastError: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

interface PipelineJobRow {
  readonly id: string;
  readonly job_type: string;
  readonly dedupe_key: string;
  readonly payload: unknown;
  readonly status: PipelineJobStatus;
  readonly priority: number;
  readonly attempts: number;
  readonly max_attempts: number;
  readonly available_at: Date;
  readonly locked_by: string | null;
  readonly lease_expires_at: Date | null;
  readonly last_error: string | null;
  readonly created_at: Date;
  readonly updated_at: Date;
}

export interface EnqueuePipelineJobInput {
  readonly jobType: string;
  readonly dedupeKey: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly priority?: number;
  readonly maxAttempts?: number;
  readonly availableAt?: Date;
}

export interface ClaimPipelineJobsInput {
  readonly workerId: string;
  readonly limit: number;
  readonly leaseMs: number;
}

export interface CompletePipelineJobInput {
  readonly jobId: string;
  readonly workerId: string;
}

export interface FailPipelineJobInput extends CompletePipelineJobInput {
  readonly error: string;
  readonly retryDelayMs?: number;
}

export interface ExtendPipelineJobLeaseInput extends CompletePipelineJobInput {
  readonly leaseMs: number;
}

function assertNonEmpty(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${field} must not be empty`);
  }
}

function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
}

function assertNonNegativeInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
}

function parsePayload(value: unknown): Readonly<Record<string, unknown>> {
  const payload = typeof value === "string" ? JSON.parse(value) : value;

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("pipeline job payload must be a JSON object");
  }

  return Object.freeze({ ...(payload as Record<string, unknown>) });
}

function toPipelineJob(row: PipelineJobRow): PipelineJob {
  return Object.freeze({
    id: row.id,
    jobType: row.job_type,
    dedupeKey: row.dedupe_key,
    payload: parsePayload(row.payload),
    status: row.status,
    priority: row.priority,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    availableAt: row.available_at,
    lockedBy: row.locked_by,
    leaseExpiresAt: row.lease_expires_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export class PostgresPipelineJobQueue {
  public constructor(private readonly pool: Pool) {}

  public async enqueue(input: EnqueuePipelineJobInput): Promise<string> {
    assertNonEmpty(input.jobType, "jobType");
    assertNonEmpty(input.dedupeKey, "dedupeKey");
    const priority = input.priority ?? 0;
    const maxAttempts = input.maxAttempts ?? 5;
    const availableAt = input.availableAt ?? new Date();
    assertNonNegativeInteger(priority, "priority");
    assertPositiveInteger(maxAttempts, "maxAttempts");

    if (!Number.isFinite(availableAt.getTime())) {
      throw new Error("availableAt must be a valid date");
    }

    const result = await this.pool.query<{ readonly id: string }>(
      `
        INSERT INTO pipeline_jobs (
          job_type,
          dedupe_key,
          payload,
          priority,
          max_attempts,
          available_at
        )
        VALUES ($1, $2, $3::jsonb, $4, $5, $6)
        ON CONFLICT (dedupe_key)
        DO UPDATE SET dedupe_key = EXCLUDED.dedupe_key
        RETURNING id
      `,
      [
        input.jobType,
        input.dedupeKey,
        JSON.stringify(input.payload),
        priority,
        maxAttempts,
        availableAt,
      ],
    );
    const id = result.rows[0]?.id;

    if (!id) {
      throw new Error("database did not return an enqueued pipeline job id");
    }

    return id;
  }

  public async claim(
    input: ClaimPipelineJobsInput,
  ): Promise<readonly PipelineJob[]> {
    assertNonEmpty(input.workerId, "workerId");
    assertPositiveInteger(input.limit, "limit");
    assertPositiveInteger(input.leaseMs, "leaseMs");

    if (input.limit > MAX_CLAIM_BATCH_SIZE) {
      throw new Error(`limit must not exceed ${MAX_CLAIM_BATCH_SIZE}`);
    }

    const result = await this.pool.query<PipelineJobRow>(
      `
        WITH exhausted AS (
          UPDATE pipeline_jobs
          SET
            status = 'dead_letter',
            locked_by = NULL,
            lease_expires_at = NULL,
            last_error = COALESCE(
              last_error,
              'lease expired after the final attempt'
            ),
            updated_at = clock_timestamp()
          WHERE status = 'running'
            AND lease_expires_at <= clock_timestamp()
            AND attempts >= max_attempts
          RETURNING id
        ),
        claimable AS (
          SELECT id
          FROM pipeline_jobs
          WHERE attempts < max_attempts
            AND id NOT IN (SELECT id FROM exhausted)
            AND (
              (status = 'pending' AND available_at <= clock_timestamp())
              OR
              (status = 'running' AND lease_expires_at <= clock_timestamp())
            )
          ORDER BY priority DESC, available_at ASC, created_at ASC, id ASC
          FOR UPDATE SKIP LOCKED
          LIMIT $1
        ),
        claimed AS (
          UPDATE pipeline_jobs AS job
          SET
            status = 'running',
            attempts = job.attempts + 1,
            locked_by = $2,
            lease_expires_at = clock_timestamp()
              + ($3::double precision * INTERVAL '1 millisecond'),
            started_at = COALESCE(job.started_at, clock_timestamp()),
            updated_at = clock_timestamp()
          FROM claimable
          WHERE job.id = claimable.id
          RETURNING job.*
        )
        SELECT
          id,
          job_type,
          dedupe_key,
          payload,
          status,
          priority,
          attempts,
          max_attempts,
          available_at,
          locked_by,
          lease_expires_at,
          last_error,
          created_at,
          updated_at
        FROM claimed
        ORDER BY priority DESC, available_at ASC, created_at ASC, id ASC
      `,
      [input.limit, input.workerId, input.leaseMs],
    );

    return Object.freeze(result.rows.map(toPipelineJob));
  }

  public async complete(input: CompletePipelineJobInput): Promise<void> {
    assertNonEmpty(input.jobId, "jobId");
    assertNonEmpty(input.workerId, "workerId");
    const result = await this.pool.query<{ readonly id: string }>(
      `
        UPDATE pipeline_jobs
        SET
          status = 'completed',
          locked_by = NULL,
          lease_expires_at = NULL,
          completed_at = clock_timestamp(),
          updated_at = clock_timestamp()
        WHERE id = $1
          AND status = 'running'
          AND locked_by = $2
          AND lease_expires_at > clock_timestamp()
        RETURNING id
      `,
      [input.jobId, input.workerId],
    );

    if (!result.rows[0]) {
      throw new Error("pipeline job is not leased by this worker");
    }
  }

  public async fail(input: FailPipelineJobInput): Promise<PipelineJobStatus> {
    assertNonEmpty(input.jobId, "jobId");
    assertNonEmpty(input.workerId, "workerId");
    assertNonEmpty(input.error, "error");
    const retryDelayMs = input.retryDelayMs ?? 0;
    assertNonNegativeInteger(retryDelayMs, "retryDelayMs");
    const result = await this.pool.query<{
      readonly status: PipelineJobStatus;
    }>(
      `
        UPDATE pipeline_jobs
        SET
          status = CASE
            WHEN attempts >= max_attempts THEN 'dead_letter'
            ELSE 'pending'
          END,
          available_at = CASE
            WHEN attempts >= max_attempts THEN available_at
            ELSE clock_timestamp()
              + ($3::double precision * INTERVAL '1 millisecond')
          END,
          locked_by = NULL,
          lease_expires_at = NULL,
          last_error = $4,
          updated_at = clock_timestamp()
        WHERE id = $1
          AND status = 'running'
          AND locked_by = $2
          AND lease_expires_at > clock_timestamp()
        RETURNING status
      `,
      [input.jobId, input.workerId, retryDelayMs, input.error],
    );
    const status = result.rows[0]?.status;

    if (!status) {
      throw new Error("pipeline job is not leased by this worker");
    }

    return status;
  }

  public async extendLease(
    input: ExtendPipelineJobLeaseInput,
  ): Promise<void> {
    assertNonEmpty(input.jobId, "jobId");
    assertNonEmpty(input.workerId, "workerId");
    assertPositiveInteger(input.leaseMs, "leaseMs");
    const result = await this.pool.query<{ readonly id: string }>(
      `
        UPDATE pipeline_jobs
        SET
          lease_expires_at = clock_timestamp()
            + ($3::double precision * INTERVAL '1 millisecond'),
          updated_at = clock_timestamp()
        WHERE id = $1
          AND status = 'running'
          AND locked_by = $2
          AND lease_expires_at > clock_timestamp()
        RETURNING id
      `,
      [input.jobId, input.workerId, input.leaseMs],
    );

    if (!result.rows[0]) {
      throw new Error("pipeline job lease cannot be extended");
    }
  }
}
