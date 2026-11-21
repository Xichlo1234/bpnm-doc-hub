import {
  type DocumentRecord,
  type ContractRecord,
  type PartnerRecord,
  type NotificationRecord,
  type UserAccount,
  type AuditLogRecord,
  type CurrencyItem,
  type AttachmentRecord,
  type AttachmentRecordType,
  isLaborContract,
} from '../types.ts';
import { calculateUrgency, calculateDocumentDeadline } from '../utils/urgency.ts';
import {
  type SystemSettings,
  type PersistedDataset,
  defaultSettings,
  defaultCurrencies,
  readLegacyJsonDataset,
  readLegacyD1Dataset,
  withSeedDefaults,
} from './persistence.ts';
import { AsyncLocalStorage } from 'node:async_hooks';
import { partnerCodeKey } from '../../shared/partnerCodeKey.mjs';
import type { SqlDatabase, SqlStatement } from './database.ts';
import {
  loadDataset,
  readVersion,
  commitChanges,
  hasLegacyImport,
  importLegacyDataset,
  upsertStatements,
  deleteStatements,
  configStatement,
  historyStatement,
  revisionGuardStatements,
  isGuardViolation,
  isNumberGuardViolation,
  RevisionConflictError,
  NumberConflictError,
  numberGuardStatements,
  numberRegisterStatements,
  hasNumberBackfill,
  configGuardStatement,
  fileUseStatements,
  isFileGuardViolation,
  FileRetiredError,
  isUsernameUniqueViolation,
  UsernameTakenError,
  isPartnerCodeUniqueViolation,
  PartnerCodeTakenError,
  backfillNumberRegistry,
  type NumberEntry,
  type HistoryEntry,
  CONFIG_KEYS,
  AUDIT_CACHE_SIZE,
  type ConfigKey,
  type LoadedDataset,
} from './repository.ts';
import {
  documentsTable,
  contractsTable,
  partnersTable,
  usersTable,
  notificationsTable,
  auditLogsTable,
  attachmentsTable,
  rowFingerprint,
  type TableSpec,
} from './tables.ts';
import initialCategories from './categories.json';
import { contractValueTotals } from '../utils/contractRules.ts';
import { normalizeNumber, numberScope, numberOf } from '../utils/numberKeys.ts';
import { vietnamToday } from '../utils/workflow.ts';
import { canReadContract, canReadDocument, type AccessSubject } from '../utils/access.ts';

// Vietnamese string normalizer for fast, diacritic-insensitive search
export function normalizeVietnamese(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd');
}

export type LegacySource = 'd1' | 'json';

/** One import row as decided by the preview (see utils/importer.ts rowsToCommit). */
export interface ImportWrite {
  action: 'create' | 'update';
  id?: string;
  data: Record<string, any>;
}

/** Accepts the preview's decision, or a bare record: with a live id it updates, otherwise it creates. */
function asImportWrite(raw: ImportWrite | Record<string, any>): ImportWrite {
  if (raw && (raw as any).action && (raw as any).data) return raw as ImportWrite;
  const { id, ...data } = raw as Record<string, any>;
  return id ? { action: 'update', id, data } : { action: 'create', data };
}
export type TrashRecordType = 'document' | 'contract' | 'partner';
// Every row of these tables carries a revision checked inside the write batch (documents and
// contracts since 0003; partners, users and attachment versions since 0009)
const REVISIONED_TABLES = new Set(['documents', 'contracts', 'partners', 'users', 'attachments']);
// Business numbers (number_registry, 0008)
const NUMBERED_TABLES = new Set(['documents', 'contracts']);
// Rows whose file_key points at stored objects
const FILE_TABLES = new Set(['documents', 'contracts', 'attachments']);

function numberEntry(table: string, record: Record<string, any>): NumberEntry | null {
  const recordType = table === 'contracts' ? 'contract' : 'document';
  const display = String(numberOf(recordType, record) ?? '').trim();
  const norm = normalizeNumber(display);
  if (!norm) return null;
  return { scope: numberScope(recordType, record), norm, display, recordType, recordId: record.id };
}

function entryKey(e: NumberEntry | null): string | null {
  return e ? `${e.scope}|${e.norm}` : null;
}

function splitKey(key: string): [string, string] {
  const i = key.indexOf('|');
  return [key.slice(0, i), key.slice(i + 1)];
}

// Fields that change on every save and say nothing about what the user edited
const HISTORY_IGNORED_FIELDS = new Set(['updated_at', 'revision', 'deadline_status', 'urgency', 'created_at']);

// Standard paper-archive location: Kho / Tủ / Ngăn / Hộp. When any part is given, the free-text
// storage_location is rebuilt from the parts so every record uses the same format.
export const STORAGE_PARTS = [
  ['storage_warehouse', 'Kho'],
  ['storage_cabinet', 'Tủ'],
  ['storage_shelf', 'Ngăn'],
  ['storage_box', 'Hộp'],
] as const;

export function withStorageLocation<T extends Record<string, any>>(rec: T): T {
  const parts = STORAGE_PARTS.map(([key, label]) => {
    const v = String(rec[key] ?? '').trim();
    return v ? `${label} ${v}` : '';
  }).filter(Boolean);
  if (parts.length === 0) return rec;
  return { ...rec, storage_location: parts.join(' / ') };
}

/** { field: [before, after] } for every field whose value changed. */
export function diffRecords(before: Record<string, any> | null, after: Record<string, any> | null): Record<string, [unknown, unknown]> {
  const changes: Record<string, [unknown, unknown]> = {};
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  for (const key of keys) {
    if (HISTORY_IGNORED_FIELDS.has(key)) continue;
    const a = before?.[key] ?? null;
    const b = after?.[key] ?? null;
    if (JSON.stringify(a) !== JSON.stringify(b)) changes[key] = [a, b];
  }
  return changes;
}

/**
 * In-memory cache of the database, kept so route handlers can stay synchronous.
 *
 * Persistence model (migrations/0001):
 * - Every record lives in its own row. flush() diffs the cache against fingerprints taken at the
 *   last load/flush and writes only changed rows, so concurrent writers only conflict when they
 *   edit the same record (last write wins per row, not per dataset).
 * - meta.data_version is bumped by every commit. sync() compares it at the start of each request
 *   and reloads when another isolate has written.
 */
export class MemoryStore {
  private documents: Map<string, DocumentRecord> = new Map();
  private contracts: Map<string, ContractRecord> = new Map();
  private partners: Map<string, PartnerRecord> = new Map();
  private categories: any = {};
  private settings: SystemSettings = defaultSettings;
  private notifications: NotificationRecord[] = [];
  private users: Map<string, UserAccount> = new Map();
  private auditLogs: AuditLogRecord[] = [];
  private currencies: CurrencyItem[] = [];
  private attachments: Map<string, AttachmentRecord> = new Map();
  // Edit-history rows written with the next flush (same transaction as the change itself)
  private pendingHistory: HistoryEntry[] = [];
  // Extra statements that must commit together with this request's record changes (e.g. import log)
  private pendingStatements: Array<(db: SqlDatabase) => SqlStatement> = [];

  private db: SqlDatabase | null = null;
  private loaded = false;
  // The last commit was REJECTED (or its outcome is unknown): the cache holds changes D1 does not
  private stale = false;
  // The last commit SUCCEEDED but another worker committed in between: our rows are in D1, theirs are
  // missing from this cache. Reload before the next request; never report this as a failure.
  private reloadNeeded = false;
  private version = 0;
  // Fingerprints of what the database holds, per table and record id
  private snapshots = new Map<string, Map<string, string>>();
  // Revision of each document/contract as last read from or written to the database
  private baseRevisions = new Map<string, Map<string, number>>();
  // Registered number ("scope|norm") of each document/contract as last read or written
  private baseNumbers = new Map<string, Map<string, string | null>>();
  private configSnapshot: Partial<Record<ConfigKey, string>> = {};
  // Stored text of each config row as last read/written (base for the config write guard)
  private configRaw: Partial<Record<ConfigKey, string>> = {};
  // number_registry "scope|norm" → owning record id (numbers are never released)
  private numberOwners = new Map<string, string>();
  private persistedAuditIds = new Set<string>();
  // Serializes sync/flush so a reload never interleaves with a commit within one isolate
  private dbLock: Promise<unknown> = Promise.resolve();

  /** Test helper: replaces the cached data with the seed dataset; the next flush persists it. */
  public reset() {
    this.applyDataset(withSeedDefaults(null));
    this.auditLogs = [];
    this.attachments.clear();
    this.pendingHistory = [];
    this.pendingStatements = [];
    // The reset dataset replaces whatever a failed commit left behind
    this.stale = false;
    this.fillPartnerKeys();
  }

  /**
   * partners.code_key (migration 0011) for every partner that lacks it or whose code changed. A key held
   * by another active partner (historical duplicate, reported by the preflight) is left NULL so the
   * record stays editable; such pairs are never "resolved" automatically. Returns true if anything changed.
   */
  private fillPartnerKeys(): boolean {
    let changed = false;
    const holders = new Map<string, string>();
    const all = [...this.partners.values()].sort((a: any, b: any) => String(a.created_at || '').localeCompare(String(b.created_at || '')) || a.id.localeCompare(b.id));
    for (const p of all) if (!p.deleted_at && p.code_key && p.code_key === partnerCodeKey(p.code)) holders.set(p.code_key, p.id);
    for (const p of all) {
      const key = partnerCodeKey(p.code);
      if ((p.code_key ?? null) === key && (!key || p.deleted_at || holders.get(key) === p.id)) continue;
      const free = key && (p.deleted_at || !holders.has(key) || holders.get(key) === p.id);
      const next = free ? key : null;
      if ((p.code_key ?? null) !== next) {
        this.partners.set(p.id, { ...p, code_key: next });
        changed = true;
      }
      if (next && !p.deleted_at) holders.set(next, p.id);
    }
    return changed;
  }

  /** code_key for one partner being written, by the same rule as fillPartnerKeys. */
  private keyFor(p: PartnerRecord): string | null {
    const key = partnerCodeKey(p.code);
    if (!key || p.deleted_at) return key;
    const holder = [...this.partners.values()].find((o) => o.id !== p.id && !o.deleted_at && o.code_key === key);
    return holder ? null : key;
  }

  private applyDataset(data: Omit<PersistedDataset, 'audit_logs'>) {
    this.documents.clear();
    this.contracts.clear();
    this.partners.clear();
    this.users.clear();

    this.categories = {
      ...JSON.parse(JSON.stringify(initialCategories)),
      ...(data.categories || {}),
    };
    this.settings = { ...defaultSettings, ...(data.settings || {}) };
    this.notifications = [...(data.notifications || [])];
    this.currencies = data.currencies && data.currencies.length > 0 ? data.currencies : defaultCurrencies;

    for (const u of data.users) {
      this.users.set(u.id, { ...u });
    }
    for (const doc of data.documents) {
      this.documents.set(doc.id, {
        ...doc,
        deadline_status: calculateDocumentDeadline(doc),
      });
    }
    for (const c of data.contracts) {
      this.contracts.set(c.id, { ...c });
    }
    for (const p of data.partners) {
      this.partners.set(p.id, { ...p });
    }
  }

  private withLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.dbLock.then(fn, fn);
    this.dbLock = run.catch(() => {});
    return run;
  }

  /**
   * Called at the start of every API request: imports the legacy dataset on first boot, then
   * reloads the cache if it is stale or another isolate has committed since our last look.
   */
  public sync(db: SqlDatabase, legacySource: LegacySource): Promise<void> {
    return this.withLock(async () => {
      this.db = db;
      if (!this.loaded) {
        if (!(await hasLegacyImport(db))) {
          const legacy = legacySource === 'd1' ? await readLegacyD1Dataset(db) : readLegacyJsonDataset();
          await importLegacyDataset(db, withSeedDefaults(legacy), legacy ? legacySource : 'seed');
        }
        await this.reload(db);
        await this.ensureNumberRegistry(db);
        await this.backfillPartnerKeys(db);
        return;
      }
      if (this.stale) {
        await this.reload(db);
        await this.backfillPartnerKeys(db);
        return;
      }
      // Changes made outside a request (tests, scripts) are written before checking for others'
      await this.flushUnlocked(db);
      if (this.reloadNeeded || (await readVersion(db)) !== this.version) {
        await this.reload(db);
        await this.backfillPartnerKeys(db);
      }
    });
  }

  /** Writes missing partners.code_key values (rows written before 0011 or by an older build). */
  private async backfillPartnerKeys(db: SqlDatabase) {
    if (!this.fillPartnerKeys()) return;
    try {
      await this.flushUnlocked(db);
    } catch (err) {
      // Another worker wrote the same rows meanwhile: reload next time and try again; never fail the request
      console.warn('partner code_key backfill deferred', err);
      this.stale = false;
      this.reloadNeeded = true;
    }
  }

  /** One-time registration of existing numbers after migration 0008 (see backfillNumberRegistry). */
  private async ensureNumberRegistry(db: SqlDatabase) {
    if (await hasNumberBackfill(db)) return;
    const entries: NumberEntry[] = [];
    const owners = new Map<string, string[]>();
    const byAge = (a: any, b: any) => String(a.created_at || '').localeCompare(String(b.created_at || '')) || String(a.id).localeCompare(String(b.id));
    for (const [table, list] of [
      ['documents', Array.from(this.documents.values())],
      ['contracts', Array.from(this.contracts.values())],
    ] as const) {
      for (const r of [...(list as any[])].sort(byAge)) {
        const e = numberEntry(table, r);
        const key = entryKey(e);
        if (!e || !key) continue;
        if (!owners.has(key)) entries.push(e);
        owners.set(key, [...(owners.get(key) || []), r.id]);
      }
    }
    const duplicates = [...owners.entries()]
      .filter(([, ids]) => ids.length > 1)
      .map(([key, ids]) => ({ scope: splitKey(key)[0], number: splitKey(key)[1], record_ids: ids }));
    await backfillNumberRegistry(db, entries, duplicates);
    for (const e of entries) if (!this.numberOwners.has(`${e.scope}|${e.norm}`)) this.numberOwners.set(`${e.scope}|${e.norm}`, e.recordId);
  }

  private async reload(db: SqlDatabase) {
    const data: LoadedDataset = await loadDataset(db);
    this.applyDataset({
      documents: data.documents,
      contracts: data.contracts,
      partners: data.partners,
      users: data.users,
      notifications: data.notifications,
      categories: data.config.categories,
      settings: data.config.settings,
      currencies: data.config.currencies,
    });
    this.auditLogs = data.auditLogs;
    this.attachments = new Map(data.attachments.map((a: AttachmentRecord) => [a.id, a]));
    this.pendingHistory = [];
    this.pendingStatements = [];

    this.snapshots.clear();
    this.baseRevisions.clear();
    for (const [spec, records] of this.cachedTables()) {
      const snap = new Map<string, string>();
      for (const record of records) snap.set(record.id, rowFingerprint(spec, record));
      this.snapshots.set(spec.name, snap);
      if (REVISIONED_TABLES.has(spec.name)) {
        this.baseRevisions.set(spec.name, new Map(records.map((r) => [r.id, Number(r.revision ?? 0)])));
      }
      if (NUMBERED_TABLES.has(spec.name)) {
        this.baseNumbers.set(spec.name, new Map(records.map((r) => [r.id, entryKey(numberEntry(spec.name, r))])));
      }
    }
    // Config rows that don't exist yet are treated as changed so defaults get persisted
    this.configSnapshot = {};
    for (const key of CONFIG_KEYS) {
      if (data.config[key] !== undefined) this.configSnapshot[key] = JSON.stringify(data.config[key]);
    }
    this.persistedAuditIds = new Set(this.auditLogs.map((l) => l.id));
    this.configRaw = { ...data.configRaw };
    this.numberOwners = new Map(data.numberOwners);

    this.version = data.version;
    this.loaded = true;
    this.stale = false;
    this.reloadNeeded = false;
  }

  private cachedTables(): Array<[TableSpec, Array<Record<string, any>>]> {
    return [
      [documentsTable, Array.from(this.documents.values())],
      [contractsTable, Array.from(this.contracts.values())],
      [partnersTable, Array.from(this.partners.values())],
      [usersTable, Array.from(this.users.values())],
      [notificationsTable, this.notifications],
      [attachmentsTable, Array.from(this.attachments.values())],
    ];
  }

  private configValue(key: ConfigKey): unknown {
    return key === 'categories' ? this.categories : key === 'settings' ? this.settings : this.currencies;
  }

  /** Writes every record that changed since the last load/flush in one transaction. */
  public flush(db: SqlDatabase | null = this.db): Promise<void> {
    if (!db) return Promise.resolve();
    return this.withLock(() => this.flushUnlocked(db));
  }

  private async flushUnlocked(db: SqlDatabase) {
    if (!this.loaded || this.stale) return;

    const statements: SqlStatement[] = [];
    const pendingSnapshots: Array<() => void> = [];

    for (const [spec, records] of this.cachedTables()) {
      const snap = this.snapshots.get(spec.name) ?? new Map<string, string>();
      const changed: Array<Record<string, any>> = [];
      const fingerprints = new Map<string, string>();
      for (const record of records) {
        const fp = rowFingerprint(spec, record);
        fingerprints.set(record.id, fp);
        if (snap.get(record.id) !== fp) changed.push(record);
      }
      const removed = [...snap.keys()].filter((id) => !fingerprints.has(id));
      if (changed.length === 0 && removed.length === 0) continue;
      let claims: NumberEntry[] = [];
      if (REVISIONED_TABLES.has(spec.name)) {
        const base = this.baseRevisions.get(spec.name) ?? new Map<string, number>();
        // Every write of a row moves its revision on, also when the caller did not bump it
        for (const r of changed) {
          const before = base.has(r.id) ? base.get(r.id)! : null;
          if (before === null ? r.revision == null : Number(r.revision ?? 0) === before) {
            r.revision = (before ?? 0) + 1;
            fingerprints.set(r.id, rowFingerprint(spec, r));
          }
        }
        // Checked inside the same transaction as the write: a row someone else changed, created or
        // deleted since this worker read it aborts the whole batch — for updates, creations and
        // deletions (purge, user/partner removal) alike
        statements.push(
          ...revisionGuardStatements(db, spec, [
            ...changed.map((r): [string, number | null] => [r.id, base.has(r.id) ? base.get(r.id)! : null]),
            ...removed.filter((id) => base.has(id)).map((id): [string, number | null] => [id, base.get(id)!]),
          ])
        );
      }
      if (NUMBERED_TABLES.has(spec.name) && changed.length > 0) {
        // A record that gets a new number (new record, number or type changed) claims it in
        // number_registry; the database refuses a number another record ever held. Numbers are
        // never released: renumbering, trash and purge keep them reserved.
        claims = this.numberClaimsFor(spec.name, changed, records);
        statements.push(...numberGuardStatements(db, claims), ...numberRegisterStatements(db, claims));
      }
      if (FILE_TABLES.has(spec.name) && changed.length > 0) {
        const keys = [...new Set(changed.map((r) => r.file_key).filter((k): k is string => typeof k === 'string' && k.startsWith('uploads/')))];
        statements.push(...fileUseStatements(db, keys));
      }
      // Deletions first: a row that frees a unique value (partner code, user name) must be gone before
      // another row takes it in the same batch
      statements.push(...deleteStatements(db, spec, removed), ...upsertStatements(db, spec, changed));
      pendingSnapshots.push(() => {
        this.snapshots.set(spec.name, fingerprints);
        if (REVISIONED_TABLES.has(spec.name)) {
          const base = this.baseRevisions.get(spec.name) ?? new Map<string, number>();
          for (const r of changed) base.set(r.id, Number(r.revision ?? 0));
          for (const id of removed) base.delete(id);
          this.baseRevisions.set(spec.name, base);
        }
        if (NUMBERED_TABLES.has(spec.name)) {
          const nums = this.baseNumbers.get(spec.name) ?? new Map<string, string | null>();
          for (const r of changed) nums.set(r.id, entryKey(numberEntry(spec.name, r)));
          this.baseNumbers.set(spec.name, nums);
          for (const c of claims) this.numberOwners.set(`${c.scope}|${c.norm}`, c.recordId);
        }
      });
    }

    for (const key of CONFIG_KEYS) {
      const json = JSON.stringify(this.configValue(key));
      if (this.configSnapshot[key] !== json) {
        // Settings/categories/currencies are one row each: refuse to overwrite a version another
        // worker saved since this one read it
        statements.push(configGuardStatement(db, key, this.configRaw[key] ?? null), configStatement(db, key, this.configValue(key)));
        pendingSnapshots.push(() => {
          this.configSnapshot[key] = json;
          this.configRaw[key] = json;
        });
      }
    }

    const newAuditLogs = this.auditLogs.filter((l) => !this.persistedAuditIds.has(l.id));
    if (newAuditLogs.length > 0) {
      statements.push(...upsertStatements(db, auditLogsTable, newAuditLogs));
      pendingSnapshots.push(() => newAuditLogs.forEach((l) => this.persistedAuditIds.add(l.id)));
    }

    const extra = this.pendingStatements;
    if (extra.length > 0) {
      statements.push(...extra.map((make) => make(db)));
      pendingSnapshots.push(() => (this.pendingStatements = this.pendingStatements.filter((x) => !extra.includes(x))));
    }

    const history = this.pendingHistory;
    if (history.length > 0) {
      statements.push(...history.map((h) => historyStatement(db, h)));
      pendingSnapshots.push(() => (this.pendingHistory = this.pendingHistory.filter((h) => !history.includes(h))));
    }

    if (statements.length === 0) return;

    let outcome: { version: number; concurrentWrite: boolean };
    try {
      outcome = await commitChanges(db, statements, this.version);
    } catch (err) {
      // Rejected (guard / unique index) or unknown (timeout, network): the cache holds changes the
      // database may not have. Discard them; the caller must not report success.
      this.stale = true;
      if (/WRITE_FENCE/.test(String((err as Error)?.message || err))) throw new WriteFencedError();
      if (isNumberGuardViolation(err)) throw new NumberConflictError();
      if (isFileGuardViolation(err)) throw new FileRetiredError();
      if (isUsernameUniqueViolation(err)) throw new UsernameTakenError();
      if (isPartnerCodeUniqueViolation(err)) throw new PartnerCodeTakenError();
      if (isGuardViolation(err)) throw new RevisionConflictError();
      throw new CommitOutcomeUnknownError(err);
    }
    // Committed. Bookkeeping only from here on: nothing below may turn this into a failure.
    pendingSnapshots.forEach((apply) => apply());
    this.version = outcome.version;
    if (outcome.concurrentWrite) this.reloadNeeded = true;
  }

  // ---------------------------------------------------------------------------
  // Request isolation. A request that may write works on a private fork of the committed cache
  // (see runRequest below). Other requests never see its uncommitted changes, and no other request's
  // flush can commit them. The fork replaces the shared cache only after its own commit succeeded.
  // ---------------------------------------------------------------------------

  /** A private, deep copy of this cache (data and commit bookkeeping). */
  public fork(): MemoryStore {
    const f = new MemoryStore();
    const clone = <T>(v: T): T => structuredClone(v);
    f.documents = clone(this.documents);
    f.contracts = clone(this.contracts);
    f.partners = clone(this.partners);
    f.categories = clone(this.categories);
    f.settings = clone(this.settings);
    f.notifications = clone(this.notifications);
    f.users = clone(this.users);
    f.auditLogs = [...this.auditLogs]; // append-only, entries are never changed
    f.currencies = clone(this.currencies);
    f.attachments = clone(this.attachments);
    f.pendingHistory = [...this.pendingHistory];
    f.pendingStatements = [...this.pendingStatements];
    f.db = this.db;
    f.loaded = this.loaded;
    f.stale = this.stale;
    f.reloadNeeded = this.reloadNeeded;
    f.version = this.version;
    f.snapshots = clone(this.snapshots);
    f.baseRevisions = clone(this.baseRevisions);
    f.baseNumbers = clone(this.baseNumbers);
    f.configSnapshot = { ...this.configSnapshot };
    f.configRaw = { ...this.configRaw };
    f.numberOwners = new Map(this.numberOwners);
    f.persistedAuditIds = new Set(this.persistedAuditIds);
    return f;
  }

  /** Takes over a fork's state after it committed everything it changed. */
  public adopt(f: MemoryStore) {
    this.documents = f.documents;
    this.contracts = f.contracts;
    this.partners = f.partners;
    this.categories = f.categories;
    this.settings = f.settings;
    this.notifications = f.notifications;
    this.users = f.users;
    this.auditLogs = f.auditLogs;
    this.currencies = f.currencies;
    this.attachments = f.attachments;
    this.pendingHistory = f.pendingHistory;
    this.pendingStatements = f.pendingStatements;
    this.loaded = f.loaded;
    this.stale = f.stale;
    this.reloadNeeded = f.reloadNeeded;
    this.version = f.version;
    this.snapshots = f.snapshots;
    this.baseRevisions = f.baseRevisions;
    this.baseNumbers = f.baseNumbers;
    this.configSnapshot = f.configSnapshot;
    this.configRaw = f.configRaw;
    this.numberOwners = f.numberOwners;
    this.persistedAuditIds = f.persistedAuditIds;
  }

  /** Forces a reload from D1 at the next sync (state unknown after a discarded fork). */
  public invalidate() {
    this.reloadNeeded = true;
  }

  /** True when the cache holds changes not yet committed (rows, config, audit, history, statements). */
  public hasPendingChanges(): boolean {
    if (!this.loaded) return false;
    if (this.pendingHistory.length || this.pendingStatements.length) return true;
    if (this.auditLogs.some((l) => !this.persistedAuditIds.has(l.id))) return true;
    for (const key of CONFIG_KEYS) if (this.configSnapshot[key] !== JSON.stringify(this.configValue(key))) return true;
    for (const [spec, records] of this.cachedTables()) {
      const snap = this.snapshots.get(spec.name) ?? new Map<string, string>();
      if (snap.size !== records.length) return true;
      for (const r of records) if (snap.get(r.id) !== rowFingerprint(spec, r)) return true;
    }
    return false;
  }

  public get isStale() {
    return this.stale;
  }

  /**
   * Numbers that changed records claim. A number held by another record — in this cache or ever
   * registered (renumbered, trashed and purged records keep theirs) — is refused before writing;
   * the database checks it again inside the batch (number_guard) against other workers' writes.
   */
  private numberClaimsFor(table: string, changed: Array<Record<string, any>>, all: Array<Record<string, any>>): NumberEntry[] {
    const base = this.baseNumbers.get(table) ?? new Map<string, string | null>();
    const claims: NumberEntry[] = [];
    for (const r of changed) {
      const entry = numberEntry(table, r);
      const key = entryKey(entry);
      const before = base.has(r.id) ? base.get(r.id)! : undefined;
      if (!entry || !key || key === before) continue; // no number, or unchanged (historical duplicates stay editable)
      const owner = this.numberOwners.get(key);
      if (owner && owner !== r.id) throw new NumberConflictError(entry.display);
      const clash = all.find((o) => o.id !== r.id && entryKey(numberEntry(table, o)) === key);
      if (clash) throw new NumberConflictError(entry.display);
      claims.push(entry);
    }
    return claims;
  }

  /** Record id that holds a business number ("scope|norm"), or null (number_registry, 0008). */
  public numberOwnerOf(key: string): string | null {
    return this.numberOwners.get(key) ?? null;
  }

  public registeredNumbers(): Map<string, string> {
    return new Map(this.numberOwners);
  }

  /** Numbers of live and trashed records missing from the registry, and ones held by another record. */
  public numberRegistryReport(): {
    missing: NumberEntry[];
    conflicts: Array<{ scope: string; number: string; record_id: string; registered_to: string }>;
  } {
    const missing: NumberEntry[] = [];
    const conflicts: Array<{ scope: string; number: string; record_id: string; registered_to: string }> = [];
    const seen = new Set<string>();
    for (const [table, map] of [
      ['documents', this.documents],
      ['contracts', this.contracts],
    ] as const) {
      const byAge = [...(map as Map<string, any>).values()].sort(
        (a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')) || String(a.id).localeCompare(String(b.id))
      );
      for (const r of byAge) {
        const e = numberEntry(table, r);
        const key = entryKey(e);
        if (!e || !key) continue;
        const owner = this.numberOwners.get(key);
        if (!owner && !seen.has(key)) {
          missing.push(e);
          seen.add(key);
        } else if ((owner && owner !== r.id) || (!owner && seen.has(key))) {
          conflicts.push({ scope: e.scope, number: e.display, record_id: r.id, registered_to: owner ?? missing.find((m) => entryKey(m) === key)!.recordId });
        }
      }
    }
    return { missing, conflicts };
  }

  public markNumbersRegistered(entries: NumberEntry[]) {
    for (const e of entries) if (!this.numberOwners.has(`${e.scope}|${e.norm}`)) this.numberOwners.set(`${e.scope}|${e.norm}`, e.recordId);
  }

  /** Adds a statement to the next flush, in the same transaction as the record changes. */
  public queueStatement(make: (db: SqlDatabase) => SqlStatement) {
    this.pendingStatements.push(make);
  }

  /** Kept for route handlers: persists this request's changes before the response is built. */
  public async persistAsync() {
    // A commit of this cache that was rejected earlier left changes D1 does not have: never report success
    if (this.stale) throw new RevisionConflictError();
    await this.flush();
    // A commit that succeeded while another worker also wrote is a SUCCESS (reloadNeeded only)
  }

  // Document operations
  public getDocuments(type?: string): DocumentRecord[] {
    const docs = Array.from(this.documents.values()).filter((d) => !d.deleted_at).map(d => ({
      ...d,
      deadline_status: calculateDocumentDeadline(d),
    }));

    if (type && type !== 'all') {
      if (type === 'incoming') {
        return docs.filter(d => d.doc_type === 'incoming');
      }
      if (type === 'outgoing') {
        return docs.filter(d => d.doc_type === 'outgoing');
      }
      if (type === 'decision') {
        return docs.filter(d => d.doc_type === 'decision');
      }
      if (type === 'internal') {
        return docs.filter(d => d.doc_type === 'internal');
      }
      if (type === 'overdue') {
        return docs.filter(d => d.deadline_status?.level === 'overdue');
      }
      if (type === 'expiring_soon') {
        return docs.filter(d => ['urgent', 'warning'].includes(d.deadline_status?.level || ''));
      }
      if (type === 'completed') {
        return docs.filter(d => d.status === 'Hoàn thành' || d.deadline_status?.level.startsWith('completed'));
      }
      return docs.filter(d => d.doc_type === type);
    }
    return docs.sort((a, b) => b.issue_date.localeCompare(a.issue_date));
  }

  public getDocument(id: string, options: { includeDeleted?: boolean } = {}): DocumentRecord | null {
    const doc = this.documents.get(id);
    if (!doc || (doc.deleted_at && !options.includeDeleted)) return null;
    return {
      ...doc,
      deadline_status: calculateDocumentDeadline(doc),
    };
  }

  public createDocument(doc: Omit<DocumentRecord, 'id' | 'created_at' | 'updated_at'>): DocumentRecord {
    const id = 'doc-' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const newDoc: DocumentRecord = {
      ...withStorageLocation(doc),
      id,
      created_at: now,
      updated_at: now,
      revision: 1,
    };
    newDoc.deadline_status = calculateDocumentDeadline(newDoc);
    this.documents.set(id, newDoc);

    // If new document has a handler assigned or directive, create a notification
    if (newDoc.handler || newDoc.directive) {
      this.addNotification({
        title: `Phân công văn bản: ${newDoc.document_number}`,
        message: newDoc.directive
          ? `Ý kiến chỉ đạo: "${newDoc.directive}"${newDoc.due_date ? ` (Hạn xử lý: ${newDoc.due_date})` : ''}`
          : `Bạn được phân công xử lý văn bản "${newDoc.title}"`,
        type: newDoc.directive ? 'directive' : 'document',
        target_id: newDoc.id,
        target_type: 'document',
        recipient: newDoc.handler || 'Người xử lý',
        directive: newDoc.directive,
        due_date: newDoc.due_date,
      });
    }
    return newDoc;
  }

  public updateDocument(id: string, partial: Partial<DocumentRecord>): DocumentRecord | null {
    const doc = this.documents.get(id);
    if (!doc) return null;
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const updated: DocumentRecord = withStorageLocation({ ...doc, ...partial, updated_at: now, revision: (doc.revision ?? 0) + 1 });
    updated.deadline_status = calculateDocumentDeadline(updated);
    this.documents.set(id, updated);

    // If directive or handler was updated/added, trigger notification
    const directiveChanged = partial.directive !== undefined && partial.directive !== doc.directive && Boolean(partial.directive);
    const handlerChanged = partial.handler !== undefined && partial.handler !== doc.handler && Boolean(partial.handler);

    if (directiveChanged || handlerChanged) {
      const recipient = updated.handler || 'Người xử lý';
      const dirText = updated.directive ? `Ý kiến chỉ đạo: "${updated.directive}". ` : '';
      const dueText = updated.due_date ? `Hạn xử lý: ${updated.due_date}.` : '';
      this.addNotification({
        title: directiveChanged ? `Chỉ đạo mới: ${updated.document_number}` : `Giao xử lý: ${updated.document_number}`,
        message: `${dirText}${dueText} Tiêu đề: ${updated.title}`,
        type: 'directive',
        target_id: updated.id,
        target_type: 'document',
        recipient,
        directive: updated.directive,
        due_date: updated.due_date,
      });
    }
    return updated;
  }

  public deleteDocument(id: string): boolean {
    const deleted = this.documents.delete(id);
    return deleted;
  }

  /**
   * Writes import rows. The caller (preview) decided per row: `update` (a live record's id) or `create`.
   * Rows are never matched by number here, so preview and commit cannot disagree; a given id that is
   * not a live record is never written. Columns beyond the known fields are kept on create and update.
   */
  public bulkUpsertDocuments(docsList: Array<ImportWrite | Partial<DocumentRecord>>): { added: number; updated: number; total: number; changes: Array<{ id: string; before: DocumentRecord | null; after: DocumentRecord }> } {
    let added = 0;
    let updated = 0;
    const changes: Array<{ id: string; before: DocumentRecord | null; after: DocumentRecord }> = [];
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

    for (const raw of docsList) {
      const { action, id: targetId, data } = asImportWrite(raw);
      const item = data as Partial<DocumentRecord>;
      let existing: DocumentRecord | undefined;
      if (action === 'update') {
        existing = targetId ? this.documents.get(targetId) : undefined;
        if (!existing || existing.deleted_at) throw new RevisionConflictError();
      } else if (!item.document_number) continue;

      if (existing) {
        const merged: DocumentRecord = withStorageLocation({
          ...existing,
          ...item,
          id: existing.id,
          updated_at: now,
          revision: (existing.revision ?? 0) + 1,
        });
        merged.deadline_status = calculateDocumentDeadline(merged);
        this.documents.set(existing.id, merged);
        changes.push({ id: existing.id, before: existing, after: merged });
        updated++;
      } else {
        let id = 'doc-' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
        while (this.documents.has(id)) id = 'doc-' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
        const newRecord: DocumentRecord = {
          ...(item as any),
          id,
          document_number: item.document_number || `CV-${vietnamToday().slice(0, 4)}-${String(this.documents.size + 1).padStart(4, '0')}`,
          title: item.title || 'Văn bản mới',
          doc_type: item.doc_type || 'incoming',
          doc_category: item.doc_category || 'CV',
          issuer: item.issuer || '',
          recipient: item.recipient || '',
          signer: item.signer || '',
          department: item.department || '',
          handler: item.handler || '',
          issue_date: item.issue_date || new Date().toISOString().substring(0, 10),
          received_date: item.received_date || null,
          due_date: item.due_date || null,
          urgency_level: item.urgency_level || 'Thường',
          security_level: item.security_level || 'Thường',
          status: item.status || 'Chờ tiếp nhận',
          directive: item.directive || null,
          storage_location: item.storage_location || 'Lưu kho văn phòng',
          notes: item.notes || null,
          summary: item.summary || null,
          tags: item.tags || null,
          file_key: item.file_key || null,
          file_name: item.file_name || null,
          file_size: item.file_size || null,
          file_type: item.file_type || null,
          created_at: now,
          updated_at: now,
          revision: 1,
        };
        delete (newRecord as any).deleted_at;
        delete (newRecord as any).deleted_by;
        newRecord.deadline_status = calculateDocumentDeadline(newRecord);
        this.documents.set(id, newRecord);
        changes.push({ id, before: null, after: newRecord });
        added++;
      }
    }
    return { added, updated, total: this.getDocuments().length, changes };
  }

  public getNextDocumentNumber(type: 'incoming' | 'outgoing', categoryCode = 'CV', deptCode = 'HCNS'): string {
    // The numbering year is the year in Vietnam (UTC+7), not the server's
    const year = Number(vietnamToday().slice(0, 4));
    // Trashed documents keep their numbers: they are never re-issued
    const docs = Array.from(this.documents.values());
    if (type === 'incoming') {
      const prefix = `ĐẾN-${year}-`;
      const nums = docs
        .filter(d => d.document_number.startsWith(prefix))
        .map(d => parseInt(d.document_number.replace(prefix, ''), 10))
        .filter(n => !isNaN(n));
      const maxNum = nums.length > 0 ? Math.max(...nums) : 0;
      return `${prefix}${String(maxNum + 1).padStart(4, '0')}`;
    } else {
      const outgoingPattern = new RegExp(`^(\\d{4})/${year}`);
      const nums = docs
        .map(d => {
          const m = d.document_number.match(outgoingPattern);
          return m ? parseInt(m[1], 10) : 0;
        })
        .filter(n => n > 0);
      const maxNum = nums.length > 0 ? Math.max(...nums) : 0;
      return `${String(maxNum + 1).padStart(4, '0')}/${year}/${categoryCode}-${deptCode}`;
    }
  }

  // Contract operations
  public getContracts(urgencyFilter?: string): ContractRecord[] {
    const contracts = Array.from(this.contracts.values()).filter((c) => !c.deleted_at).map(c => ({
      ...c,
      urgency: calculateUrgency(c.end_date, c.status),
    }));

    if (urgencyFilter && urgencyFilter !== 'all') {
      if (urgencyFilter === 'urgent') {
        return contracts.filter(c => c.urgency?.level === 'urgent');
      }
      if (urgencyFilter === 'warning') {
        return contracts.filter(c => c.urgency?.level === 'warning');
      }
      if (urgencyFilter === 'expiring_soon') {
        return contracts.filter(c => ['urgent', 'warning', 'notice'].includes(c.urgency?.level || ''));
      }
      if (urgencyFilter === 'active') {
        return contracts.filter(c => c.urgency?.level === 'active');
      }
      if (urgencyFilter === 'expired') {
        return contracts.filter(c => c.urgency?.level === 'expired');
      }
      if (urgencyFilter === 'liquidated') {
        return contracts.filter(c => c.status === 'liquidated');
      }
      if (urgencyFilter === 'indefinite') {
        return contracts.filter(c => c.urgency?.level === 'indefinite');
      }
    }

    // Sort: Urgent & Expired first, then by end_date
    return contracts.sort((a, b) => {
      if (a.status === 'liquidated' && b.status !== 'liquidated') return 1;
      if (b.status === 'liquidated' && a.status !== 'liquidated') return -1;
      const daysA = a.urgency?.daysRemaining ?? 99999;
      const daysB = b.urgency?.daysRemaining ?? 99999;
      return daysA - daysB;
    });
  }

  public getContract(id: string, options: { includeDeleted?: boolean } = {}): ContractRecord | null {
    const c = this.contracts.get(id);
    if (!c || (c.deleted_at && !options.includeDeleted)) return null;
    return {
      ...c,
      urgency: calculateUrgency(c.end_date, c.status),
    };
  }

  public createContract(contract: Omit<ContractRecord, 'id' | 'created_at' | 'updated_at'>): ContractRecord {
    const id = 'con-' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const newContract: ContractRecord = {
      ...withStorageLocation(contract),
      id,
      created_at: now,
      updated_at: now,
      revision: 1,
    };
    newContract.urgency = calculateUrgency(newContract.end_date, newContract.status);
    this.contracts.set(id, newContract);
    return newContract;
  }

  public updateContract(id: string, partial: Partial<ContractRecord>): ContractRecord | null {
    const contract = this.contracts.get(id);
    if (!contract) return null;
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const updated: ContractRecord = withStorageLocation({ ...contract, ...partial, updated_at: now, revision: (contract.revision ?? 0) + 1 });
    updated.urgency = calculateUrgency(updated.end_date, updated.status);
    this.contracts.set(id, updated);
    return updated;
  }

  public liquidateContract(id: string): ContractRecord | null {
    return this.updateContract(id, { status: 'liquidated' });
  }

  public deleteContract(id: string): boolean {
    const deleted = this.contracts.delete(id);
    return deleted;
  }

  public bulkUpsertContracts(contractsList: Array<ImportWrite | Partial<ContractRecord>>): { added: number; updated: number; total: number; changes: Array<{ id: string; before: ContractRecord | null; after: ContractRecord }> } {
    let added = 0;
    let updated = 0;
    const changes: Array<{ id: string; before: ContractRecord | null; after: ContractRecord }> = [];
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

    for (const raw of contractsList) {
      const { action, id: targetId, data } = asImportWrite(raw);
      const item = data as Partial<ContractRecord>;
      let existing: ContractRecord | undefined;
      if (action === 'update') {
        existing = targetId ? this.contracts.get(targetId) : undefined;
        if (!existing || existing.deleted_at) throw new RevisionConflictError();
      } else if (!item.contract_number) continue;

      if (existing) {
        // Update existing contract
        const merged: ContractRecord = withStorageLocation({
          ...existing,
          ...item,
          id: existing.id,
          updated_at: now,
          revision: (existing.revision ?? 0) + 1,
        });
        merged.urgency = calculateUrgency(merged.end_date, merged.status);
        this.contracts.set(existing.id, merged);
        changes.push({ id: existing.id, before: existing, after: merged });
        updated++;
      } else {
        // Create new contract
        let id = 'con-' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
        while (this.contracts.has(id)) id = 'con-' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
        const newRecord: ContractRecord = {
          contract_number: item.contract_number || `HĐ-${vietnamToday().slice(0, 4)}-${String(this.contracts.size + 1).padStart(4, '0')}`,
          title: item.title || 'Hợp đồng mới',
          contract_type: item.contract_type || 'service',
          contract_category: item.contract_category || 'Dịch vụ',
          party_a: item.party_a || 'Công ty Cổ phần đầu tư quốc tế Sambo Gold - SGII',
          party_b: item.party_b || 'Đối tác',
          partner_code: item.partner_code || null,
          partner_tax_id: item.partner_tax_id || null,
          partner_contact: item.partner_contact || null,
          department: item.department || 'HCNS',
          value: Number(item.value) || 0,
          currency: item.currency || 'VND',
          signed_date: item.signed_date || now.substring(0, 10),
          start_date: item.start_date || now.substring(0, 10),
          end_date: item.end_date || null,
          status: item.status || 'active',
          renewal_terms: item.renewal_terms || null,
          notes: item.notes || null,
          storage_location: item.storage_location || null,
          file_key: item.file_key || null,
          file_name: item.file_name || null,
          file_size: item.file_size || null,
          file_type: item.file_type || null,
          created_at: now,
          updated_at: now,
          ...item,
          id,
          revision: 1,
        };
        delete (newRecord as any).deleted_at;
        delete (newRecord as any).deleted_by;
        newRecord.urgency = calculateUrgency(newRecord.end_date, newRecord.status);
        this.contracts.set(id, newRecord);
        changes.push({ id, before: null, after: newRecord });
        added++;
      }
    }
    return { added, updated, total: this.getContracts().length, changes };
  }

  // ---------------------------------------------------------------------------
  // Trash (soft delete). Records keep their row with deleted_at set; every getter hides them.
  // ---------------------------------------------------------------------------

  private trashMap(type: TrashRecordType): Map<string, any> {
    return type === 'document' ? this.documents : type === 'contract' ? this.contracts : this.partners;
  }

  public trashRecord(type: TrashRecordType, id: string, userId: string): any | null {
    const map = this.trashMap(type);
    const rec = map.get(id);
    if (!rec || rec.deleted_at) return null;
    const now = new Date().toISOString();
    const updated = { ...rec, deleted_at: now, deleted_by: userId, revision: (rec.revision ?? 0) + 1 };
    map.set(id, updated);
    return updated;
  }

  public restoreRecord(type: TrashRecordType, id: string): any | null {
    const map = this.trashMap(type);
    const rec = map.get(id);
    if (!rec || !rec.deleted_at) return null;
    const updated = { ...rec, deleted_at: null, deleted_by: null, revision: (rec.revision ?? 0) + 1 };
    if (type === 'partner') updated.code_key = partnerCodeKey(updated.code); // a clash fails in D1 (409)
    map.set(id, updated);
    return updated;
  }

  /** Permanently removes a trashed record and its attachment rows; returns the file keys it held. */
  public purgeRecord(type: TrashRecordType, id: string): string[] | null {
    const map = this.trashMap(type);
    const rec = map.get(id);
    if (!rec || !rec.deleted_at) return null;
    map.delete(id);
    const keys = new Set<string>();
    if (rec.file_key) keys.add(rec.file_key);
    if (type !== 'partner') {
      for (const a of [...this.attachments.values()]) {
        if (a.record_type === type && a.record_id === id) {
          keys.add(a.file_key);
          this.attachments.delete(a.id);
        }
      }
    }
    return [...keys];
  }

  public getTrash(): { documents: DocumentRecord[]; contracts: ContractRecord[]; partners: PartnerRecord[] } {
    const byDeleted = (a: any, b: any) => String(b.deleted_at).localeCompare(String(a.deleted_at));
    return {
      documents: Array.from(this.documents.values()).filter((d) => d.deleted_at).sort(byDeleted),
      contracts: Array.from(this.contracts.values()).filter((c) => c.deleted_at).sort(byDeleted),
      partners: Array.from(this.partners.values()).filter((p) => p.deleted_at).sort(byDeleted),
    };
  }

  // ---------------------------------------------------------------------------
  // Edit history (record_history), written in the same transaction as the change
  // ---------------------------------------------------------------------------

  public recordHistory(entry: {
    record_type: string;
    record_id: string;
    action: string;
    user: { id: string; name?: string | null; username?: string | null };
    before?: Record<string, any> | null;
    after?: Record<string, any> | null;
    revision?: number | null;
  }): HistoryEntry {
    const changes = diffRecords(entry.before ?? null, entry.after ?? null);
    const row: HistoryEntry = {
      id: `hist_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      record_type: entry.record_type,
      record_id: entry.record_id,
      revision: entry.revision ?? entry.after?.revision ?? null,
      action: entry.action,
      changed_by: entry.user.id,
      changed_by_name: entry.user.name || entry.user.username || null,
      changed_at: new Date().toISOString(),
      changes: Object.keys(changes).length > 0 ? changes : null,
    };
    this.pendingHistory.push(row);
    return row;
  }

  // ---------------------------------------------------------------------------
  // Attachments (multiple files per record, with versions)
  // ---------------------------------------------------------------------------

  public getAttachments(
    type: AttachmentRecordType,
    recordId: string,
    options: { includeVersions?: boolean; includeDeleted?: boolean } = {}
  ): AttachmentRecord[] {
    return Array.from(this.attachments.values())
      .filter(
        (a) =>
          a.record_type === type &&
          a.record_id === recordId &&
          (options.includeDeleted || !a.deleted_at) &&
          (options.includeVersions || a.is_current)
      )
      .sort((a, b) => a.uploaded_at.localeCompare(b.uploaded_at) || a.version - b.version);
  }

  public getAttachment(id: string): AttachmentRecord | null {
    const a = this.attachments.get(id);
    return a ? { ...a } : null;
  }

  public getAllAttachments(): AttachmentRecord[] {
    return Array.from(this.attachments.values()).map((a) => ({ ...a }));
  }

  /** Adds a file to a record; with `replaces` it becomes the next version of that attachment. */
  public addAttachment(input: Omit<AttachmentRecord, 'id' | 'series_id' | 'version' | 'is_current' | 'uploaded_at'> & { replaces?: string | null; id?: string }): AttachmentRecord {
    const { replaces, id: fixedId, ...fields } = input;
    const previous = replaces ? this.attachments.get(replaces) : undefined;
    const id = fixedId || `att_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    let version = 1;
    let seriesId = id;
    if (previous) {
      seriesId = previous.series_id;
      const series = Array.from(this.attachments.values()).filter((a) => a.series_id === seriesId);
      version = Math.max(...series.map((a) => a.version)) + 1;
      for (const a of series) if (a.is_current) this.attachments.set(a.id, { ...a, is_current: false, revision: (a.revision ?? 0) + 1 });
    }
    const record: AttachmentRecord = { ...fields, id, series_id: seriesId, version, is_current: true, uploaded_at: new Date().toISOString(), revision: 1 };
    this.attachments.set(id, record);
    return { ...record };
  }

  public softDeleteAttachment(id: string, userId: string): AttachmentRecord | null {
    const a = this.attachments.get(id);
    if (!a || a.deleted_at) return null;
    const now = new Date().toISOString();
    // Removing an attachment removes the whole series (all its versions)
    for (const v of this.attachments.values()) {
      if (v.series_id === a.series_id && !v.deleted_at) this.attachments.set(v.id, { ...v, deleted_at: now, deleted_by: userId, revision: (v.revision ?? 0) + 1 });
    }
    return { ...this.attachments.get(id)! };
  }

  // Partner operations (Full CRUD)
  public getPartners(): PartnerRecord[] {
    return Array.from(this.partners.values()).filter((p) => !p.deleted_at);
  }

  public getPartner(id: string, options: { includeDeleted?: boolean } = {}): PartnerRecord | null {
    const p = this.partners.get(id);
    if (!p || (p.deleted_at && !options.includeDeleted)) return null;
    return p;
  }

  public createPartner(partner: Omit<PartnerRecord, 'id'>): PartnerRecord {
    // Random suffix: ids never collide between workers; a clash on the code itself is reported as
    // PARTNER_CODE_TAKEN by the database (migration 0010)
    const slug = partner.code ? partner.code.toLowerCase().replace(/[^a-z0-9]/g, '') : 'x';
    let id = `partner-${slug}-${Math.random().toString(36).slice(2, 8)}`;
    while (this.partners.has(id)) id = `partner-${slug}-${Math.random().toString(36).slice(2, 8)}`;
    const newPartner: PartnerRecord = {
      ...partner,
      id,
      contract_count: partner.contract_count ?? 0,
      active_contract_count: partner.active_contract_count ?? 0,
      is_locked: partner.is_locked ?? false,
      revision: 1,
    };
    newPartner.code_key = this.keyFor(newPartner);
    this.partners.set(id, newPartner);
    return newPartner;
  }

  public updatePartner(id: string, partial: Partial<PartnerRecord>): PartnerRecord | null {
    const p = this.partners.get(id);
    if (!p) return null;
    const updated: PartnerRecord = { ...p, ...partial, revision: (p.revision ?? 0) + 1 };
    updated.code_key = this.keyFor(updated);
    this.partners.set(id, updated);
    return updated;
  }

  public deletePartner(id: string): boolean {
    const deleted = this.partners.delete(id);
    return deleted;
  }

  public togglePartnerLock(id: string): PartnerRecord | null {
    const p = this.partners.get(id);
    if (!p) return null;
    return this.updatePartner(id, { is_locked: !p.is_locked });
  }

  // Category & Settings operations
  public getCategories() {
    return this.categories;
  }

  public updateCategories(categories: any) {
    this.categories = categories;
    return this.categories;
  }

  public addCategoryItem(categoryType: string, item: any) {
    if (!this.categories[categoryType]) {
      this.categories[categoryType] = [];
    }
    this.categories[categoryType].push(item);
    return this.categories[categoryType];
  }

  public updateCategoryItem(categoryType: string, index: number, item: any) {
    if (this.categories[categoryType] && this.categories[categoryType][index] !== undefined) {
      this.categories[categoryType][index] = item;
      return this.categories[categoryType][index];
    }
    return null;
  }

  public deleteCategoryItem(categoryType: string, index: number) {
    if (this.categories[categoryType] && this.categories[categoryType][index] !== undefined) {
      this.categories[categoryType].splice(index, 1);
      return true;
    }
    return false;
  }

  public getSettings(): SystemSettings {
    return this.settings;
  }

  public updateSettings(partial: Partial<SystemSettings>): SystemSettings {
    this.settings = { ...this.settings, ...partial };
    return this.settings;
  }

  // Notification methods. Each notification belongs to one account (recipient_user_id); ones whose
  // recipient could not be matched to an account are visible to admins only.
  public getNotifications(): NotificationRecord[] {
    return [...this.notifications].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  public getNotificationsForUser(user: { id: string; role?: string | null }): NotificationRecord[] {
    return this.getNotifications().filter(
      (n) => n.recipient_user_id === user.id || (user.role === 'admin' && !n.recipient_user_id)
    );
  }

  /** Active accounts whose username, full name or email equals `name` (case/diacritic-insensitive). */
  public findUsersByName(name?: string | null): UserAccount[] {
    const target = normalizeVietnamese(String(name || '').trim());
    if (!target) return [];
    return Array.from(this.users.values())
      .filter((u) => u.status === 'active' && [u.username, u.name, u.email].some((v) => normalizeVietnamese(String(v || '').trim()) === target))
      .map((u) => ({ ...u }));
  }

  /** The single account a handler name refers to; null when none or several match (never guess). */
  public resolveUserByName(name?: string | null): UserAccount | null {
    const matches = this.findUsersByName(name);
    return matches.length === 1 ? matches[0] : null;
  }

  public setNotificationRecipient(id: string, userId: string): boolean {
    const n = this.notifications.find((x) => x.id === id);
    if (!n || n.recipient_user_id) return false;
    n.recipient_user_id = userId;
    return true;
  }

  public addNotification(notif: Omit<NotificationRecord, 'id' | 'read' | 'created_at'>): NotificationRecord {
    const id = 'notif-' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    const now = new Date().toISOString();
    const recipientUser = notif.recipient_user_id ? this.users.get(notif.recipient_user_id) : this.resolveUserByName(notif.recipient);
    const newNotif: NotificationRecord = {
      ...notif,
      recipient_user_id: recipientUser?.id ?? null,
      recipient_email: notif.recipient_email ?? recipientUser?.email ?? null,
      id,
      read: false,
      created_at: now,
    };

    this.notifications.unshift(newNotif);
    // Keep max 500 recent notifications
    if (this.notifications.length > 500) {
      this.notifications = this.notifications.slice(0, 500);
    }
    return newNotif;
  }

  public markNotificationAsRead(id: string, user?: { id: string; role?: string | null }): boolean {
    const visible = user ? this.getNotificationsForUser(user) : this.notifications;
    const notif = visible.find((n) => n.id === id);
    if (!notif) return false;
    const stored = this.notifications.find((n) => n.id === id)!;
    stored.read = true;
    return true;
  }

  public markAllNotificationsAsRead(user?: { id: string; role?: string | null }): boolean {
    const ids = new Set((user ? this.getNotificationsForUser(user) : this.notifications).map((n) => n.id));
    for (const notif of this.notifications) {
      if (ids.has(notif.id)) notif.read = true;
    }
    return true;
  }

  // Global Spotlight Search (Multi-criteria instant search)
  public searchAll(query: string): { documents: DocumentRecord[]; contracts: ContractRecord[] } {
    const qNorm = normalizeVietnamese(query.trim());
    if (!qNorm) {
      return { documents: this.getDocuments().slice(0, 5), contracts: this.getContracts().slice(0, 5) };
    }

    const docs = this.getDocuments().filter(d => {
      const matchNumber = normalizeVietnamese(d.document_number).includes(qNorm);
      const matchOrigNumber = normalizeVietnamese(d.original_doc_number || '').includes(qNorm);
      const matchTitle = normalizeVietnamese(d.title).includes(qNorm);
      const matchSummary = normalizeVietnamese(d.summary || '').includes(qNorm);
      const matchIssuer = normalizeVietnamese(d.issuer || '').includes(qNorm);
      const matchRecipient = normalizeVietnamese(d.recipient || '').includes(qNorm);
      const matchDepartment = normalizeVietnamese(d.department || '').includes(qNorm);
      const matchHandler = normalizeVietnamese(d.handler || '').includes(qNorm);
      const matchSigner = normalizeVietnamese(d.signer || '').includes(qNorm);
      const matchDirective = normalizeVietnamese(d.directive || '').includes(qNorm);
      const matchLinked = normalizeVietnamese(d.linked_doc_number || '').includes(qNorm);
      const matchTags = normalizeVietnamese(d.tags || '').includes(qNorm);
      return (
        matchNumber ||
        matchOrigNumber ||
        matchTitle ||
        matchSummary ||
        matchIssuer ||
        matchRecipient ||
        matchDepartment ||
        matchHandler ||
        matchSigner ||
        matchDirective ||
        matchLinked ||
        matchTags
      );
    });

    const contracts = this.getContracts().filter(c => {
      const matchNumber = normalizeVietnamese(c.contract_number).includes(qNorm);
      const matchOrigNumber = normalizeVietnamese(c.original_contract_number || '').includes(qNorm);
      const matchTitle = normalizeVietnamese(c.title).includes(qNorm);
      const matchTitleEn = normalizeVietnamese(c.title_en || '').includes(qNorm);
      const matchPartnerCode = normalizeVietnamese(c.partner_code || '').includes(qNorm);
      const matchPartyA = normalizeVietnamese(c.party_a).includes(qNorm);
      const matchPartyB = normalizeVietnamese(c.party_b).includes(qNorm);
      const matchDepartment = normalizeVietnamese(c.department || '').includes(qNorm);
      const matchRenewal = normalizeVietnamese(c.renewal_terms || '').includes(qNorm);
      const matchPartnerContact = normalizeVietnamese(c.partner_contact || '').includes(qNorm);
      return (
        matchNumber ||
        matchOrigNumber ||
        matchTitle ||
        matchTitleEn ||
        matchPartnerCode ||
        matchPartyA ||
        matchPartyB ||
        matchDepartment ||
        matchRenewal ||
        matchPartnerContact
      );
    });

    const partners = this.getPartners().filter(p => {
      const matchCode = normalizeVietnamese(p.code || '').includes(qNorm);
      const matchNameVn = normalizeVietnamese(p.name_vn || '').includes(qNorm);
      const matchNameEn = normalizeVietnamese(p.name_en || '').includes(qNorm);
      const matchTax = normalizeVietnamese(p.tax_id || '').includes(qNorm);
      const matchContact = normalizeVietnamese(p.contact_person || p.contact || '').includes(qNorm);
      const matchRep = normalizeVietnamese(p.representative || '').includes(qNorm);
      return matchCode || matchNameVn || matchNameEn || matchTax || matchContact || matchRep;
    });

    return { documents: docs, contracts, partners } as any;
  }

  // Detailed Stats matching Excel Dashboard
  public getStats(user?: AccessSubject | null) {
    // Without a user (internal callers) everything counts; with one, only what that user may read
    const allContracts = this.getContracts().filter((c) => !user || canReadContract(user, c));
    const contracts = allContracts.filter(c => !isLaborContract(c));
    const laborContracts = allContracts.filter(c => isLaborContract(c));

    const urgentCount = contracts.filter(c => c.urgency?.level === 'urgent').length;
    const warningCount = contracts.filter(c => c.urgency?.level === 'warning').length;
    const noticeCount = contracts.filter(c => c.urgency?.level === 'notice').length;
    const expiredCount = contracts.filter(c => c.urgency?.level === 'expired').length;
    const activeCount = contracts.filter(c => c.urgency?.level === 'active').length;
    const liquidatedCount = contracts.filter(c => c.status === 'liquidated').length;
    const indefiniteCount = contracts.filter(c => c.urgency?.level === 'indefinite').length;

    const totalLaborContracts = laborContracts.length;
    const laborUrgentCount = laborContracts.filter(c => c.urgency?.level === 'urgent').length;
    const laborWarningCount = laborContracts.filter(c => c.urgency?.level === 'warning' || c.urgency?.level === 'notice').length;
    const laborExpiredCount = laborContracts.filter(c => c.urgency?.level === 'expired').length;
    const laborActiveCount = laborContracts.filter(c => c.urgency?.level === 'active').length;
    const laborLiquidatedCount = laborContracts.filter(c => c.status === 'liquidated').length;
    const laborIndefiniteCount = laborContracts.filter(c => c.urgency?.level === 'indefinite').length;

    // Values in different currencies are never added up as-is (see contractValueTotals)
    const valueTotals = contractValueTotals(contracts);

    const docs = this.getDocuments().filter((d) => !user || canReadDocument(user, d));
    const incomingDocs = docs.filter(d => d.doc_type === 'incoming');
    const outgoingDocs = docs.filter(d => d.doc_type === 'outgoing');
    const internalDocs = docs.filter(d => d.doc_type === 'internal' || d.doc_type === 'decision');

    const incomingCompleted = incomingDocs.filter(d => d.status === 'Hoàn thành' || d.completed_date).length;
    const incomingOverdue = incomingDocs.filter(d => d.deadline_status?.level === 'overdue').length;
    const incomingExpiringSoon = incomingDocs.filter(d => d.deadline_status?.level === 'urgent').length;
    const incomingProcessing = incomingDocs.filter(
      d => ['processing', 'urgent', 'warning'].includes(d.deadline_status?.level || '') && d.status !== 'Hoàn thành'
    ).length;
    const incomingUnassigned = incomingDocs.filter(d => d.status === 'Chưa phân công').length;

    const completedOnTime = incomingDocs.filter(d => d.deadline_status?.level === 'completed').length;
    const onTimeRate = incomingCompleted > 0 ? Math.round((completedOnTime / incomingCompleted) * 100) : 100;

    return {
      totalDocuments: docs.length,
      totalIncoming: incomingDocs.length,
      totalOutgoing: outgoingDocs.length,
      totalInternal: internalDocs.length,
      incomingProcessing,
      incomingOverdue,
      incomingExpiringSoon,
      incomingCompleted,
      incomingUnassigned,
      onTimeRate,
      totalContracts: contracts.length,
      totalPartners: this.getPartners().length,
      urgentCount,
      warningCount,
      noticeCount,
      expiredCount,
      activeCount,
      liquidatedCount,
      indefiniteCount,
      urgentContracts: urgentCount,
      warningContracts: warningCount + noticeCount,
      expiredContracts: expiredCount,
      activeContracts: activeCount,
      liquidatedContracts: liquidatedCount,
      indefiniteContracts: indefiniteCount,
      totalLaborContracts,
      laborUrgentCount,
      laborWarningCount,
      laborExpiredCount,
      laborActiveCount,
      laborLiquidatedCount,
      laborIndefiniteCount,
      totalContractValue: valueTotals.totalContractValue,
      valueByCurrency: valueTotals.valueByCurrency,
      reportCurrency: valueTotals.reportCurrency,
      missingExchangeRates: valueTotals.missingExchangeRates,
    };
  }

  // User Management
  public getUsers(): UserAccount[] {
    return Array.from(this.users.values()).map(u => {
      const { password, token_version, ...safeUser } = u;
      return safeUser as UserAccount;
    });
  }

  public getUser(id: string): UserAccount | null {
    const user = this.users.get(id);
    if (!user) return null;
    return { ...user };
  }

  public getUserByUsername(username: string): UserAccount | null {
    for (const u of this.users.values()) {
      if (u.username.toLowerCase() === username.trim().toLowerCase()) {
        return { ...u };
      }
    }
    return null;
  }

  public createUser(user: Omit<UserAccount, 'id' | 'status' | 'created_at' | 'updated_at'> & { status?: 'active' | 'locked' }): UserAccount {
    const id = `usr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();
    const newUser: UserAccount = {
      id,
      username: user.username.trim(),
      password: user.password,
      must_change_password: user.must_change_password,
      name: user.name.trim(),
      email: user.email.trim(),
      role: user.role || 'user',
      status: user.status || 'active',
      department: user.department || '',
      preferred_language: user.preferred_language || 'vi',
      can_access_labor_contracts: user.role === 'admin' ? true : Boolean(user.can_access_labor_contracts),
      can_access_confidential_documents: user.role === 'admin' ? true : Boolean(user.can_access_confidential_documents),
      created_at: now,
      updated_at: now,
      revision: 1,
    };
    this.users.set(id, newUser);
    return { ...newUser };
  }

  public updateUser(id: string, updates: Partial<UserAccount>): UserAccount | null {
    const existing = this.users.get(id);
    if (!existing) return null;

    const updated: UserAccount = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
      // the revision the client will see is the one committed (migration 0009)
      revision: (existing.revision ?? 0) + 1,
    };
    this.users.set(id, updated);
    return { ...updated };
  }

  public deleteUser(id: string): boolean {
    const existing = this.users.get(id);
    if (!existing || existing.username === 'admin') {
      return false; // Cannot delete root admin
    }
    const deleted = this.users.delete(id);
    return deleted;
  }

  // Audit Logs
  public recordAuditLog(log: Omit<AuditLogRecord, 'id' | 'timestamp'> & { timestamp?: string }): AuditLogRecord {
    const record: AuditLogRecord = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: log.timestamp || new Date().toISOString(),
      ...log,
    };
    this.auditLogs.unshift(record);
    // Only the newest entries are cached; all of them are persisted
    if (this.auditLogs.length > AUDIT_CACHE_SIZE) {
      this.auditLogs = this.auditLogs.slice(0, AUDIT_CACHE_SIZE);
    }
    return record;
  }

  public getAuditLogs(limit = 100): AuditLogRecord[] {
    return this.auditLogs.slice(0, limit);
  }

  // Currencies
  public getCurrencies(): CurrencyItem[] {
    return [...this.currencies];
  }

  public setCurrencies(currencies: CurrencyItem[]): CurrencyItem[] {
    this.currencies = [...currencies];
    return this.currencies;
  }

  public addCurrency(currency: CurrencyItem): CurrencyItem[] {
    const existingIdx = this.currencies.findIndex(c => c.code.toUpperCase() === currency.code.toUpperCase());
    if (existingIdx >= 0) {
      this.currencies[existingIdx] = { ...this.currencies[existingIdx], ...currency };
    } else {
      this.currencies.push(currency);
    }
    return this.currencies;
  }

  public updateCurrency(code: string, updates: Partial<CurrencyItem>): CurrencyItem | null {
    const idx = this.currencies.findIndex(c => c.code.toUpperCase() === code.toUpperCase());
    if (idx < 0) return null;
    this.currencies[idx] = { ...this.currencies[idx], ...updates };
    return this.currencies[idx];
  }
}

/** D1 refused the write because the maintenance write fence is installed (definite: nothing was written). */
export class WriteFencedError extends Error {
  constructor() {
    super('Writes are fenced for maintenance');
    this.name = 'WriteFencedError';
  }
}

/** The commit's outcome is unknown (timeout, network): the write may or may not be in D1. */
export class CommitOutcomeUnknownError extends Error {
  constructor(public cause: unknown) {
    super(`D1 commit outcome unknown: ${String((cause as Error)?.message || cause)}`);
    this.name = 'CommitOutcomeUnknownError';
  }
}

/** The isolate's committed cache. Read-only requests read it; writing requests fork it. */
export const sharedStore = new MemoryStore();
const requestScope = new AsyncLocalStorage<MemoryStore>();
let writeQueue: Promise<unknown> = Promise.resolve();
const READ_ONLY_CHECK = typeof process !== 'undefined' && Boolean(process.env?.VITEST);

/**
 * Runs one API request against the cache.
 * - Read-only requests use the committed shared cache directly.
 * - Writing requests run one at a time per isolate, each on a private fork. At the end the fork's
 *   changes are committed in one D1 batch; only then does the fork become the shared cache. A request
 *   that fails (or answers 4xx/5xx) never leaks a half-applied change into the shared cache.
 */
export async function runRequest<T>(
  db: SqlDatabase,
  legacySource: LegacySource,
  writes: boolean,
  handler: () => Promise<T>,
  shouldCommit: () => boolean
): Promise<T> {
  if (!writes) {
    await sharedStore.sync(db, legacySource);
    const result = await requestScope.run(sharedStore, handler);
    // Read-only requests must not change the cache (a change here would be committed by someone else)
    if (READ_ONLY_CHECK && sharedStore.hasPendingChanges()) throw new Error('A read-only request changed the shared cache');
    return result;
  }
  const run = writeQueue.then(async () => {
    await sharedStore.sync(db, legacySource);
    const draft = sharedStore.fork();
    let result: T;
    try {
      result = await requestScope.run(draft, handler);
      if (shouldCommit() && !draft.isStale) await requestScope.run(draft, () => draft.flush(db));
    } catch (err) {
      // Committed part (if any) is in D1; the rest is discarded. Reload rather than guess.
      sharedStore.invalidate();
      throw err;
    }
    if (draft.isStale || draft.hasPendingChanges()) sharedStore.invalidate();
    else sharedStore.adopt(draft);
    return result;
  });
  writeQueue = run.catch(() => {});
  return run;
}

/** The cache of the current request (its fork when writing), or the shared cache outside requests. */
export function currentStore(): MemoryStore {
  return requestScope.getStore() ?? sharedStore;
}

// `store` keeps its familiar API: every call goes to the cache of the request that is running *at call
// time* (its fork when writing). Test spies installed on `store` (own properties of the shared
// instance) apply to whichever cache the request uses.
const callWrappers = new Map<PropertyKey, (...args: any[]) => any>();
export const store: MemoryStore = new Proxy(sharedStore, {
  get(target, prop) {
    const own = Object.prototype.hasOwnProperty.call(target, prop) ? (target as any)[prop] : undefined;
    const proto = (MemoryStore.prototype as any)[prop];
    if (typeof own === 'function' || (typeof proto === 'function' && prop !== 'constructor')) {
      if (typeof own === 'function') return (...args: any[]) => own.apply(currentStore(), args);
      let w = callWrappers.get(prop);
      if (!w) {
        w = (...args: any[]) => proto.apply(currentStore(), args);
        callWrappers.set(prop, w);
      }
      return w;
    }
    const cur: any = currentStore();
    const value = cur[prop];
    return typeof value === 'function' ? value.bind(cur) : value;
  },
  set(_target, prop, value) {
    (currentStore() as any)[prop] = value;
    return true;
  },
});
