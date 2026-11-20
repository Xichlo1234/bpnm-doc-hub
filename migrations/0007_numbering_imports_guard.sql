-- Migration 0007 (additive).

-- Atomic document-number sequences ("incoming:2026", "outgoing:2026"). Allocation is a single
-- UPDATE ... RETURNING, so two users saving at the same moment can never get the same number.
CREATE TABLE IF NOT EXISTS number_sequences (
  key TEXT PRIMARY KEY,
  last_value INTEGER NOT NULL
);

-- Excel import log: who imported what, how many rows were added / updated / skipped.
CREATE TABLE IF NOT EXISTS import_batches (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  file_name TEXT,
  imported_by TEXT NOT NULL,
  imported_by_name TEXT,
  imported_at TEXT NOT NULL,
  added INTEGER NOT NULL,
  updated INTEGER NOT NULL,
  skipped INTEGER NOT NULL,
  details TEXT
);
CREATE INDEX IF NOT EXISTS idx_import_batches_at ON import_batches(imported_at);

-- Optimistic-concurrency guard: a write batch inserts a row here when a record changed since it was
-- read. The CHECK constraint always fails, which aborts (rolls back) the whole batch.
CREATE TABLE IF NOT EXISTS write_guard (
  conflict INTEGER CHECK (conflict = 0)
);
