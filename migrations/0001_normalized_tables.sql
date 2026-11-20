-- Migration 0001: move from a single JSON blob (system_data.primary_dataset) to one row per record.
--
-- Column lists must match src/server/db/tables.ts (enforced by tests/db_schema.test.ts).
-- Every table has an `extra` JSON column holding fields that have no column of their own
-- (e.g. ad-hoc columns from Excel imports), so no data is dropped on the way in.
-- system_data is left untouched as a backup of the pre-migration dataset.

-- schema.sql (v1) may have created these tables with an incompatible shape. The app never wrote
-- to them; scripts/db-migrate.mjs refuses to run if they contain rows.
DROP TABLE IF EXISTS contract_appendices;
DROP TABLE IF EXISTS contracts;
DROP TABLE IF EXISTS documents;

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  document_number TEXT,
  original_doc_number TEXT,
  title TEXT,
  doc_type TEXT,
  doc_category TEXT,
  issuer TEXT,
  recipient TEXT,
  signer TEXT,
  department TEXT,
  handler TEXT,
  issue_date TEXT,
  received_date TEXT,
  due_date TEXT,
  completed_date TEXT,
  urgency_level TEXT,
  security_level TEXT,
  linked_doc_number TEXT,
  linked_doc_title TEXT,
  send_method TEXT,
  status TEXT,
  directive TEXT,
  storage_location TEXT,
  notes TEXT,
  summary TEXT,
  tags TEXT,
  file_key TEXT,
  file_name TEXT,
  file_size INTEGER,
  file_type TEXT,
  google_drive_url TEXT,
  google_drive_synced_at TEXT,
  created_at TEXT,
  updated_at TEXT,
  extra TEXT
);
CREATE INDEX idx_documents_number ON documents(document_number);
CREATE INDEX idx_documents_issue_date ON documents(issue_date);
CREATE INDEX idx_documents_doc_type ON documents(doc_type);

CREATE TABLE contracts (
  id TEXT PRIMARY KEY,
  contract_number TEXT,
  original_contract_number TEXT,
  title TEXT,
  title_en TEXT,
  contract_type TEXT,
  contract_category TEXT,
  party_a TEXT,
  party_b TEXT,
  partner_code TEXT,
  partner_name_en TEXT,
  partner_tax_id TEXT,
  partner_contact TEXT,
  department TEXT,
  value REAL,
  original_value REAL,
  currency TEXT,
  exchange_rate REAL,
  signed_date TEXT,
  start_date TEXT,
  end_date TEXT,
  duration_text TEXT,
  status TEXT,
  status_raw TEXT,
  renewal_terms TEXT,
  notes TEXT,
  storage_location TEXT,
  electronic_location TEXT,
  check_status TEXT,
  file_key TEXT,
  file_name TEXT,
  file_size INTEGER,
  file_type TEXT,
  google_drive_url TEXT,
  google_drive_synced_at TEXT,
  created_at TEXT,
  updated_at TEXT,
  extra TEXT
);
CREATE INDEX idx_contracts_number ON contracts(contract_number);
CREATE INDEX idx_contracts_end_date ON contracts(end_date);
CREATE INDEX idx_contracts_status ON contracts(status);
CREATE INDEX idx_contracts_file_key ON contracts(file_key);

CREATE TABLE partners (
  id TEXT PRIMARY KEY,
  code TEXT,
  name_vn TEXT,
  name_en TEXT,
  category TEXT,
  address TEXT,
  tax_id TEXT,
  representative TEXT,
  contact_person TEXT,
  contact TEXT,
  notes TEXT,
  contract_count INTEGER,
  active_contract_count INTEGER,
  total_contracts INTEGER,
  active_contracts INTEGER,
  is_locked INTEGER,
  extra TEXT
);
CREATE INDEX idx_partners_code ON partners(code);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT,
  password TEXT,
  name TEXT,
  email TEXT,
  role TEXT,
  status TEXT,
  department TEXT,
  preferred_language TEXT,
  can_access_labor_contracts INTEGER,
  token_version INTEGER,
  must_change_password INTEGER,
  created_at TEXT,
  updated_at TEXT,
  extra TEXT
);
CREATE INDEX idx_users_username ON users(username COLLATE NOCASE);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  title TEXT,
  message TEXT,
  type TEXT,
  target_id TEXT,
  target_type TEXT,
  recipient TEXT,
  recipient_email TEXT,
  read INTEGER,
  due_date TEXT,
  directive TEXT,
  created_at TEXT,
  extra TEXT
);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);

-- Append-only; never rewritten by the app.
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  username TEXT,
  action TEXT,
  entity_type TEXT,
  entity_id TEXT,
  entity_title TEXT,
  details TEXT,
  ip_address TEXT,
  timestamp TEXT,
  extra TEXT
);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);

-- Small configuration documents edited as a whole: categories, settings, currencies.
CREATE TABLE app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- data_version is incremented by every write so isolates know when their cache is stale.
-- legacy_import is inserted (once) when the pre-migration dataset has been copied in.
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
INSERT INTO meta (key, value) VALUES ('data_version', '0');

-- Legacy file storage (base64 in D1). Created here so fresh databases match production;
-- new uploads go to R2 and old ones are copied over lazily on first download.
CREATE TABLE IF NOT EXISTS uploaded_files (
  key TEXT PRIMARY KEY,
  filename TEXT,
  mime_type TEXT,
  size INTEGER,
  data TEXT
);
CREATE TABLE IF NOT EXISTS file_chunks (
  key TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  total_chunks INTEGER,
  data TEXT,
  PRIMARY KEY (key, chunk_index)
);
CREATE TABLE IF NOT EXISTS system_data (
  key TEXT PRIMARY KEY,
  json_data TEXT,
  updated_at TEXT
);
