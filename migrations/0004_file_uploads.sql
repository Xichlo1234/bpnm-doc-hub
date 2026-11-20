-- Migration 0004: registry of uploaded files (additive, safe on existing data).
-- Every upload to R2 (or local disk in dev) gets a row, so the server knows who uploaded a file
-- before it is attached to a record and can authorise reads of not-yet-attached files.
-- Files uploaded before this migration have no row; they are authorised through the records
-- that reference them, exactly as before.
CREATE TABLE IF NOT EXISTS file_uploads (
  key TEXT PRIMARY KEY,
  uploaded_by TEXT NOT NULL,
  original_name TEXT NOT NULL,
  size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_file_uploads_uploaded_by ON file_uploads(uploaded_by);
