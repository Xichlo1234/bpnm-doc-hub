-- Migration 0010 (additive): an active partner code is unique at the database level.
--
-- Two partners that are not in the trash may not share a code (compared trimmed, case-insensitive
-- for ASCII; the application additionally normalises with full Unicode upper-casing). Partners in the
-- trash are excluded, so restoring one whose code was reused meanwhile fails instead of creating a
-- duplicate — also when two workers create/restore concurrently.
--
-- scripts/preflight.mjs blocks this migration while active partners share a code; the duplicates
-- must be resolved by hand (rename or move one to the trash). No row is modified here.
CREATE UNIQUE INDEX IF NOT EXISTS idx_partners_code_active
  ON partners (upper(trim(code)))
  WHERE deleted_at IS NULL;
