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
  /** Stored text of each config row, compared byte-for-byte by the write guard */
  configRaw: Partial<Record<ConfigKey, string>>;
  /** number_registry: "scope|norm" → owning record id (migration 0008) */
  numberOwners: Map<string, string>;
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
      db.prepare('SELECT scope, number_norm, record_id FROM number_registry'),
    ]);
  } catch (err) {
    throw new DatabaseNotMigratedError(err);
  }
  const [version, documents, contracts, partners, users, notifications, auditLogs, config, attachments, registry] = results.map(
    (r) => r.results
  );
  const parsedConfig: Partial<Record<ConfigKey, any>> = {};
  const configRaw: Partial<Record<ConfigKey, string>> = {};
  for (const row of config) {
    configRaw[row.key as ConfigKey] = row.value;
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
    configRaw,
    numberOwners: new Map(registry.map((r: any) => [`${r.scope}|${r.number_norm}`, r.record_id])),
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
  // conflict when the stored row changed (other revision) or appeared (new row that already exists)…
  const changedSql = `INSERT INTO write_guard (conflict)
    SELECT 1 FROM json_each(?) j JOIN ${spec.name} t ON t.id = json_extract(j.value, '$[0]')
    WHERE json_extract(j.value, '$[1]') IS NULL OR COALESCE(t.revision, 0) <> json_extract(j.value, '$[1]')
    LIMIT 1`;
  // …or disappeared (another worker purged it): writing it back would resurrect a deleted record
  const vanishedSql = `INSERT INTO write_guard (conflict)
    SELECT 1 FROM json_each(?) j
    WHERE json_extract(j.value, '$[1]') IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM ${spec.name} t WHERE t.id = json_extract(j.value, '$[0]'))
    LIMIT 1`;
  return chunkJson(entries).flatMap((json) => [db.prepare(changedSql).bind(json), db.prepare(vanishedSql).bind(json)]);
}

export class RevisionConflictError extends Error {
  constructor() {
    super('A record was changed by someone else since it was read');
  }
}

export function isGuardViolation(err: unknown): boolean {
  const msg = String((err as Error)?.message || err);
  return /CHECK constraint failed/i.test(msg) && /(^|[^_])conflict = 0|write_guard/i.test(msg) && !isNumberGuardViolation(err);
}

export function isNumberGuardViolation(err: unknown): boolean {
  const msg = String((err as Error)?.message || err);
  return /CHECK constraint failed/i.test(msg) && /number_conflict|number_guard/i.test(msg);
}

export class NumberConflictError extends Error {
  constructor(readonly number?: string) {
    super(`Number already in use${number ? `: ${number}` : ''}`);
  }
}

// ---------------------------------------------------------------------------
// Number registry (migration 0008)
// ---------------------------------------------------------------------------

export interface NumberEntry {
  scope: string;
  norm: string;
  display: string;
  recordType: 'document' | 'contract';
  recordId: string;
}

/** Aborts the batch when any of these numbers belongs to another record. */
export function numberGuardStatements(db: SqlDatabase, entries: NumberEntry[]): SqlStatement[] {
  const sql = `INSERT INTO number_guard (number_conflict)
    SELECT 1 FROM json_each(?) j JOIN number_registry r
      ON r.scope = json_extract(j.value, '$[0]') AND r.number_norm = json_extract(j.value, '$[1]')
     AND r.record_id <> json_extract(j.value, '$[2]')
    LIMIT 1`;
  return chunkJson(entries.map((e) => [e.scope, e.norm, e.recordId])).map((json) => db.prepare(sql).bind(json));
}

export function numberRegisterStatements(db: SqlDatabase, entries: NumberEntry[]): SqlStatement[] {
  const now = new Date().toISOString();
  const sql = `INSERT OR IGNORE INTO number_registry (scope, number_norm, number_display, record_type, record_id, registered_at)
    SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'),
           json_extract(value, '$[3]'), json_extract(value, '$[4]'), ? FROM json_each(?)`;
  return chunkJson(entries.map((e) => [e.scope, e.norm, e.display, e.recordType, e.recordId])).map((json) =>
    db.prepare(sql).bind(now, json)
  );
}

export async function hasNumberBackfill(db: SqlDatabase): Promise<boolean> {
  return Boolean(await db.prepare("SELECT 1 AS x FROM meta WHERE key = 'number_registry_backfill'").first());
}

/**
 * Registers the numbers of existing records once (oldest record first). Never modifies records:
 * historical duplicates are reported in the meta row instead.
 */
export async function backfillNumberRegistry(db: SqlDatabase, entries: NumberEntry[], duplicates: Array<{ scope: string; number: string; record_ids: string[] }>) {
  await db.batch([
    ...numberRegisterStatements(db, entries),
    db
      .prepare("INSERT OR IGNORE INTO meta (key, value) VALUES ('number_registry_backfill', ?)")
      .bind(JSON.stringify({ at: new Date().toISOString(), registered: entries.length, duplicates })),
  ]);
}

export function deleteStatements(db: SqlDatabase, spec: TableSpec, ids: string[]): SqlStatement[] {
  const sql = bulkDeleteSql(spec);
  return chunkJson(ids).map((json) => db.prepare(sql).bind(json));
}

export function configStatement(db: SqlDatabase, key: ConfigKey, value: unknown): SqlStatement {
  return db.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').bind(key, JSON.stringify(value));
}

/** Aborts the batch when the stored config text is no longer what this worker read (null = absent). */
export function configGuardStatement(db: SqlDatabase, key: ConfigKey, baseRaw: string | null): SqlStatement {
  return baseRaw === null
    ? db.prepare('INSERT INTO write_guard (conflict) SELECT 1 FROM app_config WHERE key = ? LIMIT 1').bind(key)
    : db.prepare('INSERT INTO write_guard (conflict) SELECT 1 FROM app_config WHERE key = ? AND value IS NOT ? LIMIT 1').bind(key, baseRaw);
}

/**
 * Files (uploads/…) a write points at: refuses keys queued for deletion or already deleted
 * (storage_cleanup, migration 0009), and marks the uploads as "attached" for good.
 */
export function fileUseStatements(db: SqlDatabase, keys: string[]): SqlStatement[] {
  if (keys.length === 0) return [];
  const now = new Date().toISOString();
  return chunkJson(keys).flatMap((json) => [
    db
      .prepare(
        "INSERT INTO file_guard (file_retired) SELECT 1 FROM storage_cleanup WHERE key IN (SELECT value FROM json_each(?)) AND status IN ('pending', 'deleted') LIMIT 1"
      )
      .bind(json),
    db.prepare('UPDATE file_uploads SET attached_at = COALESCE(attached_at, ?) WHERE key IN (SELECT value FROM json_each(?))').bind(now, json),
  ]);
}

export function isFileGuardViolation(err: unknown): boolean {
  const msg = String((err as Error)?.message || err);
  return /CHECK constraint failed/i.test(msg) && /file_retired|file_guard/i.test(msg);
}

export function isUsernameUniqueViolation(err: unknown): boolean {
  return /UNIQUE constraint failed: (users\.username|index 'idx_users_username_nocase')/i.test(String((err as Error)?.message || err));
}

export function isPartnerCodeUniqueViolation(err: unknown): boolean {
  return /UNIQUE constraint failed: (index 'idx_partners_code_active'|partners\.code)/i.test(String((err as Error)?.message || err));
}

export class PartnerCodeTakenError extends Error {
  constructor() {
    super('Partner code already in use');
  }
}

export class UsernameTakenError extends Error {
  constructor() {
    super('Username already exists');
  }
}

export class FileRetiredError extends Error {
  constructor() {
    super('The file is queued for deletion or deleted');
  }
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

