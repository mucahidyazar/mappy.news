CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL,
  display_name TEXT NOT NULL,
  reliability_score NUMERIC(5, 4) NOT NULL DEFAULT 0.5000,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT sources_type_not_blank CHECK (length(btrim(source_type)) > 0),
  CONSTRAINT sources_name_not_blank CHECK (length(btrim(display_name)) > 0),
  CONSTRAINT sources_reliability_range
    CHECK (reliability_score BETWEEN 0 AND 1)
);

CREATE TABLE source_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  endpoint_type TEXT NOT NULL,
  endpoint_key TEXT NOT NULL,
  external_account_id TEXT,
  handle TEXT,
  url TEXT,
  poll_interval_seconds INTEGER NOT NULL DEFAULT 300,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT source_endpoints_type_not_blank
    CHECK (length(btrim(endpoint_type)) > 0),
  CONSTRAINT source_endpoints_key_not_blank
    CHECK (length(btrim(endpoint_key)) > 0),
  CONSTRAINT source_endpoints_poll_interval_positive
    CHECK (poll_interval_seconds > 0),
  CONSTRAINT source_endpoints_natural_key
    UNIQUE (source_id, endpoint_type, endpoint_key)
);

CREATE TABLE collection_cursors (
  source_endpoint_id UUID PRIMARY KEY
    REFERENCES source_endpoints(id) ON DELETE CASCADE,
  cursor_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_external_id TEXT,
  last_observed_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT collection_cursors_failures_non_negative
    CHECK (consecutive_failures >= 0)
);

CREATE TABLE observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES sources(id),
  source_endpoint_id UUID REFERENCES source_endpoints(id),
  external_id TEXT NOT NULL,
  canonical_url TEXT,
  author_external_id TEXT,
  author_handle TEXT,
  content TEXT NOT NULL,
  language_code TEXT,
  content_hash CHAR(64) NOT NULL,
  raw_payload JSONB NOT NULL,
  published_at TIMESTAMPTZ,
  first_observed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  last_observed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT observations_external_id_not_blank
    CHECK (length(btrim(external_id)) > 0),
  CONSTRAINT observations_content_hash_format
    CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT observations_source_external_id_key
    UNIQUE (source_id, external_id)
);

CREATE INDEX observations_endpoint_published_idx
  ON observations (source_endpoint_id, published_at DESC);
CREATE INDEX observations_content_hash_idx ON observations (content_hash);
CREATE INDEX observations_active_published_idx
  ON observations (published_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE observation_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id UUID NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  content_hash CHAR(64) NOT NULL,
  raw_payload JSONB NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT observation_versions_number_positive CHECK (version_number > 0),
  CONSTRAINT observation_versions_content_hash_format
    CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT observation_versions_number_key
    UNIQUE (observation_id, version_number),
  CONSTRAINT observation_versions_hash_key
    UNIQUE (observation_id, content_hash)
);

CREATE TABLE incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lifecycle_status TEXT NOT NULL DEFAULT 'candidate',
  incident_type TEXT,
  headline TEXT,
  summary TEXT,
  severity SMALLINT,
  confidence NUMERIC(5, 4) NOT NULL DEFAULT 0,
  occurred_from TIMESTAMPTZ,
  occurred_to TIMESTAMPTZ,
  first_reported_at TIMESTAMPTZ,
  last_reported_at TIMESTAMPTZ,
  verification JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT incidents_lifecycle_status_allowed CHECK (
    lifecycle_status IN (
      'candidate',
      'needs_review',
      'verified',
      'published',
      'rejected',
      'retracted'
    )
  ),
  CONSTRAINT incidents_severity_range CHECK (severity BETWEEN 0 AND 5),
  CONSTRAINT incidents_confidence_range CHECK (confidence BETWEEN 0 AND 1),
  CONSTRAINT incidents_occurrence_order
    CHECK (occurred_to IS NULL OR occurred_from IS NULL OR occurred_to >= occurred_from)
);

CREATE TABLE incident_observations (
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  observation_id UUID NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL DEFAULT 'report',
  support_score NUMERIC(5, 4),
  linked_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (incident_id, observation_id),
  CONSTRAINT incident_observations_relationship_allowed CHECK (
    relationship_type IN ('report', 'corroboration', 'correction', 'retraction')
  ),
  CONSTRAINT incident_observations_support_range
    CHECK (support_score IS NULL OR support_score BETWEEN 0 AND 1)
);

CREATE INDEX incident_observations_observation_idx
  ON incident_observations (observation_id);

CREATE TABLE places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES places(id),
  provider TEXT NOT NULL,
  provider_place_id TEXT NOT NULL,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  place_type TEXT NOT NULL,
  country_code CHAR(2),
  administrative_codes JSONB NOT NULL DEFAULT '{}'::jsonb,
  geometry GEOMETRY(Geometry, 4326),
  centroid GEOMETRY(Point, 4326),
  bounding_box GEOMETRY(Polygon, 4326),
  provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT places_provider_not_blank CHECK (length(btrim(provider)) > 0),
  CONSTRAINT places_provider_id_not_blank
    CHECK (length(btrim(provider_place_id)) > 0),
  CONSTRAINT places_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT places_country_code_format
    CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT places_provider_key UNIQUE (provider, provider_place_id)
);

CREATE INDEX places_parent_idx ON places (parent_id);
CREATE INDEX places_normalized_name_idx
  ON places (country_code, normalized_name, place_type);
CREATE INDEX places_geometry_gist_idx ON places USING GIST (geometry);
CREATE INDEX places_centroid_gist_idx ON places USING GIST (centroid);

CREATE TABLE location_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID REFERENCES incidents(id) ON DELETE CASCADE,
  observation_id UUID REFERENCES observations(id) ON DELETE CASCADE,
  place_id UUID REFERENCES places(id),
  evidence_type TEXT NOT NULL,
  raw_mention TEXT,
  normalized_mention TEXT,
  character_start INTEGER,
  character_end INTEGER,
  extractor TEXT NOT NULL,
  source_reference TEXT,
  confidence NUMERIC(5, 4) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT location_evidence_has_owner
    CHECK (incident_id IS NOT NULL OR observation_id IS NOT NULL),
  CONSTRAINT location_evidence_type_not_blank
    CHECK (length(btrim(evidence_type)) > 0),
  CONSTRAINT location_evidence_extractor_not_blank
    CHECK (length(btrim(extractor)) > 0),
  CONSTRAINT location_evidence_confidence_range
    CHECK (confidence BETWEEN 0 AND 1),
  CONSTRAINT location_evidence_character_range CHECK (
    (character_start IS NULL AND character_end IS NULL)
    OR
    (
      character_start IS NOT NULL
      AND character_end IS NOT NULL
      AND character_start >= 0
      AND character_end >= character_start
    )
  )
);

CREATE INDEX location_evidence_incident_idx
  ON location_evidence (incident_id);
CREATE INDEX location_evidence_observation_idx
  ON location_evidence (observation_id);
CREATE INDEX location_evidence_place_idx ON location_evidence (place_id);

CREATE TABLE location_hypotheses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  place_id UUID NOT NULL REFERENCES places(id),
  rank INTEGER NOT NULL,
  score NUMERIC(5, 4) NOT NULL,
  evidence_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  scoring_factors JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT location_hypotheses_rank_positive CHECK (rank > 0),
  CONSTRAINT location_hypotheses_score_range CHECK (score BETWEEN 0 AND 1),
  CONSTRAINT location_hypotheses_rank_key UNIQUE (incident_id, rank),
  CONSTRAINT location_hypotheses_place_key UNIQUE (incident_id, place_id)
);

-- Private evidence-backed resolution. Application read roles must not expose this
-- table directly; public map reads use public_incident_locations only.
CREATE TABLE incident_location_resolutions (
  incident_id UUID PRIMARY KEY REFERENCES incidents(id) ON DELETE CASCADE,
  place_id UUID REFERENCES places(id),
  selected_hypothesis_id UUID REFERENCES location_hypotheses(id),
  resolution_status TEXT NOT NULL,
  precision_level TEXT NOT NULL,
  confidence NUMERIC(5, 4) NOT NULL,
  exact_geometry GEOMETRY(Geometry, 4326),
  uncertainty_radius_meters INTEGER,
  resolution_method TEXT NOT NULL,
  decision_reason JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence_count INTEGER NOT NULL DEFAULT 0,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT incident_location_resolution_status_allowed CHECK (
    resolution_status IN ('resolved', 'abstained', 'needs_review')
  ),
  CONSTRAINT incident_location_precision_allowed CHECK (
    precision_level IN (
      'exact', 'street', 'neighborhood', 'district', 'province', 'country', 'unknown'
    )
  ),
  CONSTRAINT incident_location_confidence_range CHECK (confidence BETWEEN 0 AND 1),
  CONSTRAINT incident_location_uncertainty_non_negative
    CHECK (uncertainty_radius_meters IS NULL OR uncertainty_radius_meters >= 0),
  CONSTRAINT incident_location_evidence_count_non_negative
    CHECK (evidence_count >= 0),
  CONSTRAINT incident_location_abstention_has_no_geometry CHECK (
    resolution_status <> 'abstained' OR exact_geometry IS NULL
  )
);

CREATE INDEX incident_location_resolutions_geometry_gist_idx
  ON incident_location_resolutions USING GIST (exact_geometry);

-- This is the only location table intended for public map projections.
CREATE TABLE public_incident_locations (
  incident_id UUID PRIMARY KEY REFERENCES incidents(id) ON DELETE CASCADE,
  place_id UUID REFERENCES places(id),
  public_geometry GEOMETRY(Geometry, 4326) NOT NULL,
  precision_level TEXT NOT NULL,
  obfuscation_radius_meters INTEGER NOT NULL DEFAULT 0,
  disclosure_reason TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT public_incident_location_precision_allowed CHECK (
    precision_level IN ('street', 'neighborhood', 'district', 'province', 'country')
  ),
  CONSTRAINT public_incident_location_obfuscation_non_negative
    CHECK (obfuscation_radius_meters >= 0),
  CONSTRAINT public_incident_location_reason_not_blank
    CHECK (length(btrim(disclosure_reason)) > 0)
);

CREATE INDEX public_incident_locations_geometry_gist_idx
  ON public_incident_locations USING GIST (public_geometry);

CREATE TABLE processing_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id UUID NOT NULL,
  model_provider TEXT,
  model_name TEXT,
  prompt_version TEXT,
  input_hash CHAR(64),
  status TEXT NOT NULL,
  cost_microunits BIGINT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  completed_at TIMESTAMPTZ,
  output JSONB,
  error JSONB,
  CONSTRAINT processing_runs_status_allowed
    CHECK (status IN ('running', 'succeeded', 'failed', 'skipped')),
  CONSTRAINT processing_runs_input_hash_format
    CHECK (input_hash IS NULL OR input_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT processing_runs_cost_non_negative
    CHECK (cost_microunits IS NULL OR cost_microunits >= 0)
);

CREATE INDEX processing_runs_subject_idx
  ON processing_runs (subject_type, subject_id, started_at DESC);

CREATE TABLE review_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  reviewer_id TEXT NOT NULL,
  decision TEXT NOT NULL,
  reason TEXT,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT review_decisions_reviewer_not_blank
    CHECK (length(btrim(reviewer_id)) > 0),
  CONSTRAINT review_decisions_decision_allowed
    CHECK (decision IN ('approve', 'reject', 'request_changes', 'retract'))
);

CREATE INDEX review_decisions_incident_idx
  ON review_decisions (incident_id, created_at DESC);

CREATE TABLE corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  observation_id UUID REFERENCES observations(id),
  correction_type TEXT NOT NULL,
  before_value JSONB,
  after_value JSONB,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT corrections_type_not_blank
    CHECK (length(btrim(correction_type)) > 0),
  CONSTRAINT corrections_reason_not_blank CHECK (length(btrim(reason)) > 0)
);

CREATE INDEX corrections_incident_idx
  ON corrections (incident_id, created_at DESC);

CREATE TABLE pipeline_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  priority INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  available_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  locked_by TEXT,
  lease_expires_at TIMESTAMPTZ,
  last_error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT pipeline_jobs_type_not_blank CHECK (length(btrim(job_type)) > 0),
  CONSTRAINT pipeline_jobs_dedupe_not_blank CHECK (length(btrim(dedupe_key)) > 0),
  CONSTRAINT pipeline_jobs_status_allowed
    CHECK (status IN ('pending', 'running', 'completed', 'dead_letter')),
  CONSTRAINT pipeline_jobs_priority_non_negative CHECK (priority >= 0),
  CONSTRAINT pipeline_jobs_attempts_non_negative CHECK (attempts >= 0),
  CONSTRAINT pipeline_jobs_max_attempts_positive CHECK (max_attempts > 0),
  CONSTRAINT pipeline_jobs_attempts_bounded CHECK (attempts <= max_attempts),
  CONSTRAINT pipeline_jobs_lease_consistent CHECK (
    (status = 'running' AND locked_by IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR
    (status <> 'running' AND locked_by IS NULL AND lease_expires_at IS NULL)
  )
);

CREATE INDEX pipeline_jobs_claim_idx
  ON pipeline_jobs (priority DESC, available_at, created_at)
  WHERE status = 'pending';
CREATE INDEX pipeline_jobs_expired_lease_idx
  ON pipeline_jobs (lease_expires_at)
  WHERE status = 'running';
