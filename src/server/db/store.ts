import { type DocumentRecord, type ContractRecord, type PartnerRecord, type NotificationRecord, type UserAccount, type AuditLogRecord, type CurrencyItem, isLaborContract } from '../types.ts';
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
  rowFingerprint,
  type TableSpec,
} from './tables.ts';
import initialCategories from './categories.json';

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

  private db: SqlDatabase | null = null;
  private loaded = false;
  private stale = false;
  private version = 0;
  // Fingerprints of what the database holds, per table and record id
  private snapshots = new Map<string, Map<string, string>>();
  private configSnapshot: Partial<Record<ConfigKey, string>> = {};
  private persistedAuditIds = new Set<string>();
  // Serializes sync/flush so a reload never interleaves with a commit within one isolate
  private dbLock: Promise<unknown> = Promise.resolve();

  /** Test helper: replaces the cached data with the seed dataset; the next flush persists it. */
  public reset() {
    this.applyDataset(withSeedDefaults(null));
    this.auditLogs = [];
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
        return;
      }
      if (this.stale) {
        await this.reload(db);
        return;
      }
      // Changes made outside a request (tests, scripts) are written before checking for others'
      await this.flushUnlocked(db);
      if ((await readVersion(db)) !== this.version) {
        await this.reload(db);
      }
    });
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

    this.snapshots.clear();
    for (const [spec, records] of this.cachedTables()) {
      const snap = new Map<string, string>();
      for (const record of records) snap.set(record.id, rowFingerprint(spec, record));
      this.snapshots.set(spec.name, snap);
    }
    // Config rows that don't exist yet are treated as changed so defaults get persisted
    this.configSnapshot = {};
    for (const key of CONFIG_KEYS) {
      if (data.config[key] !== undefined) this.configSnapshot[key] = JSON.stringify(data.config[key]);
    }
    this.persistedAuditIds = new Set(this.auditLogs.map((l) => l.id));

    this.version = data.version;
    this.loaded = true;
    this.stale = false;
  }

  private cachedTables(): Array<[TableSpec, Array<Record<string, any>>]> {
    return [
      [documentsTable, Array.from(this.documents.values())],
      [contractsTable, Array.from(this.contracts.values())],
      [partnersTable, Array.from(this.partners.values())],
      [usersTable, Array.from(this.users.values())],
      [notificationsTable, this.notifications],
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
      statements.push(...upsertStatements(db, spec, changed), ...deleteStatements(db, spec, removed));
      pendingSnapshots.push(() => this.snapshots.set(spec.name, fingerprints));
    }

    for (const key of CONFIG_KEYS) {
      const json = JSON.stringify(this.configValue(key));
      if (this.configSnapshot[key] !== json) {
        statements.push(configStatement(db, key, this.configValue(key)));
        pendingSnapshots.push(() => (this.configSnapshot[key] = json));
      }
    }

    const newAuditLogs = this.auditLogs.filter((l) => !this.persistedAuditIds.has(l.id));
    if (newAuditLogs.length > 0) {
      statements.push(...upsertStatements(db, auditLogsTable, newAuditLogs));
      pendingSnapshots.push(() => newAuditLogs.forEach((l) => this.persistedAuditIds.add(l.id)));
    }

    if (statements.length === 0) return;

    try {
      const { version, concurrentWrite } = await commitChanges(db, statements, this.version);
      pendingSnapshots.forEach((apply) => apply());
      this.version = version;
      // Someone else committed in between: our cache misses their rows, reload on next request
      if (concurrentWrite) this.stale = true;
    } catch (err) {
      // The cache now holds changes the database rejected; discard them on the next request
      this.stale = true;
      throw err;
    }
  }

  /** Kept for route handlers: persists this request's changes before the response is built. */
  public async persistAsync() {
    await this.flush();
  }

  // Document operations
  public getDocuments(type?: string): DocumentRecord[] {
    const docs = Array.from(this.documents.values()).map(d => ({
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

  public getDocument(id: string): DocumentRecord | null {
    const doc = this.documents.get(id);
    if (!doc) return null;
    return {
      ...doc,
      deadline_status: calculateDocumentDeadline(doc),
    };
  }

  public createDocument(doc: Omit<DocumentRecord, 'id' | 'created_at' | 'updated_at'>): DocumentRecord {
    const id = 'doc-' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const newDoc: DocumentRecord = {
      ...doc,
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
    const updated: DocumentRecord = { ...doc, ...partial, updated_at: now, revision: (doc.revision ?? 0) + 1 };
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

  public bulkUpsertDocuments(docsList: Array<Partial<DocumentRecord>>): { added: number; updated: number; total: number } {
    let added = 0;
    let updated = 0;
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

    for (const item of docsList) {
      if (!item.document_number && !item.id) continue;

      let existing: DocumentRecord | undefined;
      if (item.id && this.documents.has(item.id)) {
        existing = this.documents.get(item.id);
      } else if (item.document_number) {
        existing = Array.from(this.documents.values()).find(
          d => d.document_number.trim().toLowerCase() === item.document_number!.trim().toLowerCase()
        );
      }

      if (existing) {
        const merged: DocumentRecord = {
          ...existing,
          ...item,
          id: existing.id,
          updated_at: now,
          revision: (existing.revision ?? 0) + 1,
        };
        merged.deadline_status = calculateDocumentDeadline(merged);
        this.documents.set(existing.id, merged);
        updated++;
      } else {
        const id = item.id || ('doc-' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6));
        const newRecord: DocumentRecord = {
          id,
          document_number: item.document_number || `CV-${new Date().getFullYear()}-${String(this.documents.size + 1).padStart(4, '0')}`,
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
        newRecord.deadline_status = calculateDocumentDeadline(newRecord);
        this.documents.set(id, newRecord);
        added++;
      }
    }
    return { added, updated, total: this.documents.size };
  }

  public getNextDocumentNumber(type: 'incoming' | 'outgoing', categoryCode = 'CV', deptCode = 'HCNS'): string {
    const year = new Date().getFullYear();
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
    const contracts = Array.from(this.contracts.values()).map(c => ({
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

  public getContract(id: string): ContractRecord | null {
    const c = this.contracts.get(id);
    if (!c) return null;
    return {
      ...c,
      urgency: calculateUrgency(c.end_date, c.status),
    };
  }

  public createContract(contract: Omit<ContractRecord, 'id' | 'created_at' | 'updated_at'>): ContractRecord {
    const id = 'con-' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const newContract: ContractRecord = {
      ...contract,
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
    const updated: ContractRecord = { ...contract, ...partial, updated_at: now, revision: (contract.revision ?? 0) + 1 };
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

  public bulkUpsertContracts(contractsList: Array<Partial<ContractRecord>>): { added: number; updated: number; total: number } {
    let added = 0;
    let updated = 0;
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

    for (const item of contractsList) {
      if (!item.contract_number && !item.id) continue;

      // Find existing contract by id or contract_number
      let existing: ContractRecord | undefined;
      if (item.id && this.contracts.has(item.id)) {
        existing = this.contracts.get(item.id);
      } else if (item.contract_number) {
        existing = Array.from(this.contracts.values()).find(
          c => c.contract_number.trim().toLowerCase() === item.contract_number!.trim().toLowerCase()
        );
      }

      if (existing) {
        // Update existing contract
        const merged: ContractRecord = {
          ...existing,
          ...item,
          id: existing.id,
          updated_at: now,
          revision: (existing.revision ?? 0) + 1,
        };
        merged.urgency = calculateUrgency(merged.end_date, merged.status);
        this.contracts.set(existing.id, merged);
        updated++;
      } else {
        // Create new contract
        const id = item.id || ('con-' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6));
        const newRecord: ContractRecord = {
          id,
          contract_number: item.contract_number || `HĐ-${new Date().getFullYear()}-${String(this.contracts.size + 1).padStart(4, '0')}`,
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
          revision: 1,
        };
        newRecord.urgency = calculateUrgency(newRecord.end_date, newRecord.status);
        this.contracts.set(id, newRecord);
        added++;
      }
    }
    return { added, updated, total: this.contracts.size };
  }

  // Partner operations (Full CRUD)
  public getPartners(): PartnerRecord[] {
    return Array.from(this.partners.values());
  }

  public getPartner(id: string): PartnerRecord | null {
    return this.partners.get(id) || null;
  }

  public createPartner(partner: Omit<PartnerRecord, 'id'>): PartnerRecord {
    const id = 'partner-' + (partner.code ? partner.code.toLowerCase().replace(/[^a-z0-9]/g, '') : Date.now().toString(36));
    const newPartner: PartnerRecord = {
      ...partner,
      id,
      contract_count: partner.contract_count ?? 0,
      active_contract_count: partner.active_contract_count ?? 0,
      is_locked: partner.is_locked ?? false,
    };
    this.partners.set(id, newPartner);
    return newPartner;
  }

  public updatePartner(id: string, partial: Partial<PartnerRecord>): PartnerRecord | null {
    const p = this.partners.get(id);
    if (!p) return null;
    const updated: PartnerRecord = { ...p, ...partial };
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

  // Notification methods
  public getNotifications(): NotificationRecord[] {
    return [...this.notifications].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  public addNotification(notif: Omit<NotificationRecord, 'id' | 'read' | 'created_at'>): NotificationRecord {
    const id = 'notif-' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    const now = new Date().toISOString();
    const newNotif: NotificationRecord = {
      ...notif,
      id,
      read: false,
      created_at: now,
    };

    // Log email dispatch to console/worker log for future SMTP integration
    const recipientEmail = notif.recipient_email || `${normalizeVietnamese(notif.recipient || 'staff').replace(/\s+/g, '.')}@sambogold.com`;
    console.log(`[EMAIL DISPATCH LOG] To: ${recipientEmail} | Subject: [SGII - ${notif.title}] | Message: ${notif.message}`);

    this.notifications.unshift(newNotif);
    // Keep max 100 recent notifications
    if (this.notifications.length > 100) {
      this.notifications = this.notifications.slice(0, 100);
    }
    return newNotif;
  }

  public markNotificationAsRead(id: string): boolean {
    const notif = this.notifications.find(n => n.id === id);
    if (notif) {
      notif.read = true;
      return true;
    }
    return false;
  }

  public markAllNotificationsAsRead(): boolean {
    for (const notif of this.notifications) {
      notif.read = true;
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
  public getStats() {
    const allContracts = this.getContracts();
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

    const totalContractValue = contracts
      .filter(c => c.status === 'active')
      .reduce((sum, c) => sum + (c.value || 0), 0);

    const docs = this.getDocuments();
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
      totalDocuments: this.documents.size,
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
      totalPartners: this.partners.size,
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
      totalContractValue,
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
      created_at: now,
      updated_at: now,
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

export const store = new MemoryStore();
