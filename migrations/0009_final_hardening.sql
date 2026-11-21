-- Migration 0009 (additive; no existing business row is modified or deleted).

-- Optimistic concurrency for partners, user accounts and attachment versions, like documents and
-- contracts (migration 0003): every write checks the revision it read inside the same D1 batch.
ALTER TABLE partners ADD COLUMN revision INTEGER;
ALTER TABLE users ADD COLUMN revision INTEGER;
ALTER TABLE attachments ADD COLUMN revision INTEGER;

-- A file that was ever attached to a record is never again "a private fresh upload" of its uploader,
-- even after the record is purged or the attachment removed.
ALTER TABLE file_uploads ADD COLUMN attached_at TEXT;
UPDATE file_uploads SET attached_at = created_at
 WHERE attached_at IS NULL
   AND key IN (SELECT file_key FROM documents WHERE file_key IS NOT NULL
               UNION SELECT file_key FROM contracts WHERE file_key IS NOT NULL
               UNION SELECT file_key FROM attachments);

-- Two-phase deletion of stored objects. A purge only enqueues keys (in the same transaction);
-- the cleanup re-checks references in the database before deleting from R2, records failures and
-- retries. Rows are kept as tombstones: a queued/deleted key can never be read or attached again.
--   status: pending | deleted | kept (still referenced, not deleted)
CREATE TABLE IF NOT EXISTS storage_cleanup (
  key TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  reason TEXT,
  enqueued_at TEXT NOT NULL,
  enqueued_by TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  last_attempt_at TEXT,
  done_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_storage_cleanup_status ON storage_cleanup(status);

-- Aborts a write batch that attaches a file queued for deletion (CHECK always fails).
CREATE TABLE IF NOT EXISTS file_guard (
  file_retired INTEGER CHECK (file_retired = 0)
);

-- One account per user name (case-insensitive), also when two admins create it at the same time.
-- scripts/preflight.mjs reports duplicates as blocking before this migration runs.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_nocase ON users(username COLLATE NOCASE);
