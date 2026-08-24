-- T8 schema. Payload columns contain contract-shaped JSON; indexed columns
-- contain identity, lifecycle, and concurrency fields used by the repository.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  companion_id TEXT NOT NULL,
  relationship_id TEXT NOT NULL,
  host_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  domain TEXT NOT NULL CHECK (domain IN ('work', 'companion')),
  occurred_at TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  source_content_category TEXT NOT NULL,
  consent_json TEXT NOT NULL,
  learning_payload_json TEXT NOT NULL,
  policy_snapshot_json TEXT NOT NULL,
  processing_state TEXT NOT NULL CHECK (
    processing_state IN ('available', 'leased', 'completed', 'failed')
  ),
  worker_id TEXT,
  claim_token TEXT,
  lease_version INTEGER NOT NULL DEFAULT 0 CHECK (lease_version >= 0),
  lease_until TEXT,
  settings_revision INTEGER NOT NULL CHECK (settings_revision >= 0),
  CHECK (
    (processing_state = 'leased' AND worker_id IS NOT NULL AND claim_token IS NOT NULL AND lease_until IS NOT NULL)
    OR processing_state <> 'leased'
  ),
  UNIQUE (user_id, companion_id, relationship_id, host_id, source_ref)
);

CREATE TABLE IF NOT EXISTS evidence_tombstones (
  evidence_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  companion_id TEXT NOT NULL,
  relationship_id TEXT NOT NULL,
  deleted_at TEXT NOT NULL,
  reason_code TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  companion_id TEXT NOT NULL,
  relationship_id TEXT NOT NULL,
  preference_key TEXT NOT NULL,
  preference_value TEXT NOT NULL,
  scope_json TEXT NOT NULL,
  projection_json TEXT NOT NULL,
  provenance_json TEXT NOT NULL,
  evidence_ids_json TEXT NOT NULL,
  counter_evidence_ids_json TEXT NOT NULL,
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  risk_category TEXT NOT NULL CHECK (risk_category IN ('standard', 'sensitive')),
  status TEXT NOT NULL CHECK (
    status IN ('pending_confirmation', 'confirmed', 'rejected', 'superseded', 'deleted')
  ),
  idempotency_version INTEGER NOT NULL CHECK (idempotency_version = 1),
  idempotency_algorithm TEXT NOT NULL CHECK (idempotency_algorithm = 'sha256'),
  idempotency_digest TEXT NOT NULL UNIQUE,
  revision INTEGER NOT NULL CHECK (revision >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT
);

CREATE TABLE IF NOT EXISTS candidate_suppressions (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  companion_id TEXT NOT NULL,
  relationship_id TEXT NOT NULL,
  preference_key TEXT NOT NULL,
  scope_json TEXT NOT NULL,
  projection_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (candidate_id),
  UNIQUE (user_id, companion_id, relationship_id, preference_key, scope_json)
);

CREATE TABLE IF NOT EXISTS preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  companion_id TEXT NOT NULL,
  relationship_id TEXT NOT NULL,
  preference_key TEXT NOT NULL,
  preference_value TEXT NOT NULL,
  scope_json TEXT NOT NULL,
  projection_json TEXT NOT NULL,
  authority TEXT NOT NULL CHECK (authority IN ('user-set', 'user-confirmed')),
  revision INTEGER NOT NULL CHECK (revision >= 0),
  status TEXT NOT NULL CHECK (status IN ('active', 'superseded', 'revoked', 'deleted')),
  supersedes TEXT,
  superseded_by TEXT,
  evidence_ids_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT
);

CREATE TABLE IF NOT EXISTS connection_settings (
  user_id TEXT NOT NULL,
  companion_id TEXT NOT NULL,
  relationship_id TEXT NOT NULL,
  host_id TEXT NOT NULL,
  collection_policy_json TEXT NOT NULL,
  outbound_inference_policy_json TEXT NOT NULL,
  projection_policy_json TEXT NOT NULL,
  observe_enabled INTEGER NOT NULL CHECK (observe_enabled IN (0, 1)),
  learn_enabled INTEGER NOT NULL CHECK (learn_enabled IN (0, 1)),
  apply_enabled INTEGER NOT NULL CHECK (apply_enabled IN (0, 1)),
  revision INTEGER NOT NULL CHECK (revision >= 0),
  projection_status_json TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, companion_id, relationship_id, host_id)
);

CREATE TABLE IF NOT EXISTS mutation_receipts (
  action_id TEXT PRIMARY KEY,
  mutation TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  result_json TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  companion_id TEXT NOT NULL,
  relationship_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  kind TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  entity_json TEXT NOT NULL,
  settings_revision INTEGER,
  occurred_at TEXT NOT NULL,
  revision INTEGER
);

CREATE INDEX IF NOT EXISTS evidence_claim_queue_idx
  ON evidence (processing_state, lease_until, occurred_at, id);
CREATE INDEX IF NOT EXISTS evidence_identity_idx
  ON evidence (user_id, companion_id, relationship_id, host_id, occurred_at, id);
CREATE INDEX IF NOT EXISTS evidence_tombstone_identity_idx
  ON evidence_tombstones (user_id, companion_id, relationship_id, deleted_at, evidence_id);
CREATE INDEX IF NOT EXISTS candidates_status_idx
  ON candidates (status, created_at, id);
CREATE INDEX IF NOT EXISTS candidates_identity_idx
  ON candidates (user_id, companion_id, relationship_id, status, created_at, id);
CREATE INDEX IF NOT EXISTS candidates_preference_idx
  ON candidates (preference_key, status, idempotency_digest);
CREATE INDEX IF NOT EXISTS preferences_active_identity_idx
  ON preferences (user_id, companion_id, relationship_id, status, updated_at, id);
CREATE INDEX IF NOT EXISTS preferences_key_idx
  ON preferences (user_id, companion_id, relationship_id, preference_key, status);
CREATE UNIQUE INDEX IF NOT EXISTS preferences_active_slot_idx
  ON preferences (user_id, companion_id, relationship_id, preference_key, scope_json)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS connection_settings_host_idx
  ON connection_settings (host_id, user_id, companion_id, relationship_id);
CREATE INDEX IF NOT EXISTS mutation_receipts_mutation_idx
  ON mutation_receipts (mutation, recorded_at, action_id);
CREATE INDEX IF NOT EXISTS audit_identity_time_idx
  ON audit_events (user_id, companion_id, relationship_id, occurred_at, id);
CREATE INDEX IF NOT EXISTS audit_entity_kind_idx
  ON audit_events (kind, actor, occurred_at, id);
