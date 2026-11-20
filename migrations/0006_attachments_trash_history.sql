-- Migration 0006: multi-file attachments with versions, soft delete and edit history.
-- Additive only: existing rows keep their single file_key (still the record's "primary" file)
-- and deleted_at = NULL (not in the trash).

-- One row per stored file version. A record may have many attachments; replacing a file adds a
-- new row with version + 1 in the same `series_id` and marks the old one is_current = 0.
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  series_id TEXT NOT NULL,
  record_type TEXT NOT NULL,          -- 'document' | 'contract'
  record_id TEXT NOT NULL,
  file_key TEXT NOT NULL,
  original_name TEXT NOT NULL,
  size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  version INTEGER NOT NULL,
  is_current INTEGER NOT NULL DEFAULT 1,
  note TEXT,
  uploaded_by TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  deleted_at TEXT,
  deleted_by TEXT,
  extra TEXT
);
CREATE INDEX IF NOT EXISTS idx_attachments_record ON attachments(record_type, record_id);
CREATE INDEX IF NOT EXISTS idx_attachments_file_key ON attachments(file_key);
CREATE INDEX IF NOT EXISTS idx_attachments_series ON attachments(series_id);

-- Field-level edit history of documents and contracts.
CREATE TABLE IF NOT EXISTS record_history (
  id TEXT PRIMARY KEY,
  record_type TEXT NOT NULL,
  record_id TEXT NOT NULL,
  revision INTEGER,
  action TEXT NOT NULL,               -- create | update | delete | restore | import | attach | detach
  changed_by TEXT NOT NULL,
  changed_by_name TEXT,
  changed_at TEXT NOT NULL,
  changes TEXT                        -- JSON: { field: [before, after] }
);
CREATE INDEX IF NOT EXISTS idx_record_history_record ON record_history(record_type, record_id, changed_at);

-- Soft delete (trash) for documents, contracts and partners.
ALTER TABLE documents ADD COLUMN deleted_at TEXT;
ALTER TABLE documents ADD COLUMN deleted_by TEXT;
ALTER TABLE contracts ADD COLUMN deleted_at TEXT;
ALTER TABLE contracts ADD COLUMN deleted_by TEXT;
ALTER TABLE partners ADD COLUMN deleted_at TEXT;
ALTER TABLE partners ADD COLUMN deleted_by TEXT;
