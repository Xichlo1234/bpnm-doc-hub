import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { applyLocalMigrations, __createNodeDatabaseForTests, MIGRATIONS_DIR } from '../src/server/db/database.ts';
import { MemoryStore } from '../src/server/db/store.ts';
import { runPreflight } from '../scripts/lib/preflight-core.mjs';

const { DatabaseSync } = (process as any).getBuiltinModule('node:sqlite');
const ALL = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
const BASE = ['0001_normalized_tables.sql', '0002_auth_state.sql', '0003_record_revisions.sql'];

/**
 * A database shaped like production today: only 0001–0003 applied, plus the edge cases the review
 * asked about (NULL revisions, legacy notifications, duplicate numbers, legacy file keys, contracts
 * without status, files stored base64 in D1).
 */
function productionLikeDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sgii-mig-'));
  const migDir = path.join(dir, 'migrations');
  fs.mkdirSync(migDir);
  for (const f of BASE) fs.copyFileSync(path.join(MIGRATIONS_DIR, f), path.join(migDir, f));
  const raw = new DatabaseSync(path.join(dir, 'prod.db'));
  // pre-0001 legacy tables that may exist in production (system_data, uploaded_files)
  raw.exec("CREATE TABLE IF NOT EXISTS uploaded_files (key TEXT PRIMARY KEY, filename TEXT, data TEXT)");
  applyLocalMigrations(raw, migDir);
  raw.exec(`
    INSERT INTO meta (key, value) VALUES ('legacy_import', '{"source":"d1"}');
    INSERT INTO meta (key, value) VALUES ('data_version', '71') ON CONFLICT(key) DO UPDATE SET value = '71';
    INSERT INTO documents (id, document_number, title, doc_type, issue_date, received_date, summary, tags, file_key, file_name, file_size, file_type, created_at, updated_at, issuer, signer, status, revision)
      VALUES ('d-old-1', 'ĐẾN-2025-0001', 'Cũ 1', 'incoming', '2025-01-01', NULL, NULL, NULL, 'SGII Project Delivery (External) - Documents', NULL, NULL, NULL, '2025-01-01', '2025-01-01', NULL, NULL, 'Quá hạn', NULL),
             ('d-old-2', 'đến-2025-0001 ', 'Cũ 2 (trùng số)', 'incoming', '2025-01-02', NULL, NULL, NULL, 'uploads/1_old.pdf', 'old.pdf', 3, 'application/pdf', '2025-01-02', '2025-01-02', NULL, NULL, 'Trạng thái lạ', NULL),
             ('d-old-3', '0001/2025/CV-HCNS', 'Đi cũ', 'outgoing', '2025-01-03', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2025-01-03', '2025-01-03', NULL, 'GĐ', 'Đã gửi', 2);
    INSERT INTO contracts (id, contract_number, title, contract_type, party_a, party_b, value, currency, signed_date, start_date, end_date, status, renewal_terms, partner_tax_id, partner_contact, file_key, file_name, file_size, file_type, created_at, updated_at, revision)
      VALUES ('c-old-1', 'HĐ-2025-01', 'HĐ cũ', 'service', 'A', 'B', 100, 'USD', '2025-01-01', '2025-01-01', '2027-01-01', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2025-01-01', '2025-01-01', NULL);
    INSERT INTO users (id, username, password, name, email, role, status, created_at, updated_at)
      VALUES ('admin_root', 'admin', 'Admin@6868', 'Admin', 'a@x.vn', 'admin', 'active', '2025-01-01', '2025-01-01');
    INSERT INTO notifications (id, title, message, type, target_id, target_type, recipient, read, created_at)
      VALUES ('n-old-1', 'Cũ', 'Nội dung', 'document', 'd-old-1', 'document', 'Ai đó', 0, '2025-01-01');
    INSERT INTO uploaded_files (key, filename, data) VALUES ('uploads/1_old.pdf', 'old.pdf', 'JVBE');
  `);
  return { raw, dir };
}

const snapshot = (raw: any) => ({
  documents: raw.prepare('SELECT * FROM documents ORDER BY id').all(),
  contracts: raw.prepare('SELECT * FROM contracts ORDER BY id').all(),
  users: raw.prepare('SELECT * FROM users ORDER BY id').all(),
  notifications: raw.prepare('SELECT * FROM notifications ORDER BY id').all(),
  uploaded_files: raw.prepare('SELECT * FROM uploaded_files ORDER BY key').all(),
});
const withoutNewColumns = (rows: any[], cols: string[]) => rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !cols.includes(k))));
// columns added by 0005, 0006 and 0009 (users.revision / partners.revision)
const NEW_COLUMNS = ['deleted_at', 'deleted_by', 'can_access_confidential_documents', 'recipient_user_id', 'revision_added_0009'];

describe('Migrations 0004–0010 on a production-like database', () => {
  it('0010: preflight blocks while active partners share a code; applying would fail; resolved data migrates', async () => {
    const { raw } = productionLikeDb();
    raw.exec(`INSERT INTO partners (id, code, name_vn) VALUES ('pa', 'TRUNG', 'A'), ('pb', ' trung', 'B')`);
    const before = snapshot(raw);
    const report = await runPreflight(async (sql: string) => raw.prepare(sql).all(), ALL);
    expect(report.blocking.join()).toMatch(/mã đối tác trùng/);
    expect(snapshot(raw)).toEqual(before);
    expect(() => applyLocalMigrations(raw)).toThrow(/UNIQUE/);
    // the failed run left 0010 unapplied and changed no partner row
    expect(raw.prepare("SELECT COUNT(*) AS n FROM d1_migrations WHERE name = '0010_partner_code_unique.sql'").get().n).toBe(0);
    expect(raw.prepare("SELECT id, code FROM partners WHERE id IN ('pa','pb') ORDER BY id").all()).toEqual([{ id: 'pa', code: 'TRUNG' }, { id: 'pb', code: ' trung' }]);
    raw.exec("UPDATE partners SET code = 'TRUNG-2' WHERE id = 'pb'"); // the approved manual fix
    applyLocalMigrations(raw);
    expect((await runPreflight(async (sql: string) => raw.prepare(sql).all(), ALL)).blocking).toEqual([]);
  });

  it('preflight (read-only) reports pending migrations, legacy data and duplicate numbers', async () => {
    const { raw } = productionLikeDb();
    const before = snapshot(raw);
    const report = await runPreflight(async (sql: string) => raw.prepare(sql).all(), ALL);
    expect(report.blocking).toEqual([]);
    expect(report.info.pending_migrations).toEqual(ALL.filter((f) => !BASE.includes(f)));
    expect(report.info.null_revision).toEqual({ documents: 2, contracts: 1 });
    expect(report.info.contracts_without_status).toBe(1);
    expect(report.info.notifications_without_recipient).toBe(1);
    expect(report.info.legacy_file_keys).toBe(1);
    expect(report.info.duplicate_numbers).toEqual([{ key: 'doc:incoming|đến-2025-0001', ids: ['d-old-1', 'd-old-2'] }]);
    expect(snapshot(raw)).toEqual(before); // nothing was written
  });

  it('preflight refuses to run anything but SELECT/PRAGMA', async () => {
    const writes: string[] = [];
    await runPreflight(async (sql: string) => {
      writes.push(sql);
      return [];
    }, ALL);
    expect(writes.every((s) => /^\s*(SELECT|PRAGMA)/i.test(s))).toBe(true);
  });

  it('applies on top of 0001–0003 without changing existing business rows, and the app starts on it', async () => {
    const { raw } = productionLikeDb();
    const before = snapshot(raw);
    applyLocalMigrations(raw); // all migrations, as `wrangler d1 migrations apply` would
    const ledger = raw.prepare('SELECT name FROM d1_migrations ORDER BY id').all().map((r: any) => r.name);
    expect(ledger).toEqual(ALL);
    const after = snapshot(raw);
    for (const t of ['documents', 'contracts', 'users', 'notifications'] as const) {
      const added = t === 'users' ? [...NEW_COLUMNS, 'revision'] : NEW_COLUMNS;
      expect(withoutNewColumns(after[t], added), t).toEqual(before[t]);
    }
    expect(after.uploaded_files).toEqual(before.uploaded_files);

    // Re-applying is a no-op (ledger) and the preflight is now clean of pending work
    applyLocalMigrations(raw);
    const report = await runPreflight(async (sql: string) => raw.prepare(sql).all(), ALL);
    expect(report.blocking).toEqual([]);
    expect(report.info.pending_migrations).toEqual([]);

    // The app loads the migrated database, registers numbers once, and old records stay editable
    const db = __createNodeDatabaseForTests(raw);
    const store = new MemoryStore();
    await store.sync(db, 'd1');
    expect(store.getDocuments().map((d) => d.id).sort()).toEqual(['d-old-1', 'd-old-2', 'd-old-3']);
    expect(store.getDocument('d-old-2')!.status).toBe('Trạng thái lạ'); // legacy status kept as is
    const backfill = JSON.parse(raw.prepare("SELECT value FROM meta WHERE key = 'number_registry_backfill'").get().value);
    expect(backfill.duplicates).toHaveLength(1);
    store.updateDocument('d-old-2', { notes: 'sửa sau migration' });
    store.updateContract('c-old-1', { notes: 'ok' });
    await store.flush(db);
    expect(raw.prepare("SELECT revision, notes FROM documents WHERE id = 'd-old-2'").get()).toEqual({ revision: 1, notes: 'sửa sau migration' });
    // nothing was imported again or re-seeded
    expect(raw.prepare('SELECT COUNT(*) AS n FROM documents').get().n).toBe(3);
  });

  it('rollback: the previous release (0003-era SQL) still works against the migrated schema', async () => {
    const { raw } = productionLikeDb();
    applyLocalMigrations(raw);
    // Old code writes with the 0003 column lists (INSERT OR REPLACE ... explicit columns) and reads SELECT *
    raw.exec(`INSERT OR REPLACE INTO documents (id, document_number, title, doc_type, issue_date, created_at, updated_at, revision, extra)
              VALUES ('d-new-old-code', 'ĐẾN-2025-0099', 'Ghi bởi bản cũ', 'incoming', '2025-03-01', '2025-03-01', '2025-03-01', 1, NULL)`);
    raw.exec(`INSERT OR REPLACE INTO users (id, username, password, name, email, role, status, token_version, must_change_password, created_at, updated_at, extra)
              VALUES ('u2', 'u2', 'x', 'U', 'u@x.vn', 'user', 'active', 0, 0, '2025-01-01', '2025-01-01', NULL)`);
    raw.exec(`INSERT INTO notifications (id, title, message, type, read, created_at) VALUES ('n-old-code', 't', 'm', 'system', 0, '2025-03-01')`);
    expect(raw.prepare("SELECT title FROM documents WHERE id = 'd-new-old-code'").get().title).toBe('Ghi bởi bản cũ');
    // ...and the new code picks those rows up again after rolling forward
    const store = new MemoryStore();
    await store.sync(__createNodeDatabaseForTests(raw), 'd1');
    expect(store.getDocument('d-new-old-code')!.title).toBe('Ghi bởi bản cũ');
  });
});
