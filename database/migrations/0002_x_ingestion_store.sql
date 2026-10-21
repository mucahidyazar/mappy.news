ALTER TABLE collection_cursors
  ADD COLUMN version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN reconciled_at TIMESTAMPTZ;

ALTER TABLE collection_cursors
  ADD CONSTRAINT collection_cursors_version_non_negative
  CHECK (version >= 0);

CREATE TABLE observation_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id UUID NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
  source_endpoint_id UUID NOT NULL REFERENCES source_endpoints(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  first_received_at TIMESTAMPTZ NOT NULL,
  last_received_at TIMESTAMPTZ NOT NULL,
  receipt_count INTEGER NOT NULL DEFAULT 1,
  last_raw_payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT observation_receipts_channel_not_blank
    CHECK (length(btrim(channel)) > 0),
  CONSTRAINT observation_receipts_count_positive CHECK (receipt_count > 0),
  CONSTRAINT observation_receipts_time_order
    CHECK (last_received_at >= first_received_at),
  CONSTRAINT observation_receipts_delivery_key
    UNIQUE (observation_id, source_endpoint_id, channel)
);

CREATE INDEX observation_receipts_endpoint_received_idx
  ON observation_receipts (source_endpoint_id, last_received_at DESC);
