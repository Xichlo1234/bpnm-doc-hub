-- Migration 0011 (additive): Unicode-aware uniqueness of active partner codes.
--
-- 0010 compares upper(trim(code)), and SQLite's upper() folds ASCII only: "đt" and "ĐT" (or codes that
-- differ in inner spaces or Unicode form) were not caught by the database. The application now stores
-- a normalised key (src/shared/partnerCodeKey.mjs: NFKC, no spaces/invisible characters, upper case)
-- in code_key, and D1 refuses two active partners with the same key.
--
-- Existing rows keep code_key NULL here (SQL cannot compute the key). The application fills it on its
-- first start after this migration — only for codes that do not collide; colliding historical codes are
-- left NULL and reported by scripts/preflight.mjs (BLOCKING) for the owner to decide. No code is changed.
ALTER TABLE partners ADD COLUMN code_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_partners_code_key_active
  ON partners (code_key)
  WHERE deleted_at IS NULL AND code_key IS NOT NULL;
