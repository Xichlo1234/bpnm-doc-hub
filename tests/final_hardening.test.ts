import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { app } from '../src/server/index.ts';
import { store, MemoryStore } from '../src/server/db/store.ts';
import { getDatabase, applyLocalMigrations, __createNodeDatabaseForTests } from '../src/server/db/database.ts';
import { importLegacyDataset, NumberConflictError, RevisionConflictError, FileRetiredError, UsernameTakenError, PartnerCodeTakenError } from '../src/server/db/repository.ts';
import { withSeedDefaults } from '../src/server/db/persistence.ts';
import * as fileStorage from '../src/server/utils/fileStorage.ts';
import { processCleanup } from '../src/server/utils/storageCleanup.ts';
import { runPreflight } from '../scripts/lib/preflight-core.mjs';
import { MIGRATIONS_DIR } from '../src/server/db/database.ts';
import { fetchAs } from './setup.ts';

const { DatabaseSync } = (process as any).getBuiltinModule('node:sqlite');
const as = (userId: string | null, p: string, init: RequestInit & { rawRevision?: boolean } = {}) => fetchAs(userId, p, init);
const send = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const json = async (res: Response) => (await res.json()) as any;
const ALL_MIGRATIONS = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();

function makeUser(username: string, extra: Record<string, any> = {}) {
  return store.createUser({ username, password: 'x', name: `Tên ${username}`, email: `${username}@x.vn`, role: 'user', ...extra }).id;
}
async function upload(userId: string, name = 'a.pdf', content = '%PDF x') {
  const form = new FormData();
  form.append('file', new Blob([content]), name);
  return json(await as(userId, '/api/files/upload', { method: 'POST', body: form }));
}

/** Two independent connections to one SQLite file = two Worker isolates on one D1 database. */
async function twoWorkers() {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sgii-w-')), 'db.sqlite');
  const rawA = new DatabaseSync(file);
  applyLocalMigrations(rawA);
  const rawB = new DatabaseSync(file);
  const dbA = __createNodeDatabaseForTests(rawA);
  const dbB = __createNodeDatabaseForTests(rawB);
  await importLegacyDataset(dbA, withSeedDefaults(null), 'seed');
  const a = new MemoryStore();
  const b = new MemoryStore();
  await a.sync(dbA, 'json');
  await b.sync(dbB, 'json');
  return { rawA, dbA, dbB, a, b };
}

afterEach(() => vi.restoreAllMocks());

// ---------------------------------------------------------------------------
describe('C1 — a removed or purged file never goes back to its uploader', () => {
  beforeEach(() => store.reset());

  async function laborWithFile(hr: string) {
    const up = await upload(hr, 'hd.pdf');
    const res = await as(hr, '/api/contracts', send('POST', { contract_number: `HĐLĐ-C1-${Math.random()}`, title: 'x', contract_type: 'labor', party_a: 'A', party_b: 'B', signed_date: '2026-01-01', start_date: '2026-01-01', file_key: up.file_key }));
    return { contract: await json(res), key: up.file_key as string };
  }

  it('purge with a failing R2 delete: file retired, uploader 403, retried later', async () => {
    const hr = makeUser('hr_c1', { can_access_labor_contracts: true });
    const { contract, key } = await laborWithFile(hr);
    await as('admin_root', `/api/contracts/${contract.id}`, { method: 'DELETE' });
    const spy = vi.spyOn(fileStorage, 'deleteStoredFile').mockRejectedValueOnce(new Error('R2 unavailable'));
    const purge = await json(await as('admin_root', `/api/trash/contract/${contract.id}`, { method: 'DELETE' }));
    spy.mockRestore();
    expect(purge.failed_files.map((f: any) => f.key)).toEqual([key]);
    // the object still exists, but nobody except admins can reach it
    expect((await as(hr, `/api/files/${key}`)).status).toBe(403);
    const db = await getDatabase();
    expect((await db.prepare('SELECT status, attempts, last_error FROM storage_cleanup WHERE key = ?').bind(key).first<any>())).toMatchObject({ status: 'pending', attempts: 1 });
    // it cannot be attached again, not even by an admin
    const doc = store.getDocuments()[0];
    const reattach = await as('admin_root', `/api/documents/${doc.id}`, send('PATCH', { file_key: key }));
    expect(reattach.status).toBe(409);
    expect((await json(reattach)).code).toBe('FILE_RETIRED');
    // retry succeeds
    const retry = await json(await as('admin_root', '/api/admin/storage-cleanup', { method: 'POST' }));
    expect(retry.deleted).toEqual([key]);
    expect((await db.prepare('SELECT status FROM storage_cleanup WHERE key = ?').bind(key).first<any>()).status).toBe('deleted');
    expect((await as(hr, `/api/files/${key}`)).status).toBe(403);
  });

  it('once attached, an upload is never "private to the uploader" again (attached_at)', async () => {
    const hr = makeUser('hr_c1b', { can_access_labor_contracts: true });
    const { contract, key } = await laborWithFile(hr);
    const db = await getDatabase();
    expect((await db.prepare('SELECT attached_at FROM file_uploads WHERE key = ?').bind(key).first<any>()).attached_at).toBeTruthy();
    // simulate the reference vanishing without a tombstone (e.g. a row deleted by an older build)
    (store as any).contracts.delete(contract.id);
    expect((await as(hr, `/api/files/${key}`)).status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
describe('C2 — delete / restore / update / re-create across workers', () => {
  it('purge vs. update: the second commit is refused, nothing is lost', async () => {
    const { a, b, dbA, dbB, rawA } = await twoWorkers();
    const id = a.getDocuments()[0].id;
    a.trashRecord('document', id, 'u');
    await a.flush(dbA);
    await b.sync(dbB, 'json');
    // A purges, B (same base) restores
    a.purgeRecord('document', id);
    b.restoreRecord('document', id);
    await a.flush(dbA);
    await expect(b.flush(dbB)).rejects.toBeInstanceOf(RevisionConflictError);
    expect(rawA.prepare('SELECT COUNT(*) AS n FROM documents WHERE id = ?').get(id).n).toBe(0);
  });

  it('update vs. purge: a purge based on an old copy is refused', async () => {
    const { a, b, dbA, dbB, rawA } = await twoWorkers();
    const id = a.getContracts()[0].id;
    a.trashRecord('contract', id, 'u');
    await a.flush(dbA);
    await b.sync(dbB, 'json');
    b.restoreRecord('contract', id);
    await b.flush(dbB);
    a.purgeRecord('contract', id); // A never saw the restore
    await expect(a.flush(dbA)).rejects.toBeInstanceOf(RevisionConflictError);
    expect(rawA.prepare('SELECT deleted_at FROM contracts WHERE id = ?').get(id).deleted_at).toBeNull();
  });

  it('partners: concurrent edits and re-creating the same code are refused', async () => {
    const { a, b, dbA, dbB, rawA } = await twoWorkers();
    const p = a.getPartners()[0];
    a.updatePartner(p.id, { notes: 'A' });
    b.updatePartner(p.id, { notes: 'B' });
    await a.flush(dbA);
    await expect(b.flush(dbB)).rejects.toBeInstanceOf(RevisionConflictError);
    expect(rawA.prepare('SELECT notes FROM partners WHERE id = ?').get(p.id).notes).toBe('A');

    await b.sync(dbB, 'json');
    a.createPartner({ code: 'NEWP', name_vn: 'A' } as any);
    b.createPartner({ code: 'NEWP', name_vn: 'B' } as any);
    await a.flush(dbA);
    // the database refuses a second active partner with this code (migration 0010)
    await expect(b.flush(dbB)).rejects.toBeInstanceOf(PartnerCodeTakenError);
    expect(rawA.prepare("SELECT name_vn FROM partners WHERE code = 'NEWP'").all()).toEqual([{ name_vn: 'A' }]);
  });

  it('settings/categories: a stale config write is refused', async () => {
    const { a, b, dbA, dbB, rawA } = await twoWorkers();
    a.updateSettings({ company_code: 'AAA' });
    b.updateSettings({ alert_level_1_days: 15 });
    await a.flush(dbA);
    await expect(b.flush(dbB)).rejects.toBeInstanceOf(RevisionConflictError);
    expect(JSON.parse(rawA.prepare("SELECT value FROM app_config WHERE key = 'settings'").get().value).company_code).toBe('AAA');
  });

  it('a restored partner may not take a code reused meanwhile', async () => {
    store.reset();
    const p = store.getPartners()[0];
    await as('admin_root', `/api/partners/${p.id}`, { method: 'DELETE' });
    store.createPartner({ code: p.code, name_vn: 'Mới' } as any);
    const res = await as('admin_root', `/api/trash/partner/${p.id}/restore`, { method: 'POST' });
    expect(res.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
describe('C3 — accounts: permissions, lock, passwords and sessions', () => {
  beforeEach(() => store.reset());

  it('two workers changing one account: the stale write is refused', async () => {
    const { a, b, dbA, dbB, rawA } = await twoWorkers();
    a.updateUser('user_viewer', { status: 'locked' });
    b.updateUser('user_viewer', { can_access_labor_contracts: true });
    await a.flush(dbA);
    await expect(b.flush(dbB)).rejects.toBeInstanceOf(RevisionConflictError);
    expect(rawA.prepare("SELECT status, can_access_labor_contracts FROM users WHERE id = 'user_viewer'").get()).toMatchObject({ status: 'locked', can_access_labor_contracts: null });

    // password reset vs. self-service change
    await b.sync(dbB, 'json');
    await a.sync(dbA, 'json');
    a.updateUser('admin_root', { password: 'h1', token_version: 5 });
    b.updateUser('admin_root', { password: 'h2', token_version: 5 });
    await a.flush(dbA);
    await expect(b.flush(dbB)).rejects.toBeInstanceOf(RevisionConflictError);
  });

  it('the same user name created by two workers is refused by the database', async () => {
    const { a, b, dbA, dbB } = await twoWorkers();
    a.createUser({ username: 'Nhanvien1', password: 'x', name: 'A', email: 'a@x.vn', role: 'user' } as any);
    b.createUser({ username: 'nhanvien1', password: 'x', name: 'B', email: 'b@x.vn', role: 'user' } as any);
    await a.flush(dbA);
    await expect(b.flush(dbB)).rejects.toBeInstanceOf(UsernameTakenError);
  });

  it('admin edits require the loaded revision', async () => {
    const res = await as('admin_root', '/api/users/user_viewer', { ...send('PATCH', { status: 'locked' }), rawRevision: true });
    expect(res.status).toBe(428);
    const u = store.getUser('user_viewer')!;
    store.updateUser('user_viewer', { department: 'X' });
    await store.flush(await getDatabase());
    const stale = await as('admin_root', '/api/users/user_viewer', { ...send('PATCH', { status: 'locked', expected_revision: u.revision ?? 0 }), rawRevision: true });
    expect(stale.status).toBe(409);
    expect(store.getUser('user_viewer')!.status).toBe('active');
  });

  it('a lock committed by another worker cuts the session immediately', async () => {
    const db = await getDatabase();
    await store.flush(db); // persist the reset dataset first, like a real request would have
    const { tokenFor } = await import('./setup.ts');
    const token = await tokenFor('user_viewer');
    await db.prepare("UPDATE users SET status = 'locked', revision = COALESCE(revision, 0) + 1 WHERE id = 'user_viewer'").run();
    await db.prepare("UPDATE meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'data_version'").run();
    const res = await app.fetch(new Request('http://localhost/api/documents', { headers: { Authorization: `Bearer ${token}` } }));
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
describe('C4 — attachment versions across workers', () => {
  it('two workers replacing the same attachment: one wins, no second "current" version', async () => {
    const { a, b, dbA, dbB, rawA } = await twoWorkers();
    const doc = a.getDocuments()[0];
    const first = a.addAttachment({ record_type: 'document', record_id: doc.id, file_key: 'uploads/1_v1.pdf', original_name: 'v1.pdf', size: 1, mime_type: 'application/pdf', sha256: '', uploaded_by: 'u' } as any);
    a.updateDocument(doc.id, {});
    await a.flush(dbA);
    await b.sync(dbB, 'json');
    a.addAttachment({ record_type: 'document', record_id: doc.id, file_key: 'uploads/2_a.pdf', original_name: 'a.pdf', size: 1, mime_type: 'application/pdf', sha256: '', uploaded_by: 'u', replaces: first.id } as any);
    a.updateDocument(doc.id, {});
    b.addAttachment({ record_type: 'document', record_id: doc.id, file_key: 'uploads/3_b.pdf', original_name: 'b.pdf', size: 1, mime_type: 'application/pdf', sha256: '', uploaded_by: 'u', replaces: first.id } as any);
    b.updateDocument(doc.id, {});
    await a.flush(dbA);
    await expect(b.flush(dbB)).rejects.toBeInstanceOf(RevisionConflictError);
    const current = rawA.prepare('SELECT file_key FROM attachments WHERE record_id = ? AND is_current = 1').all(doc.id);
    expect(current).toEqual([{ file_key: 'uploads/2_a.pdf' }]);
  });

  it('remove vs. replace on the same attachment row is refused even without touching the record', async () => {
    const { a, b, dbA, dbB } = await twoWorkers();
    const doc = a.getDocuments()[0];
    const att = a.addAttachment({ record_type: 'document', record_id: doc.id, file_key: 'uploads/9_x.pdf', original_name: 'x.pdf', size: 1, mime_type: 'application/pdf', sha256: '', uploaded_by: 'u' } as any);
    await a.flush(dbA);
    await b.sync(dbB, 'json');
    a.softDeleteAttachment(att.id, 'u');
    b.addAttachment({ record_type: 'document', record_id: doc.id, file_key: 'uploads/10_y.pdf', original_name: 'y.pdf', size: 1, mime_type: 'application/pdf', sha256: '', uploaded_by: 'u', replaces: att.id } as any);
    await a.flush(dbA);
    await expect(b.flush(dbB)).rejects.toBeInstanceOf(RevisionConflictError);
  });

  it('the API moves the record revision on every attachment change', async () => {
    store.reset();
    const doc = store.getDocuments()[0];
    const before = store.getDocument(doc.id)!.revision ?? 0;
    const form = new FormData();
    form.append('file', new Blob(['%PDF']), 'p.pdf');
    await as('admin_root', `/api/attachments/document/${doc.id}`, { method: 'POST', body: form });
    const form2 = new FormData();
    form2.append('file', new Blob(['%PDF2']), 'q.pdf');
    const second = await json(await as('admin_root', `/api/attachments/document/${doc.id}`, { method: 'POST', body: form2 }));
    expect(second.record.revision).toBeGreaterThan(before + 1);
  });
});

// ---------------------------------------------------------------------------
describe('C5 — issued numbers are never reused', () => {
  beforeEach(() => store.reset());

  it('after renumbering (API and across workers)', async () => {
    const d = await json(await as('admin_root', '/api/documents', send('POST', { doc_type: 'outgoing', document_number: 'TB-C5-01', title: 'x' })));
    await as('admin_root', `/api/documents/${d.id}`, send('PATCH', { document_number: 'TB-C5-02' }));
    const reuse = await as('admin_root', '/api/documents', send('POST', { doc_type: 'outgoing', document_number: 'TB-C5-01', title: 'y' }));
    expect(reuse.status).toBe(409);
    // the record itself may go back to its own former number
    expect((await as('admin_root', `/api/documents/${d.id}`, send('PATCH', { document_number: 'TB-C5-01' }))).status).toBe(200);
  });

  it('after purge', async () => {
    const c = await json(await as('admin_root', '/api/contracts', send('POST', { contract_number: 'HĐ-C5-P', title: 'x', contract_type: 'service', party_a: 'A', party_b: 'B', signed_date: '2026-01-01', start_date: '2026-01-01' })));
    await as('admin_root', `/api/contracts/${c.id}`, { method: 'DELETE' });
    await as('admin_root', `/api/trash/contract/${c.id}`, { method: 'DELETE' });
    const reuse = await as('admin_root', '/api/contracts', send('POST', { contract_number: 'hđ-c5-p', title: 'y', contract_type: 'service', party_a: 'A', party_b: 'B', signed_date: '2026-01-01', start_date: '2026-01-01' }));
    expect(reuse.status).toBe(409);
    const imp = await json(await as('admin_root', '/api/contracts/import/preview', send('POST', { rows: [{ contract_number: 'HĐ-C5-P', title: 'z', party_a: 'A', party_b: 'B', signed_date: '2026-01-01', start_date: '2026-01-01' }] })));
    expect(imp.rows[0].action).toBe('error');
  });

  it('a worker that never saw the renumbering is refused by the database', async () => {
    const { a, b, dbA, dbB } = await twoWorkers();
    const c = a.getContracts()[0];
    const old = c.contract_number;
    a.updateContract(c.id, { contract_number: 'HĐ-NEW-NUM' });
    await a.flush(dbA);
    b.createContract({ contract_number: old, title: 'reuse', contract_type: 'service', party_a: 'A', party_b: 'B', signed_date: '2026-01-01', start_date: '2026-01-01', status: 'active', value: 0, currency: 'VND' } as any);
    await expect(b.flush(dbB)).rejects.toBeInstanceOf(NumberConflictError);
  });
});

// ---------------------------------------------------------------------------
describe('C6 — never delete an object another record uses', () => {
  beforeEach(() => store.reset());

  it('cleanup re-checks the database: a reference added by another worker keeps the object', async () => {
    const db = await getDatabase();
    const up = await upload('admin_root', 'shared.pdf');
    const docs = store.getDocuments();
    store.updateDocument(docs[0].id, { file_key: up.file_key });
    await as('admin_root', `/api/documents/${docs[0].id}`, { method: 'DELETE' });
    // another worker attached the same object to a contract (committed, not yet in this cache)
    const contractId = store.getContracts()[0].id;
    await db.prepare('UPDATE contracts SET file_key = ? WHERE id = ?').bind(up.file_key, contractId).run();
    const deleteSpy = vi.spyOn(fileStorage, 'deleteStoredFile');
    const purge = await json(await as('admin_root', `/api/trash/document/${docs[0].id}`, { method: 'DELETE' }));
    expect(purge.kept_files).toEqual([up.file_key]);
    expect(purge.removed_files).toEqual([]);
    expect(deleteSpy).not.toHaveBeenCalled();
    expect((await db.prepare('SELECT status FROM storage_cleanup WHERE key = ?').bind(up.file_key).first<any>()).status).toBe('kept');
  });

  it('processCleanup never throws and records every failure', async () => {
    const db = await getDatabase();
    await db.prepare("INSERT INTO storage_cleanup (key, status, enqueued_at, attempts) VALUES ('uploads/zz_fail.pdf', 'pending', '2026-01-01', 0)").run();
    const res = await processCleanup(db, {}, undefined, async () => {
      throw new Error('boom');
    });
    expect(res.failed).toEqual([{ key: 'uploads/zz_fail.pdf', error: 'boom' }]);
    expect((await db.prepare("SELECT attempts, last_error FROM storage_cleanup WHERE key = 'uploads/zz_fail.pdf'").first<any>())).toEqual({ attempts: 1, last_error: 'boom' });
  });

  it('a write attaching a key that another worker queued for deletion is refused by the database', async () => {
    const { a, dbA, rawA } = await twoWorkers();
    rawA.exec("INSERT INTO storage_cleanup (key, status, enqueued_at, attempts) VALUES ('uploads/q.pdf', 'pending', '2026-01-01', 0)");
    a.updateDocument(a.getDocuments()[0].id, { file_key: 'uploads/q.pdf' });
    await expect(a.flush(dbA)).rejects.toBeInstanceOf(FileRetiredError);
  });
});

// ---------------------------------------------------------------------------
describe('C7 — safe rollback', () => {
  it('maintenance mode answers 503 for the API but keeps the health check', async () => {
    process.env.MAINTENANCE_MODE = '1';
    try {
      expect((await as('admin_root', '/api/documents')).status).toBe(503);
      expect((await app.fetch(new Request('http://localhost/api/health'))).status).toBe(200);
    } finally {
      delete process.env.MAINTENANCE_MODE;
    }
    expect((await as('admin_root', '/api/documents')).status).toBe(200);
  });

  it('numbers written by an older build are found by preflight and registered by reconcile (never reassigned)', async () => {
    store.reset();
    const db = await getDatabase();
    await store.flush(db);
    const now = '2026-01-01';
    // an older build (no number_registry) inserts records directly
    await db.prepare(`INSERT INTO documents (id, document_number, title, doc_type, issue_date, created_at, updated_at, revision) VALUES ('old-build-1', 'CV-ROLLBACK-1', 't', 'outgoing', ?1, ?1, ?1, 1)`).bind(now).run();
    const takenNumber = store.getDocuments().find((d) => d.doc_type === 'outgoing')!.document_number;
    await db.prepare(`INSERT INTO documents (id, document_number, title, doc_type, issue_date, created_at, updated_at, revision) VALUES ('old-build-2', ?2, 't', 'outgoing', ?1, ?1, ?1, 1)`).bind(now, takenNumber).run();
    await db.prepare("UPDATE meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'data_version'").run();

    const report = await runPreflight(async (sql: string) => (await db.prepare(sql).all()).results, ALL_MIGRATIONS);
    expect(report.info.unregistered_numbers).toEqual(expect.arrayContaining(['old-build-1']));
    expect(report.warnings.join()).toMatch(/reconcile/);

    const dry = await json(await as('admin_root', '/api/admin/number-registry/reconcile', { method: 'POST' }));
    expect(dry.applied).toBe(false);
    expect(dry.missing.map((m: any) => m.record_id)).toContain('old-build-1');
    expect(dry.conflicts.map((c: any) => c.record_id)).toContain('old-build-2');
    await as('admin_root', '/api/admin/number-registry/reconcile?apply=1', { method: 'POST' });
    expect((await db.prepare("SELECT record_id FROM number_registry WHERE number_norm = 'cv-rollback-1'").first<any>()).record_id).toBe('old-build-1');
    // the conflicting number stays with its original owner
    const original = await db.prepare("SELECT record_id FROM number_registry WHERE scope = 'doc:outgoing' AND number_norm = ?").bind(takenNumber.toLowerCase()).first<any>();
    expect(original.record_id).not.toBe('old-build-2');
    expect((await as('user_viewer', '/api/admin/number-registry/reconcile', { method: 'POST' })).status).toBe(403);
  });

  it('preflight blocks 0009 while user names collide', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sgii-pre-'));
    const migDir = path.join(dir, 'm');
    fs.mkdirSync(migDir);
    for (const f of ALL_MIGRATIONS.filter((f) => f < '0009')) fs.copyFileSync(path.join(MIGRATIONS_DIR, f), path.join(migDir, f));
    const raw = new DatabaseSync(path.join(dir, 'db.sqlite'));
    applyLocalMigrations(raw, migDir);
    raw.exec(`INSERT INTO users (id, username, name, email, role, status, created_at, updated_at) VALUES ('a','Admin','A','a@x','admin','active','x','x'), ('b','admin','B','b@x','user','active','x','x')`);
    const report = await runPreflight(async (sql: string) => raw.prepare(sql).all(), ALL_MIGRATIONS);
    expect(report.blocking.join()).toMatch(/tên đăng nhập trùng/);
  });
});
