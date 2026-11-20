import type { SqlDatabase, SqlStatement } from './database.ts';
import {
  documentsTable,
  contractsTable,
  partnersTable,
  usersTable,
  notificationsTable,
  auditLogsTable,
  attachmentsTable,
  fromRow,
  toRow,
  bulkUpsertSql,
  bulkDeleteSql,
  type TableSpec,
} from './tables.ts';
import type { PersistedDataset } from './persistence.ts';

export const CONFIG_KEYS = ['categories', 'settings', 'currencies'] as const;
export type ConfigKey = (typeof CONFIG_KEYS)[number];

// Only the most recent audit entries are cached in memory; older ones are queried on demand.
export const AUDIT_CACHE_SIZE = 1000;

export interface LoadedDataset {
  version: number;
  documents: any[];
  contracts: any[];
  partners: any[];
  users: any[];
  notifications: any[];
  auditLogs: any[];
  attachments: any[];
  config: Partial<Record<ConfigKey, any>>;
}

export class DatabaseNotMigratedError extends Error {
  constructor(cause: unknown) {
    super(`Database schema is missing; run "npm run db:migrate:remote" (production) or restart the dev server (local). (${(cause as Error)?.message || cause})`);
  }
}

const VERSION_SQL = "SELECT CAST(value AS INTEGER) AS v FROM meta WHERE key = 'data_version'";
const BUMP_VERSION_SQL =
  "UPDATE meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'data_version' RETURNING CAST(value AS INTEGER) AS v";

export async function readVersion(db: SqlDatabase): Promise<number> {
  try {
    const row = await db.prepare(VERSION_SQL).first<{ v: number }>();
    return Number(row?.v ?? 0);
  } catch (err) {
    throw new DatabaseNotMigratedError(err);
  }
}

/** Loads every cached table in one transaction so the snapshot is consistent. */
export async function loadDataset(db: SqlDatabase): Promise<LoadedDataset> {
  let results: Array<{ results: any[] }>;
  try {
    results = await db.batch([
      db.prepare(VERSION_SQL),
      db.prepare('SELECT * FROM documents'),
      db.prepare('SELECT * FROM contracts'),
      db.prepare('SELECT * FROM partners'),
      db.prepare('SELECT * FROM users'),
      db.prepare('SELECT * FROM notifications ORDER BY created_at DESC'),
      db.prepare(`SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ${AUDIT_CACHE_SIZE}`),
      db.prepare('SELECT key, value FROM app_config'),
      db.prepare('SELECT * FROM attachments'),
    ]);
  } catch (err) {
    throw new DatabaseNotMigratedError(err);
  }
  const [version, documents, contracts, partners, users, notifications, auditLogs, config, attachments] = results.map(
    (r) => r.results
  );
  const parsedConfig: Partial<Record<ConfigKey, any>> = {};
  for (const row of config) {
    try {
      parsedConfig[row.key as ConfigKey] = JSON.parse(row.value);
    } catch {
      // ignore corrupt config rows; defaults apply
    }
  }
  return {
    version: Number(version[0]?.v ?? 0),
    documents: documents.map((r) => fromRow(documentsTable, r)),
    contracts: contracts.map((r) => fromRow(contractsTable, r)),
    partners: partners.map((r) => fromRow(partnersTable, r)),
    users: users.map((r) => fromRow(usersTable, r)),
    notifications: notifications.map((r) => fromRow(notificationsTable, r)),
    auditLogs: auditLogs.map((r) => fromRow(auditLogsTable, r)),
    attachments: attachments.map((r) => fromRow(attachmentsTable, r)),
    config: parsedConfig,
  };
}

export interface HistoryEntry {
  id: string;
  record_type: string;
  record_id: string;
  revision: number | null;
  action: string;
  changed_by: string;
  changed_by_name: string | null;
  changed_at: string;
  changes: Record<string, [unknown, unknown]> | null;
}

export function historyStatement(db: SqlDatabase, h: HistoryEntry): SqlStatement {
  return db
    .prepare(
      'INSERT INTO record_history (id, record_type, record_id, revision, action, changed_by, changed_by_name, changed_at, changes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(h.id, h.record_type, h.record_id, h.revision, h.action, h.changed_by, h.changed_by_name, h.changed_at, h.changes ? JSON.stringify(h.changes) : null);
}

export async function queryHistory(db: SqlDatabase, recordType: string, recordId: string): Promise<HistoryEntry[]> {
  const { results } = await db
    .prepare('SELECT * FROM record_history WHERE record_type = ? AND record_id = ? ORDER BY changed_at DESC, id DESC LIMIT 500')
    .bind(recordType, recordId)
    .all<any>();
  return results.map((r) => ({ ...r, changes: r.changes ? JSON.parse(r.changes) : null }));
}

export async function queryAuditLogs(db: SqlDatabase, limit: number): Promise<any[]> {
  const { results } = await db
    .prepare('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ?')
    .bind(limit)
    .all();
  return results.map((r) => fromRow(auditLogsTable, r));
}

// ---------------------------------------------------------------------------
// Statement builders
// ---------------------------------------------------------------------------

// Keeps each JSON parameter well under D1's 100KB statement limit.
const MAX_CHUNK_BYTES = 50_000;

function chunkJson(items: unknown[]): string[] {
  const chunks: string[] = [];
  let current: string[] = [];
  let size = 2;
  for (const item of items) {
    const json = JSON.stringify(item);
    if (current.length > 0 && size + json.length + 1 > MAX_CHUNK_BYTES) {
      chunks.push(`[${current.join(',')}]`);
      current = [];
      size = 2;
    }
    current.push(json);
    size += json.length + 1;
  }
  if (current.length > 0) chunks.push(`[${current.join(',')}]`);
  return chunks;
}

export function upsertStatements(db: SqlDatabase, spec: TableSpec, records: Record<string, any>[]): SqlStatement[] {
  const sql = bulkUpsertSql(spec);
  return chunkJson(records.map((r) => toRow(spec, r))).map((json) => db.prepare(sql).bind(json));
}

/**
 * Optimistic-concurrency guard (migration 0007): aborts the batch when any of these rows changed in
 * the database since they were read. Each entry is [id, revision read, or null for a new row].
 */
export function revisionGuardStatements(db: SqlDatabase, spec: TableSpec, entries: Array<[string, number | null]>): SqlStatement[] {
  const sql = `INSERT INTO write_guard (conflict)
    SELECT 1 FROM json_each(?) j JOIN ${spec.name} t ON t.id = json_extract(j.value, '$[0]')
    WHERE json_extract(j.value, '$[1]') IS NULL OR COALESCE(t.revision, 0) <> json_extract(j.value, '$[1]')
    LIMIT 1`;
  return chunkJson(entries).map((json) => db.prepare(sql).bind(json));
}

export class RevisionConflictError extends Error {
  constructor() {
    super('A record was changed by someone else since it was read');
  }
}

export function isGuardViolation(err: unknown): boolean {
  const msg = String((err as Error)?.message || err);
  return /CHECK constraint failed/i.test(msg) && /write_guard|conflict/i.test(msg);
}

export function deleteStatements(db: SqlDatabase, spec: TableSpec, ids: string[]): SqlStatement[] {
  const sql = bulkDeleteSql(spec);
  return chunkJson(ids).map((json) => db.prepare(sql).bind(json));
}

export function configStatement(db: SqlDatabase, key: ConfigKey, value: unknown): SqlStatement {
  return db.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').bind(key, JSON.stringify(value));
}

/**
 * Applies the statements atomically and bumps data_version. Returns the new version and whether
 * anyone else wrote since `knownVersion` (in which case the caller's cache is stale).
 */
export async function commitChanges(
  db: SqlDatabase,
  statements: SqlStatement[],
  knownVersion: number
): Promise<{ version: number; concurrentWrite: boolean }> {
  const results = await db.batch([...statements, db.prepare(BUMP_VERSION_SQL)]);
  const version = Number(results[results.length - 1].results[0]?.v ?? 0);
  return { version, concurrentWrite: version !== knownVersion + 1 };
}

// ---------------------------------------------------------------------------
// One-time import of the pre-migration dataset
// ---------------------------------------------------------------------------

export async function hasLegacyImport(db: SqlDatabase): Promise<boolean> {
  try {
    return Boolean(await db.prepare("SELECT 1 AS x FROM meta WHERE key = 'legacy_import'").first());
  } catch (err) {
    throw new DatabaseNotMigratedError(err);
  }
}

/**
 * Copies a full dataset into the tables. The guard row is inserted in the same transaction, so when
 * two isolates race only one import commits; the other fails on the primary key and returns false.
 */
export async function importLegacyDataset(db: SqlDatabase, data: PersistedDataset, source: string): Promise<boolean> {
  if (await hasLegacyImport(db)) return false;

  const statements: SqlStatement[] = [
    db
      .prepare("INSERT INTO meta (key, value) VALUES ('legacy_import', ?)")
      .bind(JSON.stringify({ source, at: new Date().toISOString() })),
  ];
  const add = (spec: TableSpec, records: any[]) => {
    statements.push(...upsertStatements(db, spec, records.filter((r) => r?.id)));
  };
  add(documentsTable, data.documents);
  add(contractsTable, data.contracts);
  add(partnersTable, data.partners);
  add(usersTable, data.users);
  add(notificationsTable, data.notifications);
  add(auditLogsTable, data.audit_logs);
  statements.push(configStatement(db, 'categories', data.categories));
  statements.push(configStatement(db, 'settings', data.settings));
  statements.push(configStatement(db, 'currencies', data.currencies));

  try {
    await commitChanges(db, statements, 0);
    return true;
  } catch (err) {
    if (await hasLegacyImport(db)) return false; // another isolate won the race
    throw err;
  }
}

