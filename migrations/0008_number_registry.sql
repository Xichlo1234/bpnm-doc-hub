-- Migration 0008 (additive): business numbers are unique at the database level.
--
-- number_registry holds one row per issued number and scope:
--   scope = 'doc:<doc_type>' for documents (incoming and outgoing registers are separate),
--           'contract' for contracts.
--   number_norm = the number trimmed, single-spaced, NFC, lower-case (computed by the app).
-- The primary key makes a second record with the same number impossible, also across Worker
-- isolates. Rows are kept when a record is soft-deleted or purged, so a number is never re-issued.
--
-- Existing records are registered by the application on first start after this migration
-- (meta key 'number_registry_backfill'): the oldest record keeps a number that is duplicated in
-- historical data; the other duplicates are listed in that meta row and by scripts/preflight.mjs.
-- No existing row is modified or deleted.
CREATE TABLE IF NOT EXISTS number_registry (
  scope TEXT NOT NULL,
  number_norm TEXT NOT NULL,
  number_display TEXT,
  record_type TEXT NOT NULL,
  record_id TEXT NOT NULL,
  registered_at TEXT NOT NULL,
  PRIMARY KEY (scope, number_norm)
);
CREATE INDEX IF NOT EXISTS idx_number_registry_record ON number_registry(record_type, record_id);

-- Aborts a write batch that would give a number to a second record (CHECK always fails).
CREATE TABLE IF NOT EXISTS number_guard (
  number_conflict INTEGER CHECK (number_conflict = 0)
);
