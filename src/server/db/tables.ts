// Column definitions for the row-per-record tables in migrations/0001_normalized_tables.sql,
// plus converters between in-memory records and SQL rows.
//
// - `text` / `number` columns are stored as-is; `bool` columns as 0/1.
// - Optional columns (`?` fields in types.ts) are omitted from the record when NULL so records keep
//   the same shape as before the migration (e.g. must_change_password === undefined is meaningful).
// - Keys without a column go into the `extra` JSON column; `computed` keys are never stored.

type ColumnType = 'text' | 'number' | 'bool';
interface ColumnSpec {
  type: ColumnType;
  optional?: boolean;
}

export interface TableSpec {
  name: string;
  columns: Record<string, ColumnSpec>;
  computed?: string[];
}

const text: ColumnSpec = { type: 'text' };
const optText: ColumnSpec = { type: 'text', optional: true };
const num: ColumnSpec = { type: 'number' };
const optNum: ColumnSpec = { type: 'number', optional: true };
const bool: ColumnSpec = { type: 'bool' };
const optBool: ColumnSpec = { type: 'bool', optional: true };

export const documentsTable: TableSpec = {
  name: 'documents',
  computed: ['deadline_status'],
  columns: {
    id: text,
    document_number: text,
    original_doc_number: optText,
    title: text,
    doc_type: text,
    doc_category: optText,
    issuer: text,
    recipient: optText,
    signer: text,
    department: optText,
    handler: optText,
    issue_date: text,
    received_date: text,
    due_date: optText,
    completed_date: optText,
    urgency_level: optText,
    security_level: optText,
    linked_doc_number: optText,
    linked_doc_title: optText,
    send_method: optText,
    status: optText,
    directive: optText,
    storage_location: optText,
    notes: optText,
    summary: text,
    tags: text,
    file_key: text,
    file_name: text,
    file_size: num,
    file_type: text,
    google_drive_url: optText,
    google_drive_synced_at: optText,
    created_at: text,
    updated_at: text,
    revision: optNum, // migration 0003
    deleted_at: optText, // migration 0006
    deleted_by: optText,
  },
};

export const contractsTable: TableSpec = {
  name: 'contracts',
  computed: ['urgency'],
  columns: {
    id: text,
    contract_number: text,
    original_contract_number: optText,
    title: text,
    title_en: optText,
    contract_type: text,
    contract_category: optText,
    party_a: text,
    party_b: text,
    partner_code: optText,
    partner_name_en: optText,
    partner_tax_id: text,
    partner_contact: text,
    department: optText,
    value: num,
    original_value: optNum,
    currency: text,
    exchange_rate: optNum,
    signed_date: text,
    start_date: text,
    end_date: text,
    duration_text: optText,
    status: text,
    status_raw: optText,
    renewal_terms: text,
    notes: optText,
    storage_location: optText,
    electronic_location: optText,
    check_status: optText,
    file_key: text,
    file_name: text,
    file_size: num,
    file_type: text,
    google_drive_url: optText,
    google_drive_synced_at: optText,
    created_at: text,
    updated_at: text,
    revision: optNum, // migration 0003
    deleted_at: optText, // migration 0006
    deleted_by: optText,
  },
};

export const partnersTable: TableSpec = {
  name: 'partners',
  columns: {
    id: text,
    code: text,
    name_vn: text,
    name_en: optText,
    category: optText,
    address: optText,
    tax_id: optText,
    representative: optText,
    contact_person: optText,
    contact: optText,
    notes: optText,
    contract_count: optNum,
    active_contract_count: optNum,
    total_contracts: optNum,
    active_contracts: optNum,
    is_locked: optBool,
    deleted_at: optText, // migration 0006
    deleted_by: optText,
  },
};

export const usersTable: TableSpec = {
  name: 'users',
  columns: {
    id: text,
    username: text,
    password: optText,
    name: text,
    email: text,
    role: text,
    status: text,
    department: optText,
    preferred_language: optText,
    can_access_labor_contracts: optBool,
    can_access_confidential_documents: optBool, // migration 0005
    token_version: optNum,
    must_change_password: optBool,
    created_at: text,
    updated_at: text,
  },
};

export const notificationsTable: TableSpec = {
  name: 'notifications',
  columns: {
    id: text,
    title: text,
    message: text,
    type: text,
    target_id: optText,
    target_type: optText,
    recipient: optText,
    recipient_email: optText,
    recipient_user_id: optText, // migration 0005
    read: bool,
    due_date: optText,
    directive: optText,
    created_at: text,
  },
};

export const auditLogsTable: TableSpec = {
  name: 'audit_logs',
  columns: {
    id: text,
    user_id: text,
    username: text,
    action: text,
    entity_type: text,
    entity_id: optText,
    entity_title: optText,
    details: optText,
    ip_address: optText,
    timestamp: text,
  },
};

export const attachmentsTable: TableSpec = {
  name: 'attachments',
  columns: {
    id: text,
    series_id: text,
    record_type: text,
    record_id: text,
    file_key: text,
    original_name: text,
    size: num,
    mime_type: text,
    sha256: text,
    version: num,
    is_current: bool,
    note: optText,
    uploaded_by: text,
    uploaded_at: text,
    deleted_at: optText,
    deleted_by: optText,
  },
};

export const RECORD_TABLES = [documentsTable, contractsTable, partnersTable, usersTable, notificationsTable, auditLogsTable];

export function columnNames(spec: TableSpec): string[] {
  return [...Object.keys(spec.columns), 'extra'];
}

type SqlValue = string | number | null;

/** Converts a record into the positional values for columnNames(spec). */
export function toRow(spec: TableSpec, record: Record<string, any>): SqlValue[] {
  const values: SqlValue[] = [];
  for (const [name, col] of Object.entries(spec.columns)) {
    const v = record[name];
    if (v === undefined || v === null) values.push(null);
    else if (col.type === 'bool') values.push(v ? 1 : 0);
    else if (typeof v === 'object') values.push(JSON.stringify(v));
    else if (typeof v === 'boolean') values.push(v ? 1 : 0);
    else values.push(v);
  }
  const extra: Record<string, any> = {};
  for (const [key, v] of Object.entries(record)) {
    if (v === undefined || key in spec.columns || spec.computed?.includes(key)) continue;
    extra[key] = v;
  }
  values.push(Object.keys(extra).length > 0 ? JSON.stringify(extra) : null);
  return values;
}

export function fromRow<T>(spec: TableSpec, row: Record<string, any>): T {
  const record: Record<string, any> = {};
  for (const [name, col] of Object.entries(spec.columns)) {
    const v = row[name];
    if (v === null || v === undefined) {
      if (!col.optional) record[name] = null;
    } else {
      record[name] = col.type === 'bool' ? Boolean(v) : v;
    }
  }
  if (row.extra) {
    try {
      Object.assign(record, JSON.parse(row.extra));
    } catch {
      // A corrupt extra blob must not make the whole record unreadable
    }
  }
  return record as T;
}

/** Stable fingerprint used to detect which records changed since the last load/flush. */
export function rowFingerprint(spec: TableSpec, record: Record<string, any>): string {
  return JSON.stringify(toRow(spec, record));
}

/**
 * Upserts many rows with a single bound parameter: a JSON array of positional rows (see toRow).
 * D1 allows only 100 bound parameters per statement and caps queries per invocation, so one
 * statement per chunk of rows keeps bulk imports within limits.
 */
export function bulkUpsertSql(spec: TableSpec): string {
  const cols = columnNames(spec);
  const extracts = cols.map((_, i) => `json_extract(value, '$[${i}]')`).join(', ');
  return `INSERT OR REPLACE INTO ${spec.name} (${cols.join(', ')}) SELECT ${extracts} FROM json_each(?)`;
}

export function bulkDeleteSql(spec: TableSpec): string {
  return `DELETE FROM ${spec.name} WHERE id IN (SELECT value FROM json_each(?))`;
}
