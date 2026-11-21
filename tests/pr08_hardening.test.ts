import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { app } from '../src/server/index.ts';
import { store, MemoryStore } from '../src/server/db/store.ts';
import * as database from '../src/server/db/database.ts';
import { getDatabase, applyLocalMigrations, __createNodeDatabaseForTests, MIGRATIONS_DIR } from '../src/server/db/database.ts';
import { importLegacyDataset, PartnerCodeTakenError } from '../src/server/db/repository.ts';
import { withSeedDefaults } from '../src/server/db/persistence.ts';
import * as fileStorage from '../src/server/utils/fileStorage.ts';
import { hashPassword } from '../src/server/utils/security.ts';
import { runPreflight } from '../scripts/lib/preflight-core.mjs';
import { fetchAs } from './setup.ts';

const { DatabaseSync } = (process as any).getBuiltinModule('node:sqlite');
const as = (userId: string | null, p: string, init: RequestInit & { rawRevision?: boolean } = {}) => fetchAs(userId, p, init);
const send = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const json = async (res: Response) => (await res.json()) as any;
const anon = (p: string, init: RequestInit = {}) => app.fetch(new Request(`http://localhost${p}`, init));
const ALL = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
const pause = (ms = 15) => new Promise((r) => setTimeout(r, ms));

async function twoWorkers() {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sgii-p8-')), 'db.sqlite');
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
describe('D1 — one active partner per code, enforced by D1', () => {
  it('create / create from two workers', async () => {
    const { a, b, dbA, dbB, rawA } = await twoWorkers();
    a.createPartner({ code: 'DUP1', name_vn: 'A' } as any);
    b.createPartner({ code: 'dup1 ', name_vn: 'B' } as any); // other id, same code (case/space)
    await a.flush(dbA);
    await expect(b.flush(dbB)).rejects.toBeInstanceOf(PartnerCodeTakenError);
    expect(rawA.prepare("SELECT COUNT(*) AS n FROM partners WHERE upper(trim(code)) = 'DUP1' AND deleted_at IS NULL").get().n).toBe(1);
  });

  it('create / restore and restore / restore from two workers', async () => {
    const { a, b, dbA, dbB, rawA } = await twoWorkers();
    const p = a.getPartners()[0];
    a.trashRecord('partner', p.id, 'u');
    await a.flush(dbA);
    await b.sync(dbB, 'json');
    // worker A restores, worker B (cache: in trash) creates a partner with the same code
    a.restoreRecord('partner', p.id);
    b.createPartner({ code: p.code, name_vn: 'Mới' } as any);
    await a.flush(dbA);
    await expect(b.flush(dbB)).rejects.toBeInstanceOf(PartnerCodeTakenError);

    // two trashed partners with one code (historical data) restored by two workers
    rawA.exec(`INSERT INTO partners (id, code, name_vn, deleted_at, revision) VALUES ('t1', 'TWIN', 'x', '2026-01-01', 1), ('t2', 'twin', 'y', '2026-01-01', 1)`);
    rawA.exec("UPDATE meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'data_version'");
    await a.sync(dbA, 'json');
    await b.sync(dbB, 'json');
    a.restoreRecord('partner', 't1');
    b.restoreRecord('partner', 't2');
    await a.flush(dbA);
    await expect(b.flush(dbB)).rejects.toBeInstanceOf(PartnerCodeTakenError);
    expect(rawA.prepare("SELECT id FROM partners WHERE upper(code) = 'TWIN' AND deleted_at IS NULL").all()).toEqual([{ id: 't1' }]);
  });

  it('API: 409 on duplicate create, renaming to a used code, and restoring into a used code', async () => {
    store.reset();
    const [p1, p2] = store.getPartners();
    expect((await as('admin_root', '/api/partners', send('POST', { code: ` ${p1.code.toLowerCase()} `, name_vn: 'x' }))).status).toBe(409);
    expect((await as('admin_root', `/api/partners/${p2.id}`, send('PATCH', { code: p1.code }))).status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
describe('D2 — a concurrent account change never lets the earlier verification issue a token', () => {
  beforeEach(() => store.reset());

  /** Makes the next commit run after "another worker" changed the account row in D1. */
  async function raceNextCommit(change: string, ...params: unknown[]) {
    const db = await getDatabase();
    await store.flush(db);
    const original = store.persistAsync.bind(store);
    vi.spyOn(store, 'persistAsync').mockImplementationOnce(async () => {
      await db.prepare(change).bind(...params).run();
      await db.prepare("UPDATE meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'data_version'").run();
      return original();
    });
  }

  async function legacyPassword(userId: string, plain: string) {
    store.updateUser(userId, { password: plain, must_change_password: false }); // plaintext → needs a rehash at login
    await store.flush(await getDatabase());
  }
  const login = (username: string, password: string) =>
    anon('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });

  it('login vs. password reset: the old password is refused after reload', async () => {
    await legacyPassword('user_viewer', 'OldPass2026');
    const newHash = await hashPassword('NewPass2026');
    await raceNextCommit("UPDATE users SET password = ?, token_version = COALESCE(token_version, 0) + 1, revision = COALESCE(revision, 0) + 1 WHERE id = 'user_viewer'", newHash);
    const res = await login('user', 'OldPass2026');
    expect(res.status).toBe(401);
    expect((await json(res)).token).toBeUndefined();
    expect((await login('user', 'NewPass2026')).status).toBe(200);
  });

  it('login vs. lock: refused after reload', async () => {
    await legacyPassword('user_viewer', 'OldPass2026');
    await raceNextCommit("UPDATE users SET status = 'locked', revision = COALESCE(revision, 0) + 1 WHERE id = 'user_viewer'");
    const res = await login('user', 'OldPass2026');
    expect(res.status).toBe(403);
    expect((await json(res)).token).toBeUndefined();
  });

  it('login vs. session revocation: the token carries the latest token_version', async () => {
    await legacyPassword('user_viewer', 'OldPass2026');
    await raceNextCommit("UPDATE users SET token_version = COALESCE(token_version, 0) + 7, revision = COALESCE(revision, 0) + 1 WHERE id = 'user_viewer'");
    const res = await login('user', 'OldPass2026');
    expect(res.status).toBe(200);
    const { token } = await json(res);
    const tv = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).tv;
    expect(tv).toBe(store.getUser('user_viewer')!.token_version);
    expect((await anon('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })).status).toBe(200);
    // the legacy password was still upgraded on top of the latest row
    expect(store.getUser('user_viewer')!.password).toMatch(/^pbkdf2\$/);
  });

  it('same isolate: a reset or lock landing during password verification refuses the earlier verification', async () => {
    const security = await import('../src/server/utils/security.ts');
    for (const change of [
      async () => { store.updateUser('user_viewer', { password: await hashPassword('Changed2026') }); },
      async () => { store.updateUser('user_viewer', { status: 'locked' }); },
    ]) {
      store.reset();
      store.updateUser('user_viewer', { password: await hashPassword('Current2026'), must_change_password: false });
      await store.flush(await getDatabase());
      const verify = security.verifyPassword;
      vi.spyOn(security, 'verifyPassword').mockImplementationOnce(async (...args: any[]) => {
        const r = await (verify as any)(...args);
        await change(); // another request in this isolate commits while this login awaits
        return r;
      });
      const res = await login('user', 'Current2026');
      expect(res.status).not.toBe(200);
      expect((await json(res)).token).toBeUndefined();
      vi.restoreAllMocks();
    }
  });

  it('keeps forcing a change of published default passwords', async () => {
    store.updateUser('user_viewer', { password: 'User@123456', must_change_password: false });
    await store.flush(await getDatabase());
    const res = await login('user', 'User@123456');
    expect((await json(res)).user.must_change_password).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('D3 — two requests in the same isolate with the same expected_revision', () => {
  beforeEach(() => store.reset());
  const uploadsCount = () => (fs.existsSync(fileStorage.UPLOADS_DIR) ? fs.readdirSync(fileStorage.UPLOADS_DIR).length : 0);

  it('attachments: one wins, the other gets 409 and its uploaded object is removed', async () => {
    const doc = store.getDocuments()[0];
    const rev = store.getDocument(doc.id)!.revision ?? 0;
    // widen the gap between the revision check and the mutation (the R2 upload)
    const save = fileStorage.saveUploadedFile;
    vi.spyOn(fileStorage, 'saveUploadedFile').mockImplementation(async (...args: any[]) => {
      const r = await (save as any)(...args);
      await pause();
      return r;
    });
    const db = await getDatabase();
    const beforeFiles = uploadsCount();
    const beforeRows = (await db.prepare('SELECT COUNT(*) AS n FROM file_uploads').first<any>()).n;
    const post = (name: string) => {
      const form = new FormData();
      form.append('file', new Blob([`%PDF ${name}`]), name);
      form.append('expected_revision', String(rev));
      return as('admin_root', `/api/attachments/document/${doc.id}`, { method: 'POST', body: form, rawRevision: true });
    };
    const [r1, r2] = await Promise.all([post('a.pdf'), post('b.pdf')]);
    expect([r1.status, r2.status].sort()).toEqual([201, 409]);
    expect(uploadsCount() - beforeFiles).toBe(1);
    expect((await db.prepare('SELECT COUNT(*) AS n FROM file_uploads').first<any>()).n - beforeRows).toBe(1);
    expect(store.getAttachments('document', doc.id).filter((a) => a.file_key.startsWith('uploads/')).length).toBe(1);
  });

  it('contract edits that await (file permission check): only one succeeds', async () => {
    const c = store.getContracts().find((x) => x.contract_type !== 'labor')!;
    const rev = c.revision ?? 0;
    const getRow = fileStorage.getUploadRow;
    vi.spyOn(fileStorage, 'getUploadRow').mockImplementation(async (...args: any[]) => {
      await pause();
      return (getRow as any)(...args);
    });
    const hr = store.createUser({ username: 'hr_d3', password: 'x', name: 'HR', email: 'h@x.vn', role: 'user', can_access_labor_contracts: true } as any).id;
    const labor = store.createContract({ contract_number: 'HĐLĐ-D3', title: 'x', contract_type: 'labor', party_a: 'A', party_b: 'B', signed_date: '2026-01-01', start_date: '2026-01-01', status: 'active', value: 0, currency: 'VND' } as any);
    await store.flush(await getDatabase());
    const lrev = store.getContract(labor.id)!.revision ?? 0;
    const patch = (notes: string) =>
      as(hr, `/api/contracts/${labor.id}`, { ...send('PATCH', { notes, file_key: 'uploads/none.pdf', expected_revision: lrev }), rawRevision: true });
    const [p1, p2] = await Promise.all([patch('một'), patch('hai')]);
    // the file is not the user's, so both are refused — still, neither overwrote anything
    expect([p1.status, p2.status]).toEqual([403, 403]);
    const ok = (notes: string) => as('admin_root', `/api/contracts/${c.id}`, { ...send('PATCH', { notes, expected_revision: rev }), rawRevision: true });
    const results = await Promise.all([ok('A'), ok('B')]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it('labor manager edits racing through the permission await: exactly one wins', async () => {
    const hr = store.createUser({ username: 'hr_d3b', password: 'x', name: 'HR', email: 'h2@x.vn', role: 'user', can_access_labor_contracts: true } as any).id;
    const labor = store.createContract({ contract_number: 'HĐLĐ-D3B', title: 'x', contract_type: 'labor', party_a: 'A', party_b: 'B', signed_date: '2026-01-01', start_date: '2026-01-01', status: 'active', value: 0, currency: 'VND' } as any);
    await store.flush(await getDatabase());
    const form = new FormData();
    form.append('file', new Blob(['%PDF own']), 'own.pdf');
    const up = await json(await as(hr, '/api/files/upload', { method: 'POST', body: form }));
    const lrev = store.getContract(labor.id)!.revision ?? 0;
    const getRow = fileStorage.getUploadRow;
    vi.spyOn(fileStorage, 'getUploadRow').mockImplementation(async (...args: any[]) => {
      await pause();
      return (getRow as any)(...args);
    });
    const patch = (notes: string) =>
      as(hr, `/api/contracts/${labor.id}`, { ...send('PATCH', { notes, file_key: up.file_key, expected_revision: lrev }), rawRevision: true });
    const [p1, p2] = await Promise.all([patch('một'), patch('hai')]);
    expect([p1.status, p2.status].sort()).toEqual([200, 409]);
    expect(store.getContract(labor.id)!.revision).toBe(lrev + 1);
  });

  it('password resets racing through hashing: exactly one wins', async () => {
    const u = store.getUser('user_viewer')!;
    const reset = (pw: string) => as('admin_root', '/api/users/user_viewer', { ...send('PATCH', { password: pw, expected_revision: u.revision ?? 0 }), rawRevision: true });
    const results = await Promise.all([reset('Reset1Pass2026'), reset('Reset2Pass2026')]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it('two creates with the same manual number and a file: one 201, one 409, no leftover file', async () => {
    const save = fileStorage.saveUploadedFile;
    vi.spyOn(fileStorage, 'saveUploadedFile').mockImplementation(async (...args: any[]) => {
      const r = await (save as any)(...args);
      await pause();
      return r;
    });
    const before = uploadsCount();
    const create = (name: string) => {
      const form = new FormData();
      for (const [k, v] of Object.entries({ doc_type: 'outgoing', document_number: 'TB-D3-RACE', title: name })) form.append(k, v);
      form.append('file', new Blob([`%PDF ${name}`]), `${name}.pdf`);
      return as('admin_root', '/api/documents', { method: 'POST', body: form });
    };
    const results = await Promise.all([create('a'), create('b')]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(uploadsCount() - before).toBe(1);
  });

  it('a commit failure after the upload does not expose or keep the new file, and never deletes shared files', async () => {
    const doc = store.getDocuments()[0];
    const db = await getDatabase();
    const shared = store.getDocuments()[1];
    const form0 = new FormData();
    form0.append('file', new Blob(['%PDF shared']), 'shared.pdf');
    const sharedUp = await json(await as('admin_root', '/api/files/upload', { method: 'POST', body: form0 }));
    store.updateDocument(shared.id, { file_key: sharedUp.file_key });
    await store.flush(db);
    vi.spyOn(store, 'persistAsync').mockImplementationOnce(async () => {
      (store as any).stale = true;
      throw new Error('D1 unavailable');
    });
    const form = new FormData();
    form.append('file', new Blob(['%PDF new']), 'new.pdf');
    const res = await as('admin_root', `/api/attachments/document/${doc.id}`, { method: 'POST', body: form });
    expect(res.status).toBe(500);
    const rows = (await db.prepare("SELECT key FROM file_uploads WHERE original_name = 'new.pdf'").all<any>()).results;
    expect(rows).toEqual([]);
    expect(fs.existsSync(path.join(path.dirname(fileStorage.UPLOADS_DIR), sharedUp.file_key))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('D4 — Excel import identifies documents by register', () => {
  beforeEach(() => store.reset());

  function twoRegisters(n = 'SỐ-CHUNG-01') {
    const inc = store.createDocument({ document_number: n, title: 'Đến', doc_type: 'incoming', issue_date: '2026-01-01' } as any);
    const out = store.createDocument({ document_number: n.toLowerCase(), title: 'Đi', doc_type: 'outgoing', issue_date: '2026-01-01', status: 'Dự thảo' } as any);
    return { inc, out };
  }

  it('updates only the document of the stated register, and refuses an ambiguous row', async () => {
    const { inc, out } = twoRegisters();
    const rows = [{ document_number: 'SỐ-CHUNG-01', doc_type: 'outgoing', notes: 'cập nhật sổ đi' }];
    const preview = await json(await as('admin_root', '/api/documents/import/preview', send('POST', { rows })));
    expect(preview.rows[0]).toMatchObject({ action: 'update', id: out.id });
    await as('admin_root', '/api/documents/bulk-import', send('POST', { rows, confirm_updates: true, preview_token: preview.preview_token }));
    expect(store.getDocument(out.id)!.notes).toBe('cập nhật sổ đi');
    expect(store.getDocument(inc.id)!.notes ?? null).toBeNull();

    const ambiguous = await json(await as('admin_root', '/api/documents/import/preview', send('POST', { rows: [{ document_number: 'SỐ-CHUNG-01', notes: 'x' }] })));
    expect(ambiguous.rows[0].action).toBe('error');
    expect(ambiguous.rows[0].errors.join()).toMatch(/nhiều sổ/);
    const commit = await as('admin_root', '/api/documents/bulk-import', send('POST', { rows: [{ document_number: 'SỐ-CHUNG-01', notes: 'x' }], confirm_updates: true }));
    expect(commit.status).toBe(400);
  });

  it('a new row of another register does not merge into the existing document', async () => {
    const inc = store.createDocument({ document_number: 'CHỈ-ĐẾN-01', title: 'Đến', doc_type: 'incoming', issue_date: '2026-01-01' } as any);
    const rows = [{ document_number: 'CHỈ-ĐẾN-01', doc_type: 'outgoing', title: 'Đi mới' }];
    const preview = await json(await as('admin_root', '/api/documents/import/preview', send('POST', { rows })));
    expect(preview.rows[0].action).toBe('create');
    await as('admin_root', '/api/documents/bulk-import', send('POST', { rows }));
    expect(store.getDocument(inc.id)!.title).toBe('Đến');
    expect(store.getDocuments().filter((d) => d.document_number === 'CHỈ-ĐẾN-01').map((d) => d.doc_type).sort()).toEqual(['incoming', 'outgoing']);
  });

  it('an id from another register is refused', async () => {
    const { inc } = twoRegisters('SỐ-CHUNG-02');
    const preview = await json(await as('admin_root', '/api/documents/import/preview', send('POST', { rows: [{ id: inc.id, document_number: 'SỐ-CHUNG-02', doc_type: 'outgoing' }] })));
    expect(preview.rows[0].action).toBe('error');
  });

  it('round trip: re-importing an export changes nothing and keeps extra columns', async () => {
    const doc = store.getDocuments()[0];
    store.updateDocument(doc.id, { ['Cột riêng' as any]: 'giữ lại' } as any);
    await store.flush(await getDatabase());
    const exported = await json(await as('admin_root', '/api/documents'));
    const preview = await json(await as('admin_root', '/api/documents/import/preview', send('POST', { rows: exported })));
    expect(preview.summary.error).toBe(0);
    expect(preview.summary.update).toBe(0);
    expect(preview.summary.unchanged).toBe(exported.length);
    // a partial row updates only its columns
    const partial = [{ id: doc.id, document_number: doc.document_number, notes: 'chỉ ghi chú' }];
    const pp = await json(await as('admin_root', '/api/documents/import/preview', send('POST', { rows: partial })));
    await as('admin_root', '/api/documents/bulk-import', send('POST', { rows: partial, confirm_updates: true, preview_token: pp.preview_token }));
    const after = store.getDocument(doc.id)! as any;
    expect(after.notes).toBe('chỉ ghi chú');
    expect(after['Cột riêng']).toBe('giữ lại');
    expect(after.title).toBe(doc.title);
  });
});

// ---------------------------------------------------------------------------
describe('D5 — maintenance mode stops writes before any database access', () => {
  it('answers 503 without touching D1, keeps the health check', async () => {
    const spy = vi.spyOn(database, 'getDatabase');
    process.env.MAINTENANCE_MODE = '1';
    try {
      for (const [p, init] of [
        ['/api/documents', send('POST', { title: 'x' })],
        ['/api/auth/login', send('POST', { username: 'admin', password: 'x' })],
        ['/api/files/upload', { method: 'POST' }],
      ] as const) {
        const res = await anon(p, init as RequestInit);
        expect(res.status, p).toBe(503);
        expect((await json(res)).code).toBe('MAINTENANCE');
      }
      expect(spy).not.toHaveBeenCalled();
      expect((await anon('/api/health')).status).toBe(200);
    } finally {
      delete process.env.MAINTENANCE_MODE;
    }
  });

  it('wrangler.jsonc declares the variable off; the runbook locks writes before migrating', () => {
    const cfg = fs.readFileSync(path.join(process.cwd(), 'wrangler.jsonc'), 'utf-8');
    expect(cfg).toMatch(/"MAINTENANCE_MODE":\s*"0"/);
    const runbook = fs.readFileSync(path.join(process.cwd(), 'docs/ops/DEPLOY_RUNBOOK.md'), 'utf-8');
    const lock = runbook.indexOf('MAINTENANCE_MODE:1');
    const migrate = runbook.indexOf('npm run db:migrate:remote');
    const open = runbook.lastIndexOf('MAINTENANCE_MODE:0');
    expect(lock).toBeGreaterThan(-1);
    expect(lock).toBeLessThan(migrate);
    expect(open).toBeGreaterThan(migrate);
  });
});

// ---------------------------------------------------------------------------
describe('Should-fix items', () => {
  beforeEach(() => store.reset());

  it('workflow requirements hold when only handler/signer/doc_type change', async () => {
    const d = await json(await as('admin_root', '/api/documents', send('POST', { doc_type: 'incoming', document_number: 'ĐẾN-2026-0801', title: 'x', handler: 'A' })));
    expect(d.status).toBe('Đã phân công');
    const clear = await as('admin_root', `/api/documents/${d.id}`, send('PATCH', { handler: '' }));
    expect((await json(clear)).code).toBe('TRANSITION_FIELD_REQUIRED');
    const move = await as('admin_root', `/api/documents/${d.id}`, send('PATCH', { doc_type: 'outgoing' }));
    expect((await json(move)).code).toBe('STATUS_INVALID');
  });

  it('account and partner edits return the committed revision', async () => {
    const res = await json(await as('admin_root', '/api/users/user_viewer', send('PATCH', { department: 'Phòng mới' })));
    expect(res.revision).toBe(store.getUser('user_viewer')!.revision);
    const db = await getDatabase();
    expect((await db.prepare("SELECT revision FROM users WHERE id = 'user_viewer'").first<any>()).revision).toBe(res.revision);
    const p = store.getPartners()[0];
    const pr = await json(await as('admin_root', `/api/partners/${p.id}`, send('PATCH', { notes: 'x' })));
    expect((await db.prepare('SELECT revision FROM partners WHERE id = ?').bind(p.id).first<any>()).revision).toBe(pr.revision);
  });

  it('storage cleanup backlog: totals and paging', async () => {
    const db = await getDatabase();
    for (let i = 0; i < 5; i++) {
      await db.prepare("INSERT OR IGNORE INTO storage_cleanup (key, status, enqueued_at, attempts, last_error) VALUES (?, 'pending', ?, 1, 'boom')").bind(`uploads/bk_${i}.pdf`, `2026-01-0${i + 1}`).run();
    }
    const page = await json(await as('admin_root', '/api/admin/storage-cleanup?status=pending&limit=2&offset=0'));
    expect(page.counts.pending).toBeGreaterThanOrEqual(5);
    expect(page.counts.failing).toBeGreaterThanOrEqual(5);
    expect(page.rows).toHaveLength(2);
    const next = await json(await as('admin_root', '/api/admin/storage-cleanup?status=pending&limit=2&offset=2'));
    expect(next.rows[0].key).not.toBe(page.rows[0].key);
    await db.prepare("DELETE FROM storage_cleanup WHERE key LIKE 'uploads/bk_%'").run();
  });

  it('preflight: historical duplicates warn, duplicates created after the registry block', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sgii-pf8-'));
    const raw = new DatabaseSync(path.join(dir, 'db.sqlite'));
    applyLocalMigrations(raw);
    const db = __createNodeDatabaseForTests(raw);
    const data = withSeedDefaults(null);
    data.documents = [
      { ...data.documents[0], id: 'h1', document_number: 'CV-LS-1', doc_type: 'incoming', created_at: '2025-01-01' },
      { ...data.documents[0], id: 'h2', document_number: 'CV-LS-1', doc_type: 'incoming', created_at: '2025-01-02' },
    ];
    await importLegacyDataset(db, data, 'seed');
    const s = new MemoryStore();
    await s.sync(db, 'json'); // backfill records the historical duplicate
    const q = async (sql: string) => raw.prepare(sql).all();
    let report = await runPreflight(q, ALL);
    expect(report.blocking).toEqual([]);
    expect(report.info.registry_conflicts).toEqual([]);
    // an older build writes a third record with the same number after the backfill
    raw.exec(`INSERT INTO documents (id, document_number, title, doc_type, issue_date, created_at, updated_at) VALUES ('h3', 'cv-ls-1', 't', 'incoming', 'x', 'x', 'x')`);
    report = await runPreflight(q, ALL);
    expect(report.info.registry_conflicts.map((c: any) => c.record_id)).toEqual(['h3']);
    expect(report.blocking.join()).toMatch(/đã đăng ký cho hồ sơ khác/);
  });

  it('preflight blocks 0010 while active partners share a code', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sgii-pf9-'));
    const migDir = path.join(dir, 'm');
    fs.mkdirSync(migDir);
    for (const f of ALL.filter((f) => f < '0010')) fs.copyFileSync(path.join(MIGRATIONS_DIR, f), path.join(migDir, f));
    const raw = new DatabaseSync(path.join(dir, 'db.sqlite'));
    applyLocalMigrations(raw, migDir);
    raw.exec(`INSERT INTO partners (id, code, name_vn) VALUES ('p1', 'ABC', 'x'), ('p2', 'abc ', 'y')`);
    const report = await runPreflight(async (sql: string) => raw.prepare(sql).all(), ALL);
    expect(report.blocking.join()).toMatch(/mã đối tác trùng/);
    // a duplicate in the trash is fine
    raw.exec(`UPDATE partners SET deleted_at = 'x' WHERE id = 'p2'`);
    expect((await runPreflight(async (sql: string) => raw.prepare(sql).all(), ALL)).blocking.join()).not.toMatch(/mã đối tác trùng/);
    applyLocalMigrations(raw); // 0010 applies cleanly once resolved
  });
});
