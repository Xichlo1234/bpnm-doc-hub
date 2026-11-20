import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { store } from '../src/server/db/store.ts';
import { getDatabase, __createNodeDatabaseForTests, applyLocalMigrations } from '../src/server/db/database.ts';
import { DATA_DIR } from '../src/server/db/persistence.ts';
import { loadDataset } from '../src/server/db/repository.ts';

const { DatabaseSync } = (process as any).getBuiltinModule('node:sqlite');

// Mirrors the production procedure in docs/ops/BACKUP_RESTORE.md on test data:
// 1. export the database to SQL (what `wrangler d1 export` produces), 2. restore it into an empty
// database (what `wrangler d1 execute --file` does), 3. check every record came back.
function exportSql(dbFile: string): string {
  const db = new DatabaseSync(dbFile);
  const tables = db
    .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'd1_migrations'")
    .all() as Array<{ name: string; sql: string }>;
  const lines: string[] = [];
  for (const t of tables) {
    for (const row of db.prepare(`SELECT * FROM "${t.name}"`).all() as any[]) {
      const cols = Object.keys(row);
      const values = cols.map((c) => {
        const v = row[c];
        if (v === null || v === undefined) return 'NULL';
        if (typeof v === 'number' || typeof v === 'bigint') return String(v);
        return `'${String(v).replace(/'/g, "''")}'`;
      });
      lines.push(`INSERT INTO "${t.name}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${values.join(', ')});`);
    }
  }
  db.close();
  return lines.join('\n');
}

describe('Backup and restore', () => {
  it('restores every record from an SQL export into a fresh database', async () => {
    store.reset();
    store.createDocument({ document_number: 'ĐẾN-2026-8888', title: 'Có dấu \'nháy\' và tiếng Việt', doc_type: 'incoming', issue_date: '2026-01-01' } as any);
    await store.flush(await getDatabase());
    const original = await loadDataset(await getDatabase());

    const sql = exportSql(path.join(DATA_DIR, 'app.db'));
    const restoredFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sgii-restore-')), 'restored.db');
    const fresh = new DatabaseSync(restoredFile);
    applyLocalMigrations(fresh); // same schema as production (migrations/)
    fresh.exec('DELETE FROM meta');
    fresh.exec(sql);
    const restored = await loadDataset(__createNodeDatabaseForTests(fresh));

    expect(restored.version).toBe(original.version);
    for (const key of ['documents', 'contracts', 'partners', 'users', 'notifications', 'attachments'] as const) {
      const byId = (rows: any[]) => [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)));
      expect(byId(restored[key]), key).toEqual(byId(original[key]));
    }
    expect(restored.config).toEqual(original.config);
    expect(restored.documents.find((d: any) => d.document_number === 'ĐẾN-2026-8888')?.title).toBe("Có dấu 'nháy' và tiếng Việt");
    fresh.close();
  });
});
