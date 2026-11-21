-- Transaction receipts reconcile a lost D1 batch response without repeating a write.
CREATE TABLE IF NOT EXISTS request_commits (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_request_commits_created_at ON request_commits(created_at);

-- Existing upload registrations were written after storing the object. New reservations
-- explicitly set NULL and cannot be attached until storage has acknowledged the put.
ALTER TABLE file_uploads ADD COLUMN stored_at TEXT DEFAULT 'legacy';

-- The application fills the canonical Unicode keys in a guarded batch before partner writes.
-- The visible partner code remains intact; any legacy ambiguity requires an operator decision.
CREATE TABLE IF NOT EXISTS partner_code_keys (
  code_key TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL UNIQUE
);
