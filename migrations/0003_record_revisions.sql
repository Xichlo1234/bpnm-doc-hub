-- Migration 0003: per-record revision counters for optimistic concurrency.
-- Every save increments `revision`; edit forms send the revision they loaded and the API answers
-- 409 instead of silently overwriting a newer save. Existing rows start at NULL (treated as 0).
ALTER TABLE documents ADD COLUMN revision INTEGER;
ALTER TABLE contracts ADD COLUMN revision INTEGER;
