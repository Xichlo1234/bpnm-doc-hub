import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { applyLocalMigrations, __createNodeDatabaseForTests, type SqlDatabase } from '../src/server/db/database.ts';
import { MemoryStore } from '../src/server/db/store.ts';
import { RECORD_TABLES, columnNames, toRow, fromRow, partnersTable } from '../src/server/db/tables.ts';
import { importLegacyDataset, loadDataset, readVersion } from '../src/server/db/repository.ts';
import { withSeedDefaults } from '../src/server/db/persistence.ts';

const { DatabaseSync } = (process as any).getBuiltinModule('node:sqlite');

// The production node:sqlite adapter over a fresh in-memory database per test
async function freshDb(): Promise<{ raw: any; db: SqlDatabase }> {
  const raw = new DatabaseSync(':memory:');
  applyLocalMigrations(raw);
  return { raw, db: __createNodeDatabaseForTests(raw) };
}

const seed = () => withSeedDefaults(null);

describe('Database schema', () => {
  it('matches the column definitions in tables.ts', async () => {
    const { raw } = await freshDb();
    for (const spec of RECORD_TABLES) {
      // ALTER TABLE ADD COLUMN appends, so compare as sets rather than by position
      const actual = raw.prepare(`PRAGMA table_info(${spec.name})`).all().map((c: any) => c.name);
      expect([...actual].sort(), spec.name).toEqual([...columnNames(spec)].sort());
    }
  });

  it('round-trips records, keeping unknown fields and the absence of optional ones', () => {
    const record = { id: 'p1', code: 'A', name_vn: 'Đối tác', is_locked: true, custom_excel_col: { a: 1 } };
    const back = fromRow<any>(partnersTable, Object.fromEntries(columnNames(partnersTable).map((c, i) => [c, toRow(partnersTable, record)[i]])));
    expect(back).toEqual(record);
    expect('name_en' in back).toBe(false);
  });

  it('applies migrations idempotently', async () => {
    const { raw } = await freshDb();
    expect(() => applyLocalMigrations(raw)).not.toThrow();
  });
});

describe('Legacy import', () => {
  it('copies the whole dataset once, even when called twice', async () => {
    const { db } = await freshDb();
    const data = seed();
    expect(await importLegacyDataset(db, data, 'seed')).toBe(true);
    expect(await importLegacyDataset(db, data, 'seed')).toBe(false);

    const loaded = await loadDataset(db);
    expect(loaded.contracts.length).toBe(data.contracts.length);
    expect(loaded.documents.length).toBe(data.documents.length);
    expect(loaded.partners.length).toBe(data.partners.length);
    expect(loaded.users.length).toBe(data.users.length);
    expect(loaded.config.categories).toEqual(data.categories);
  });

  it('imports large datasets in chunks (beyond D1 per-statement limits)', async () => {
    const { db, raw } = await freshDb();
    const data = seed();
    const bigNote = 'x'.repeat(2_000);
    data.documents = Array.from({ length: 600 }, (_, i) => ({ ...data.documents[0], id: `doc-bulk-${i}`, notes: bigNote }));
    expect(await importLegacyDataset(db, data, 'seed')).toBe(true);
    expect(raw.prepare('SELECT COUNT(*) AS n FROM documents').get().n).toBe(600);
  });
});

describe('Row-level persistence', () => {
  async function twoIsolates() {
    const { db, raw } = await freshDb();
    await importLegacyDataset(db, seed(), 'seed');
    const a = new MemoryStore();
    const b = new MemoryStore();
    await a.sync(db, 'json');
    await b.sync(db, 'json');
    return { db, raw, a, b };
  }

  it('writes only the rows that changed', async () => {
    const { db, raw, a } = await twoIsolates();
    const doc = a.getDocuments()[0];
    const before = raw.prepare('SELECT id, updated_at FROM documents').all();

    a.updateDocument(doc.id, { title: 'Đã sửa' });
    await a.flush(db);

    const after = raw.prepare('SELECT id, updated_at, title FROM documents').all();
    const changed = after.filter((r: any) => before.find((x: any) => x.id === r.id)?.updated_at !== r.updated_at);
    expect(changed.map((r: any) => r.id)).toEqual([doc.id]);
    expect(changed[0].title).toBe('Đã sửa');
  });

  it('does not lose concurrent edits to different records (the old blob lost one of them)', async () => {
    const { db, a, b } = await twoIsolates();
    const [doc1, doc2] = a.getDocuments();

    // Both isolates hold the same snapshot, then each edits a different record
    a.updateDocument(doc1.id, { title: 'Sửa bởi A' });
    b.updateDocument(doc2.id, { title: 'Sửa bởi B' });
    await a.flush(db);
    await b.flush(db);

    const loaded = await loadDataset(db);
    expect(loaded.documents.find((d) => d.id === doc1.id).title).toBe('Sửa bởi A');
    expect(loaded.documents.find((d) => d.id === doc2.id).title).toBe('Sửa bởi B');

    // B noticed A's commit and refreshes its cache on the next request
    await b.sync(db, 'json');
    expect(b.getDocument(doc1.id)!.title).toBe('Sửa bởi A');
  });

  it('a stale isolate does not resurrect records deleted elsewhere', async () => {
    const { db, a, b } = await twoIsolates();
    const victim = a.getPartners()[0];
    a.deletePartner(victim.id);
    await a.flush(db);

    b.updatePartner(b.getPartners()[1].id, { notes: 'unrelated edit' });
    await b.flush(db);

    const loaded = await loadDataset(db);
    expect(loaded.partners.some((p) => p.id === victim.id)).toBe(false);
  });

  it('reloads when another isolate commits, and bumps data_version on every commit', async () => {
    const { db, a, b } = await twoIsolates();
    const v0 = await readVersion(db);
    a.updateSettings({ company_code: 'NEW' });
    await a.flush(db);
    expect(await readVersion(db)).toBe(v0 + 1);

    expect(b.getSettings().company_code).not.toBe('NEW');
    await b.sync(db, 'json');
    expect(b.getSettings().company_code).toBe('NEW');
  });

  it('persists audit logs append-only', async () => {
    const { db, raw, a } = await twoIsolates();
    a.recordAuditLog({ user_id: 'u', username: 'u', action: 'login', entity_type: 'auth' });
    await a.flush(db);
    await a.flush(db);
    expect(raw.prepare('SELECT COUNT(*) AS n FROM audit_logs').get().n).toBe(1);
  });

  it('discards cached changes the database rejected', async () => {
    const { db, a } = await twoIsolates();
    const doc = a.getDocuments()[0];
    a.updateDocument(doc.id, { title: 'never saved' });
    const failing: SqlDatabase = { ...db, prepare: db.prepare.bind(db), batch: async () => { throw new Error('D1 down'); } };
    await expect(a.flush(failing)).rejects.toThrow('D1 down');

    await a.sync(db, 'json');
    expect(a.getDocument(doc.id)!.title).toBe(doc.title);
  });
});

describe('Local database file', () => {
  it('is created inside DATA_DIR', async () => {
    const { DATA_DIR } = await import('../src/server/db/persistence.ts');
    expect(fs.existsSync(path.join(DATA_DIR, 'app.db'))).toBe(true);
    expect(DATA_DIR.startsWith(os.tmpdir()) || DATA_DIR.includes('sgii-test-data-')).toBe(true);
  });
});
