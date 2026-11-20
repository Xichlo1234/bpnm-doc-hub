-- Migration 0005: access-control columns (additive; existing rows keep NULL = not granted).
-- users.can_access_confidential_documents: read access to "Mật"/"Tối mật"/"Tuyệt mật" documents.
-- notifications.recipient_user_id: the account a notification belongs to (per-user inbox).
ALTER TABLE users ADD COLUMN can_access_confidential_documents INTEGER;
ALTER TABLE notifications ADD COLUMN recipient_user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_user_id ON notifications(recipient_user_id);
