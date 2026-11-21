import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { app } from '../src/server/index.ts';
import { MemoryStore, store } from '../src/server/db/store.ts';
import { MIGRATIONS_DIR, applyLocalMigrations, __createNodeDatabaseForTests, getDatabase, type SqlDatabase } from '../src/server/db/database.ts';
import { PartnerCodeTakenError } from '../src/server/db/repository.ts';
import { hashPassword, verifyPassword } from '../src/server/utils/security.ts';
import { discardUpload, processCleanup } from '../src/server/utils/storageCleanup.ts';
import { registerUpload, saveUploadedFile } from '../src/server/utils/fileStorage.ts';
import { planCutoverFence } from '../scripts/lib/cutover-fence.mjs';
import { fetchAs } from './setup.ts';

const { DatabaseSync } = (process as any).getBuiltinModule('node:sqlite');
const admin = (path: string, init?: RequestInit) => fetchAs('admin_root', path, init);
const jsonBody = (data: unknown, method = 'POST') => ({
  method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
});
const parse = async (response: Response) => await response.json() as any;
const barrier = () => {
  let open!: () => void;
  const wait = new Promise<void>((resolve) => { open = resolve; });
  return { wait, open };
};

beforeEach(() => store.reset());
afterEach(() => vi.restoreAllMocks());

describe('PR09 release blockers', () => {
  it.each(['reset', 'lock'])('E1: change-password never overrides an already committed %s on another connection', async (operation) => {
    const db = await getDatabase();
    store.updateUser('user_viewer', { password: await hashPassword('CurrentFixture2026') });
    await store.flush(db);
    const before = store.getUser('user_viewer')!;
    const nextHash = await hashPassword('ResetFixture2026');
    const commit = store.persistAsync.bind(store);
    vi.spyOn(store, 'persistAsync').mockImplementationOnce(async () => {
      const update = operation === 'reset'
        ? db.prepare("UPDATE users SET password = ?, token_version = COALESCE(token_version, 0) + 1 WHERE id = 'user_viewer'").bind(nextHash)
        : db.prepare("UPDATE users SET status = 'locked' WHERE id = 'user_viewer'");
      // Model an already committed account change, even if a legacy writer did not bump revision.
      await db.batch([update, db.prepare("UPDATE meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'data_version'")]);
      await commit();
    });
    const response = await fetchAs('user_viewer', '/api/auth/change-password', jsonBody({
      current_password: 'CurrentFixture2026', new_password: 'SelfChange2026',
    }));
    expect(response.status).toBe(409);
    expect(response.headers.get('set-cookie')).toBeNull();
    const persisted = await db.prepare("SELECT status, password, token_version FROM users WHERE id = 'user_viewer'").first<any>();
    expect(persisted.status).toBe(operation === 'lock' ? 'locked' : 'active');
    expect((await verifyPassword(operation === 'reset' ? 'ResetFixture2026' : 'CurrentFixture2026', persisted.password)).ok).toBe(true);
    expect(persisted.token_version ?? 0).toBe((before.token_version ?? 0) + (operation === 'reset' ? 1 : 0));
  });

  it.each([true, false])('E2: request B cannot read or flush A’s pending write (commit: %s)', async (succeed) => {
    const doc = store.getDocuments()[0];
    const db = await getDatabase();
    await store.flush(db);
    const entered = barrier();
    const release = barrier();
    const commit = store.persistAsync.bind(store);
    vi.spyOn(store, 'persistAsync').mockImplementationOnce(async () => {
      entered.open();
      await release.wait;
      if (!succeed) throw new Error('Synthetic rejected commit');
      await commit();
    });
    const write = admin('/api/documents/' + doc.id, jsonBody({ notes: 'PR09 isolated change' }, 'PATCH'));
    await entered.wait;
    const read = admin('/api/documents/' + doc.id);
    const persisted = () => db.prepare('SELECT notes FROM documents WHERE id = ?').bind(doc.id).first<{ notes: string | null }>();
    try {
      expect((await persisted())?.notes ?? null).toBe(doc.notes ?? null);
    } finally {
      release.open();
    }
    expect((await write).status).toBe(succeed ? 200 : 500);
    expect((await parse(await read)).notes ?? null).toBe(succeed ? 'PR09 isolated change' : doc.notes ?? null);
    expect((await persisted())?.notes ?? null).toBe(succeed ? 'PR09 isolated change' : doc.notes ?? null);
  });

  it('E3: maintenance answers liveness without touching a cold schema 0001–0003', async () => {
    const raw = new DatabaseSync(':memory:');
    for (const name of readdirSync(MIGRATIONS_DIR).sort().slice(0, 3)) raw.exec(readFileSync(join(MIGRATIONS_DIR, name), 'utf8'));
    const db = __createNodeDatabaseForTests(raw);
    const io = vi.spyOn(db, 'prepare');
    const env = { DB: db, MAINTENANCE_MODE: '1' };
    const request = (path: string) => app.fetch(new Request('http://local.test' + path), env);
    expect((await request('/api/health')).status).toBe(200);
    expect((await request('/api/documents')).status).toBe(503);
    expect(io).not.toHaveBeenCalled();
    raw.close();
  });

  it('E4: a late D1 success and concurrent unrelated commit preserve the attached file', async () => {
    const db = await getDatabase();
    await store.flush(db);
    const other = new MemoryStore();
    await other.sync(db, 'json');
    const contract = other.getContracts()[0];
    const wrapped: SqlDatabase = {
      prepare: db.prepare.bind(db),
      async batch(statements) {
        other.updateContract(contract.id, { notes: 'Independent commit' });
        await other.flush(db);
        await db.batch(statements);
        throw new Error('Synthetic timeout after commit');
      },
    };
    vi.spyOn(store, 'persistAsync').mockImplementationOnce(() => store.flush(wrapped));
    const form = new FormData();
    form.set('title', 'Synthetic PR09 record');
    form.set('doc_type', 'incoming');
    form.set('document_number', 'PR09-RECEIPT');
    form.set('file', new File(['fixture attachment'], 'fixture.txt', { type: 'text/plain' }));
    const created = await admin('/api/documents', { method: 'POST', body: form });
    expect(created.status).toBe(201);
    const record = await parse(created);
    expect((await admin('/api/files/' + record.file_key)).status).toBe(200);
    expect((await parse(await admin('/api/contracts/' + contract.id))).notes).toBe('Independent commit');
  });

  it('E4: cleanup keeps attached files and records a failed delete for retry', async () => {
    const db = await getDatabase();
    const key = 'uploads/pr09-retry.txt';
    const remove = vi.fn(async () => { throw new Error('Synthetic R2 failure'); });
    await db.prepare(`INSERT INTO file_uploads (key, uploaded_by, original_name, size, mime_type, sha256, created_at, attached_at)
      VALUES (?, 'admin_root', 'retry.txt', 1, 'text/plain', '', '2026-11-20', '2026-11-20')`).bind(key).run();
    await discardUpload(db, key, { BUCKET: { delete: remove } });
    expect(remove).not.toHaveBeenCalled();

    await db.prepare('UPDATE file_uploads SET attached_at = NULL WHERE key = ?').bind(key).run();
    await discardUpload(db, key, { BUCKET: { delete: remove } });
    expect(remove).toHaveBeenCalledTimes(1);
    expect(await db.prepare('SELECT status, attempts FROM storage_cleanup WHERE key = ?').bind(key).first()).toEqual({
      status: 'pending', attempts: 1,
    });
    const retry = vi.fn(async () => {});
    expect((await processCleanup(db, {}, [key], retry)).deleted).toEqual([key]);
    expect(retry).toHaveBeenCalledTimes(1);
    expect(await db.prepare('SELECT 1 FROM file_uploads WHERE key = ?').bind(key).first()).toBeNull();
  });

  it('E4: a lost R2 upload response leaves a reconciliable reservation and no deletion', async () => {
    const db = await getDatabase();
    const remove = vi.fn();
    const put = vi.fn(async (key: string) => {
      expect(await db.prepare('SELECT uploaded_by FROM file_uploads WHERE key = ?').bind(key).first()).toEqual({ uploaded_by: 'admin_root' });
      throw new Error('Synthetic R2 timeout');
    });
    await expect(saveUploadedFile(new File(['fixture'], 'r2-fixture.txt'),
      { BUCKET: { put, delete: remove } },
      (upload) => registerUpload(db, upload, 'admin_root'),
    )).rejects.toThrow('Synthetic R2 timeout');
    expect(put).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalled();
  });

  it('E5: separate D1 connections cannot both claim equivalent Unicode codes', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'bpnm-pr09-')), 'partners.db');
    const rawA = new DatabaseSync(file);
    applyLocalMigrations(rawA);
    const rawB = new DatabaseSync(file);
    try {
      const dbA = __createNodeDatabaseForTests(rawA);
      const dbB = __createNodeDatabaseForTests(rawB);
      const a = new MemoryStore();
      const b = new MemoryStore();
      await a.sync(dbA, 'json');
      await b.sync(dbB, 'json');
      a.createPartner({ code: 'đt   bàn', name_vn: 'A' } as any);
      b.createPartner({ code: 'ĐT BA\u0300N', name_vn: 'B' } as any);
      await a.flush(dbA);
      await expect(b.flush(dbB)).rejects.toBeInstanceOf(PartnerCodeTakenError);
      expect(rawA.prepare('SELECT COUNT(*) AS n FROM partner_code_keys WHERE code_key = ?').get('ĐT BÀN')?.n).toBe(1);
    } finally {
      rawA.close();
      rawB.close();
    }
  });

  it('E6: invalid IDs are refused, extension values survive, and the second preview cannot overwrite the first import', async () => {
    const doc = store.getDocuments()[0];
    const path = '/api/documents/';
    const preview = (rows: unknown[]) => admin(path + 'import/preview', jsonBody({ rows })).then(parse);
    const commit = (rows: unknown[], fingerprint: string) => admin(path + 'bulk-import', jsonBody({
      rows, confirm_updates: true, preview_fingerprint: fingerprint,
    }));
    const number = doc.document_number;
    expect((await preview([{ id: 'missing', document_number: number }])).rows[0].action).toBe('error');

    const rows = [{ id: doc.id, document_number: number, notes: 'From workbook A' }];
    const competing = [{ id: doc.id, document_number: number, notes: 'From workbook B' }];
    const [first, second] = await Promise.all([preview(rows), preview(competing)]);
    expect((await commit(rows, first.preview_fingerprint)).status).toBe(200);
    expect(await parse(await commit(competing, second.preview_fingerprint))).toMatchObject({ code: 'IMPORT_PREVIEW_STALE' });
    expect(store.getDocument(doc.id)?.notes).toBe('From workbook A');

    const create = [{ document_number: 'PR09-EXTRA', doc_type: 'incoming', title: 'Synthetic extension row', import_extension: 'keep me' }];
    const prepared = await preview(create);
    expect((await commit(create, prepared.preview_fingerprint)).status).toBe(200);
    expect(store.getDocuments().find(d => d.document_number === 'PR09-EXTRA')).toMatchObject({ import_extension: 'keep me' });
  });

  it('E7: fences old source writes and upgrades a restored copy without changing the source', () => {
    const raw = new DatabaseSync(':memory:');
    const dir = mkdtempSync(join(tmpdir(), 'bpnm-pr09-cutover-'));
    raw.exec('CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY, name TEXT UNIQUE)');
    for (const name of readdirSync(MIGRATIONS_DIR).sort().slice(0, 3)) {
      raw.exec(readFileSync(join(MIGRATIONS_DIR, name), 'utf8'));
      raw.prepare('INSERT INTO d1_migrations (name) VALUES (?)').run(name);
    }
    raw.exec("INSERT INTO documents (id, title) VALUES ('cutover-doc', 'Original')");
    const tables = raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r: {name: string}) => r.name);
    const plan = planCutoverFence(tables);
    raw.exec(plan.apply);
    expect(() => raw.exec("UPDATE documents SET title = 'Late writer'")).toThrow(/source is fenced/);
    const copy = join(dir, 'restored.db');
    raw.prepare('VACUUM INTO ?').run(copy);
    const target = new DatabaseSync(copy);
    try {
      target.exec(plan.release);
      applyLocalMigrations(target);
      expect(target.prepare('PRAGMA integrity_check').get()?.integrity_check).toBe('ok');
      expect(target.prepare('SELECT title FROM documents').get()?.title).toBe('Original');
      expect(target.prepare('SELECT name FROM d1_migrations WHERE name = ?').get('0011_stabilization.sql')).toBeDefined();
      target.exec("UPDATE documents SET title = 'Target writer'");
      expect(raw.prepare('SELECT title FROM documents').get()?.title).toBe('Original');
    } finally {
      target.close();
      raw.close();
    }
  });
});
