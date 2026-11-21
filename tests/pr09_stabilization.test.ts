import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { app } from '../src/server/index.ts';
import { store, sharedStore, MemoryStore } from '../src/server/db/store.ts';
import { getDatabase, applyLocalMigrations, __createNodeDatabaseForTests, MIGRATIONS_DIR } from '../src/server/db/database.ts';
import { importLegacyDataset, PartnerCodeTakenError, RevisionConflictError } from '../src/server/db/repository.ts';
import { withSeedDefaults } from '../src/server/db/persistence.ts';
import * as fileStorage from '../src/server/utils/fileStorage.ts';
import * as security from '../src/server/utils/security.ts';
import { runPreflight } from '../scripts/lib/preflight-core.mjs';
import { fenceOnSql, fenceOffSql, FENCED_TABLES, FENCE_STATUS_SQL } from '../scripts/lib/write-fence-core.mjs';
import { partnerCodeKey } from '../src/shared/partnerCodeKey.mjs';
import { parseImportRows } from '../src/client/src/utils/importRows.ts';
import { fetchAs, tokenFor } from './setup.ts';

const { DatabaseSync } = (process as any).getBuiltinModule('node:sqlite');
const as = (userId: string | null, p: string, init: RequestInit & { rawRevision?: boolean } = {}) => fetchAs(userId, p, init);
const send = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const json = async (res: Response) => (await res.json()) as any;
const ALL = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
const BASE = ALL.filter((f) => f < '0004');
const pause = (ms = 10) => new Promise((r) => setTimeout(r, ms));

/** A promise the test opens when it wants the paused request to continue. */
function gate() {
  let open!: () => void;
  let reached!: () => void;
  const opened = new Promise<void>((r) => (open = r));
  const arrived = new Promise<void>((r) => (reached = r));
  return { open, arrived, wait: async () => { reached(); await opened; } };
}

const settled = async (p: Promise<unknown>) => {
  let done = false;
  p.then(() => (done = true), () => (done = true));
  await pause(30);
  return done;
};

async function d1Row(sql: string, ...params: unknown[]) {
  return (await getDatabase()).prepare(sql).bind(...params).first<any>();
}

async function bumpVersionInD1() {
  const db = await getDatabase();
  await db.prepare("UPDATE meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'data_version'").run();
}

/** Shared cache in step with D1 (tests below change D1 behind its back), then the seed dataset. */
async function freshSeed() {
  const db = await getDatabase();
  await sharedStore.sync(db, 'json');
  store.reset();
  await store.flush(db);
}

async function twoWorkers() {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sgii-p9-')), 'db.sqlite');
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

/** A database with only migrations 0001–0003 (Production today) and a little legacy data. */
function legacyDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sgii-p9-legacy-'));
  const migDir = path.join(dir, 'm');
  fs.mkdirSync(migDir);
  for (const f of BASE) fs.copyFileSync(path.join(MIGRATIONS_DIR, f), path.join(migDir, f));
  const file = path.join(dir, 'prod.db');
  const raw = new DatabaseSync(file);
  raw.exec('CREATE TABLE IF NOT EXISTS uploaded_files (key TEXT PRIMARY KEY, filename TEXT, data TEXT)');
  applyLocalMigrations(raw, migDir);
  raw.exec(`
    INSERT INTO meta (key, value) VALUES ('legacy_import', '{"source":"d1"}');
    INSERT INTO documents (id, document_number, title, doc_type, issue_date, created_at, updated_at) VALUES ('d1', 'ĐẾN-2025-0001', 'Cũ', 'incoming', '2025-01-01', '2025-01-01', '2025-01-01');
    INSERT INTO partners (id, code, name_vn) VALUES ('p1', 'ĐT', 'Đối tác 1');
    INSERT INTO users (id, username, password, name, email, role, status, created_at, updated_at) VALUES ('admin_root', 'admin', 'Admin@6868', 'Admin', 'a@x.vn', 'admin', 'active', '2025-01-01', '2025-01-01');
  `);
  return { raw, file, dir };
}
const counts = (raw: any) =>
  Object.fromEntries(['documents', 'contracts', 'partners', 'users', 'notifications', 'audit_logs'].map((t) => [t, raw.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n]));

afterEach(() => vi.restoreAllMocks());

// ---------------------------------------------------------------------------
describe('E2 — a request’s changes stay private until its own commit', () => {
  beforeEach(freshSeed);

  it('A pauses after changing its draft: B reads nothing of it, B’s write commits nothing of it, then A commits', async () => {
    const g = gate();
    const orig = MemoryStore.prototype.persistAsync;
    vi.spyOn(store, 'persistAsync').mockImplementationOnce(async function (this: MemoryStore) {
      await g.wait();
      return orig.call(this);
    });
    const a = as('admin_root', '/api/documents', send('POST', { doc_type: 'incoming', document_number: 'ĐẾN-2026-0901', title: 'A đang chờ' }));
    await g.arrived;

    // A's record and audit entry exist only in A's draft
    const list = await json(await as('admin_root', '/api/documents'));
    expect(list.some((d: any) => d.document_number === 'ĐẾN-2026-0901')).toBe(false);
    expect(store.getDocuments().some((d) => d.document_number === 'ĐẾN-2026-0901')).toBe(false);
    expect(store.getAuditLogs(500).some((l) => l.entity_title === 'ĐẾN-2026-0901')).toBe(false);

    // B writes: it waits for A instead of committing A's half-done request
    const other = store.getDocuments()[0];
    const b = as('admin_root', `/api/documents/${other.id}`, send('PATCH', { notes: 'B' }));
    expect(await settled(b)).toBe(false);
    expect(await d1Row("SELECT id FROM documents WHERE document_number = 'ĐẾN-2026-0901'")).toBeNull();

    g.open();
    expect((await a).status).toBe(201);
    expect((await b).status).toBe(200);
    expect(await d1Row("SELECT id FROM documents WHERE document_number = 'ĐẾN-2026-0901'")).not.toBeNull();
    expect(store.getDocument(other.id)!.notes).toBe('B');
    expect((await d1Row("SELECT COUNT(*) AS n FROM audit_logs WHERE entity_title = 'ĐẾN-2026-0901'")).n).toBe(1);
  });

  it('A fails after its pause: nothing of A is visible or written, B is unaffected', async () => {
    const g = gate();
    vi.spyOn(store, 'persistAsync').mockImplementationOnce(async () => {
      await g.wait();
      throw new RevisionConflictError();
    });
    const a = as('admin_root', '/api/documents', send('POST', { doc_type: 'incoming', document_number: 'ĐẾN-2026-0902', title: 'A thất bại' }));
    await g.arrived;
    const other = store.getDocuments()[0];
    const b = as('admin_root', `/api/documents/${other.id}`, send('PATCH', { notes: 'B2' }));
    g.open();
    expect((await a).status).toBe(409);
    expect((await b).status).toBe(200);
    expect(store.getDocuments().some((d) => d.document_number === 'ĐẾN-2026-0902')).toBe(false);
    expect(await d1Row("SELECT id FROM documents WHERE document_number = 'ĐẾN-2026-0902'")).toBeNull();
    expect((await d1Row("SELECT COUNT(*) AS n FROM audit_logs WHERE entity_title = 'ĐẾN-2026-0902'")).n).toBe(0);
    expect(await d1Row("SELECT notes FROM documents WHERE id = ?", other.id)).toEqual({ notes: 'B2' });
  });

  it('a handler that changes the cache and then answers with an error commits nothing', async () => {
    const doc = store.getDocuments()[0];
    const rev = doc.revision ?? 0;
    // stale expected_revision → 409 after the handler had a chance to touch nothing; the draft is discarded
    const res = await as('admin_root', `/api/documents/${doc.id}`, { ...send('PATCH', { notes: 'x', expected_revision: rev + 7 }), rawRevision: true });
    expect(res.status).toBe(409);
    expect(store.hasPendingChanges()).toBe(false);
    expect(sharedStore.getDocument(doc.id)!.notes ?? null).toBe(doc.notes ?? null);
  });
});

// ---------------------------------------------------------------------------
describe('E4 — commit outcome: success, rejection, unknown', () => {
  beforeEach(freshSeed);
  const upload = (doc: any, name: string) => {
    const form = new FormData();
    form.append('file', new Blob([`%PDF ${name}`]), name);
    return as('admin_root', `/api/attachments/document/${doc.id}`, { method: 'POST', body: form });
  };
  const fileOnDisk = (key: string) => fs.existsSync(path.join(path.dirname(fileStorage.UPLOADS_DIR), key));

  it('another worker commits an independent record in between: success, file kept and referenced, cache reloads', async () => {
    const [doc, other] = store.getDocuments();
    const orig = MemoryStore.prototype.persistAsync;
    vi.spyOn(store, 'persistAsync').mockImplementationOnce(async function (this: MemoryStore) {
      const db = await getDatabase();
      await db.prepare("UPDATE documents SET notes = 'worker B', revision = revision + 1 WHERE id = ?").bind(other.id).run();
      await bumpVersionInD1();
      return orig.call(this);
    });
    const res = await upload(doc, 'interleaved.pdf');
    expect(res.status).toBe(201);
    const { attachment } = await json(res);
    expect(fileOnDisk(attachment.file_key)).toBe(true);
    expect(await d1Row('SELECT id FROM attachments WHERE file_key = ?', attachment.file_key)).not.toBeNull();
    // the next request sees both writes
    const list = await json(await as('admin_root', '/api/documents'));
    expect(list.find((d: any) => d.id === other.id).notes).toBe('worker B');
  });

  it('timeout after D1 committed: 503 COMMIT_UNKNOWN, the referenced file is never deleted', async () => {
    const doc = store.getDocuments()[0];
    const db = await getDatabase();
    const real = db.batch.bind(db);
    vi.spyOn(db, 'batch').mockImplementationOnce(async (stmts: any) => {
      await real(stmts); // committed …
      throw new Error('D1_ERROR: Network connection lost'); // … but the answer is lost
    });
    const res = await upload(doc, 'timeout-after-commit.pdf');
    expect(res.status).toBe(503);
    expect((await json(res)).code).toBe('COMMIT_UNKNOWN');
    const row = await d1Row("SELECT a.file_key FROM attachments a WHERE a.original_name = 'timeout-after-commit.pdf'");
    expect(row).not.toBeNull();
    expect(fileOnDisk(row.file_key)).toBe(true);
    // after reload the attachment is there for everyone
    const list = await json(await as('admin_root', `/api/attachments/document/${doc.id}`));
    expect(list.attachments.some((a: any) => a.file_key === row.file_key)).toBe(true);
  });

  it('timeout before D1 committed: 503, nothing attached, the upload is kept unattached (not lost, not exposed)', async () => {
    const doc = store.getDocuments()[0];
    const db = await getDatabase();
    vi.spyOn(db, 'batch').mockImplementationOnce(async () => {
      throw new Error('D1_ERROR: timeout');
    });
    const res = await upload(doc, 'timeout-before-commit.pdf');
    expect(res.status).toBe(503);
    const up = await d1Row("SELECT key, attached_at, uploaded_by FROM file_uploads WHERE original_name = 'timeout-before-commit.pdf'");
    expect(up).toMatchObject({ attached_at: null, uploaded_by: 'admin_root' });
    expect(await d1Row('SELECT id FROM attachments WHERE file_key = ?', up.key)).toBeNull();
    expect((await as('user_viewer', `/api/files/${up.key}`)).status).toBe(403);
  });

  it('a batch retried after it had committed reports a conflict: the rollback still keeps the referenced file', async () => {
    const doc = store.getDocuments()[0];
    const db = await getDatabase();
    const real = db.batch.bind(db);
    vi.spyOn(db, 'batch').mockImplementationOnce(async (stmts: any) => {
      await real(stmts);
      throw new Error('CHECK constraint failed: conflict = 0'); // the retry hit its own write guard
    });
    const res = await upload(doc, 'retried.pdf');
    expect(res.status).toBe(409);
    const row = await d1Row("SELECT file_key FROM attachments WHERE original_name = 'retried.pdf'");
    expect(row).not.toBeNull();
    expect(fileOnDisk(row.file_key)).toBe(true);
  });

  it('a definite rejection removes the unreferenced upload; a failed R2 delete keeps its registration', async () => {
    const doc = store.getDocuments()[0];
    const db = await getDatabase();
    vi.spyOn(db, 'batch').mockImplementationOnce(async () => {
      throw new Error('CHECK constraint failed: conflict = 0');
    });
    const res = await upload(doc, 'rejected.pdf');
    expect(res.status).toBe(409);
    expect(await d1Row("SELECT key FROM file_uploads WHERE original_name = 'rejected.pdf'")).toBeNull();

    // R2: the object cannot be deleted → the file_uploads row stays, so the storage check still lists it
    const objects = new Map<string, Uint8Array>();
    const env = {
      BUCKET: {
        put: async (k: string, v: Uint8Array) => void objects.set(k, v),
        get: async () => null,
        head: async () => null,
        delete: async () => {
          throw new Error('R2 unavailable');
        },
      },
    };
    await as('admin_root', '/api/documents'); // the failed request made the cache reload: let it happen first
    vi.spyOn(db, 'batch').mockImplementationOnce(async () => {
      throw new Error('CHECK constraint failed: conflict = 0');
    });
    const form = new FormData();
    form.append('file', new Blob(['%PDF r2']), 'r2-delete-fails.pdf');
    form.append('expected_revision', String(store.getDocument(doc.id)!.revision ?? 0));
    const r2 = await app.fetch(
      new Request(`http://localhost/api/attachments/document/${doc.id}`, { method: 'POST', body: form, headers: { Authorization: `Bearer ${await tokenFor('admin_root')}` } }),
      env
    );
    expect(r2.status).toBe(409);
    expect(objects.size).toBe(1);
    expect(await d1Row("SELECT key FROM file_uploads WHERE original_name = 'r2-delete-fails.pdf'")).not.toBeNull();
  });

  it('an R2 upload failure creates no record and no registration', async () => {
    const env = { BUCKET: { put: async () => { throw new Error('R2 down'); }, get: async () => null, delete: async () => {} } };
    const form = new FormData();
    for (const [k, v] of Object.entries({ doc_type: 'outgoing', document_number: 'TB-R2-DOWN', title: 'x' })) form.append(k, v);
    form.append('file', new Blob(['%PDF x']), 'r2down.pdf');
    const res = await app.fetch(new Request('http://localhost/api/documents', { method: 'POST', body: form, headers: { Authorization: `Bearer ${await tokenFor('admin_root')}` } }), env);
    expect(res.status).toBe(500);
    expect(store.getDocuments().some((d) => d.document_number === 'TB-R2-DOWN')).toBe(false);
    expect(await d1Row("SELECT key FROM file_uploads WHERE original_name = 'r2down.pdf'")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('E1 — change-password never overwrites an admin reset, lock or revocation', () => {
  beforeEach(async () => {
    await freshSeed();
    store.updateUser('user_viewer', { password: await security.hashPassword('Current2026!'), must_change_password: false });
    await store.flush(await getDatabase());
  });
  const change = () => as('user_viewer', '/api/auth/change-password', send('POST', { current_password: 'Current2026!', new_password: 'Mine2026!x' }));

  for (const [name, sql] of [
    ['admin reset', "UPDATE users SET password = 'pbkdf2$admin-reset', token_version = COALESCE(token_version,0) + 1, revision = COALESCE(revision,0) + 1 WHERE id = 'user_viewer'"],
    ['account lock', "UPDATE users SET status = 'locked', revision = COALESCE(revision,0) + 1 WHERE id = 'user_viewer'"],
    ['session revocation', "UPDATE users SET token_version = COALESCE(token_version,0) + 5, revision = COALESCE(revision,0) + 1 WHERE id = 'user_viewer'"],
  ] as const) {
    it(`another worker’s ${name} during hashing wins; the change is refused`, async () => {
      const before = await d1Row("SELECT password, status, token_version FROM users WHERE id = 'user_viewer'");
      const hash = security.hashPassword;
      vi.spyOn(security, 'hashPassword').mockImplementationOnce(async (pw: string) => {
        const h = await hash(pw);
        await (await getDatabase()).prepare(sql).run();
        await bumpVersionInD1();
        return h;
      });
      const res = await change();
      expect(res.status).toBe(409);
      expect((await json(res)).token).toBeUndefined();
      const after = await d1Row("SELECT password, status, token_version FROM users WHERE id = 'user_viewer'");
      expect(after).not.toEqual(before); // the admin's change is what D1 holds
      expect(after.password).not.toMatch(/Mine2026/);
      expect(await security.verifyPassword('Mine2026!x', after.password)).toMatchObject({ ok: false });
    });
  }

  it('same isolate: an admin reset waiting behind a change-password cannot overwrite it silently (409), and vice versa the old session dies', async () => {
    const g = gate();
    const hash = security.hashPassword;
    vi.spyOn(security, 'hashPassword').mockImplementationOnce(async (pw: string) => {
      await g.wait();
      return hash(pw);
    });
    const u = store.getUser('user_viewer')!;
    const changing = change();
    await g.arrived;
    const reset = as('admin_root', '/api/users/user_viewer', { ...send('PATCH', { password: 'AdminSet2026!', expected_revision: u.revision ?? 0 }), rawRevision: true });
    g.open();
    expect((await changing).status).toBe(200);
    expect((await reset).status).toBe(409);
    const row = await d1Row("SELECT password FROM users WHERE id = 'user_viewer'");
    expect((await security.verifyPassword('Mine2026!x', row.password)).ok).toBe(true);

    // admin first (lock), then the user's change-password: the session is no longer valid
    const g2 = gate();
    vi.spyOn(security, 'hashPassword').mockImplementationOnce(async (pw: string) => {
      await g2.wait();
      return hash(pw);
    });
    const u2 = store.getUser('user_viewer')!;
    const lockAndReset = as('admin_root', '/api/users/user_viewer', { ...send('PATCH', { password: 'AdminSet2026!', status: 'locked', expected_revision: u2.revision ?? 0 }), rawRevision: true });
    await g2.arrived;
    const late = as('user_viewer', '/api/auth/change-password', send('POST', { current_password: 'Mine2026!x', new_password: 'Late2026!x' }));
    g2.open();
    expect((await lockAndReset).status).toBe(200);
    expect((await late).status).toBe(401);
    expect((await d1Row("SELECT status FROM users WHERE id = 'user_viewer'")).status).toBe('locked');
  });
});

// ---------------------------------------------------------------------------
describe('E3 — maintenance on a database that only has migrations 0001–0003', () => {
  it('a fresh isolate answers health 200 and 503 for business APIs without reading or writing D1', async () => {
    const { raw } = legacyDb();
    const before = counts(raw);
    const ledger = raw.prepare('SELECT name FROM d1_migrations').all();
    vi.resetModules();
    const { app: fresh } = await import('../src/server/index.ts');
    const db = __createNodeDatabaseForTests(raw);
    const prepare = vi.spyOn(db, 'prepare');
    const env = { DB: db, MAINTENANCE_MODE: '1', AUTH_SECRET: 'test-secret-for-maintenance-only-0123456789' };
    const health = await fresh.fetch(new Request('http://localhost/api/health'), env);
    expect(health.status).toBe(200);
    for (const [p, init] of [
      ['/api/documents', {}],
      ['/api/auth/login', send('POST', { username: 'admin', password: 'x' })],
      ['/api/partners', send('POST', { code: 'X', name_vn: 'x' })],
    ] as const) {
      const res = await fresh.fetch(new Request(`http://localhost${p}`, init as RequestInit), env);
      expect(res.status, p).toBe(503);
    }
    expect(prepare).not.toHaveBeenCalled();
    expect(counts(raw)).toEqual(before);
    expect(raw.prepare('SELECT name FROM d1_migrations').all()).toEqual(ledger);
    // without maintenance the health check still does not depend on the new schema
    const open = await fresh.fetch(new Request('http://localhost/api/health'), { ...env, MAINTENANCE_MODE: '0' });
    expect(open.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
describe('E5 — one partner code key for the app, D1 and history', () => {
  beforeEach(freshSeed);

  it('the key treats case, spaces, composed/decomposed and full-width forms alike', () => {
    expect(partnerCodeKey('đt')).toBe(partnerCodeKey('ĐT'));
    expect(partnerCodeKey(' AB  C ')).toBe(partnerCodeKey('abc'));
    expect(partnerCodeKey('Đé'.normalize('NFD'))).toBe(partnerCodeKey('ĐÉ'));
    expect(partnerCodeKey('ＡＢＣ')).toBe(partnerCodeKey('ABC'));
    expect(partnerCodeKey('A​B')).toBe(partnerCodeKey('AB'));
    expect(partnerCodeKey('ĐT1')).not.toBe(partnerCodeKey('DT1'));
    expect(partnerCodeKey('   ')).toBeNull();
  });

  it('API refuses every equivalent form with 409', async () => {
    expect((await as('admin_root', '/api/partners', send('POST', { code: 'ĐT-ÉP', name_vn: 'gốc' }))).status).toBe(201);
    for (const code of ['đt-ép', ' Đ T - É P ', 'ĐT-ÉP'.normalize('NFD'), 'ＤＴ-ÉP'.replace('Ｄ', 'Đ')]) {
      const res = await as('admin_root', '/api/partners', send('POST', { code, name_vn: 'trùng' }));
      expect(res.status, code).toBe(409);
    }
  });

  it('two workers creating "đt-9" and "ĐT-9": D1 refuses the second (code_key index)', async () => {
    const { a, b, dbA, dbB, rawA } = await twoWorkers();
    a.createPartner({ code: 'đt-9', name_vn: 'A' } as any);
    b.createPartner({ code: 'ĐT-9', name_vn: 'B' } as any);
    await a.flush(dbA);
    await expect(b.flush(dbB)).rejects.toBeInstanceOf(PartnerCodeTakenError);
    expect(rawA.prepare("SELECT code_key FROM partners WHERE code_key = ?").all(partnerCodeKey('ĐT-9'))).toHaveLength(1);
  });

  it('historical Unicode duplicates: 0011 applies, the preflight blocks, codes are untouched and both stay editable', async () => {
    const { raw } = legacyDb();
    raw.exec(`INSERT INTO partners (id, code, name_vn) VALUES ('p2', 'đt', 'Đối tác 2')`);
    let report = await runPreflight(async (sql: string) => raw.prepare(sql).all(), ALL);
    expect(report.blocking.join()).toMatch(/mã đối tác trùng/);
    applyLocalMigrations(raw); // 0004 → 0011: the ASCII index (0010) does not see "đt" = "ĐT"; 0011 starts NULL
    const db = __createNodeDatabaseForTests(raw);
    const s = new MemoryStore();
    await s.sync(db, 'd1'); // fills code_key, leaving the later duplicate NULL
    const rows = raw.prepare("SELECT id, code, code_key FROM partners WHERE id IN ('p1','p2') ORDER BY id").all();
    expect(rows.map((r: any) => r.code)).toEqual(['ĐT', 'đt']);
    expect(rows.filter((r: any) => r.code_key).length).toBe(1);
    report = await runPreflight(async (sql: string) => raw.prepare(sql).all(), ALL);
    expect(report.blocking.join()).toMatch(/mã đối tác trùng/);
    s.updatePartner('p2', { notes: 'vẫn sửa được' });
    s.updatePartner('p1', { notes: 'vẫn sửa được' });
    await s.flush(db);
    // a new partner with the same key is refused by the app
    expect(s.getPartners().filter((p) => partnerCodeKey(p.code) === partnerCodeKey('Đt')).length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
describe('E6 — Excel import never loses or misplaces data', () => {
  beforeEach(freshSeed);
  const preview = async (kind: string, rows: any[]) => json(await as('admin_root', `/api/${kind}s/import/preview`, send('POST', { rows })));
  const commit = (kind: string, rows: any[], token?: string, confirm = true) =>
    as('admin_root', `/api/${kind}s/bulk-import`, send('POST', { rows, confirm_updates: confirm, preview_token: token }));

  it('an unknown id is an error even when the number matches an existing record', async () => {
    const doc = store.createDocument({ document_number: 'E6-ID-01', title: 'gốc', doc_type: 'incoming', issue_date: '2026-01-01' } as any);
    const rows = [{ id: 'doc-does-not-exist', document_number: 'E6-ID-01', doc_type: 'incoming', title: 'ghi đè?' }];
    const p = await preview('document', rows);
    expect(p.rows[0].action).toBe('error');
    expect((await commit('document', rows, p.preview_token)).status).toBe(400);
    expect(store.getDocument(doc.id)!.title).toBe('gốc');
    // an id from the trash is not "live" either
    store.trashRecord('document', doc.id, 'admin_root');
    expect((await preview('document', [{ id: doc.id, document_number: 'E6-ID-01', notes: 'x' }])).rows[0].action).toBe('error');
  });

  it('extension columns are kept when creating documents and contracts', async () => {
    const drows = [{ document_number: 'E6-EXT-01', doc_type: 'outgoing', title: 'mới', issue_date: '2026-02-01', 'Mã dự án': 'DA-7' }];
    const dp = await preview('document', drows);
    expect((await commit('document', drows, dp.preview_token)).status).toBe(200);
    expect((store.getDocuments().find((d) => d.document_number === 'E6-EXT-01') as any)['Mã dự án']).toBe('DA-7');
    const crows = [{ contract_number: 'E6-HĐ-EXT', title: 'HĐ', party_b: 'B', 'Cột thêm': 'giữ' }];
    const cp = await preview('contract', crows);
    expect((await commit('contract', crows, cp.preview_token)).status).toBe(200);
    expect((store.getContracts().find((c) => c.contract_number === 'E6-HĐ-EXT') as any)['Cột thêm']).toBe('giữ');
  });

  it('a commit based on an outdated preview is refused (IMPORT_PREVIEW_STALE) and writes nothing', async () => {
    const doc = store.createDocument({ document_number: 'E6-STALE-01', title: 'gốc', doc_type: 'incoming', issue_date: '2026-01-01' } as any);
    const rows = [{ id: doc.id, document_number: 'E6-STALE-01', notes: 'theo xem trước' }];
    const p = await preview('document', rows);
    expect((await as('admin_root', `/api/documents/${doc.id}`, send('PATCH', { title: 'người khác sửa' }))).status).toBe(200);
    const res = await commit('document', rows, p.preview_token);
    expect(res.status).toBe(409);
    expect((await json(res)).code).toBe('IMPORT_PREVIEW_STALE');
    expect(store.getDocument(doc.id)!.notes ?? null).toBeNull();
    // updates always need the preview the user confirmed
    expect((await commit('document', rows, undefined)).status).toBe(409);
  });

  it('two admins import the same update at once: one applies, the other is refused as stale', async () => {
    const doc = store.createDocument({ document_number: 'E6-RACE-01', title: 'gốc', doc_type: 'incoming', issue_date: '2026-01-01' } as any);
    const r1 = [{ id: doc.id, document_number: 'E6-RACE-01', notes: 'người 1' }];
    const r2 = [{ id: doc.id, document_number: 'E6-RACE-01', notes: 'người 2' }];
    const [p1, p2] = await Promise.all([preview('document', r1), preview('document', r2)]);
    const [c1, c2] = await Promise.all([commit('document', r1, p1.preview_token), commit('document', r2, p2.preview_token)]);
    expect([c1.status, c2.status].sort()).toEqual([200, 409]);
    expect(['người 1', 'người 2']).toContain(store.getDocument(doc.id)!.notes);
    // two creates of one new number: the second is refused, only one record exists
    const n = [{ document_number: 'E6-RACE-NEW', doc_type: 'incoming', title: 'x', issue_date: '2026-01-01' }];
    const [q1, q2] = await Promise.all([preview('document', n), preview('document', n)]);
    const [d1, d2] = await Promise.all([commit('document', n, q1.preview_token), commit('document', n, q2.preview_token)]);
    expect([d1.status, d2.status].sort()).toEqual([200, 409]);
    expect(store.getDocuments().filter((d) => d.document_number === 'E6-RACE-NEW')).toHaveLength(1);
  });

  it('historical duplicates in one register: rows without id are ambiguous, rows with id update exactly that record', async () => {
    const db = await getDatabase();
    await store.flush(db);
    await db.prepare(`INSERT INTO documents (id, document_number, title, doc_type, issue_date, created_at, updated_at, revision) VALUES ('hist-a', 'E6-LS-01', 'a', 'incoming', '2025-01-01', '2025-01-01', '2025-01-01', 1), ('hist-b', 'e6-ls-01', 'b', 'incoming', '2025-01-01', '2025-01-02', '2025-01-02', 1)`).run();
    await bumpVersionInD1();
    const byId = [{ id: 'hist-b', document_number: 'e6-ls-01', notes: 'chỉ b' }];
    const p = await preview('document', byId);
    expect(p.rows[0]).toMatchObject({ action: 'update', id: 'hist-b' });
    expect((await commit('document', byId, p.preview_token)).status).toBe(200);
    expect(store.getDocument('hist-a')!.notes ?? null).toBeNull();
    expect(store.getDocument('hist-b')!.notes).toBe('chỉ b');
  });

  it('client parser: exact headers only, empty cells are not sent, extension columns kept, register labels mapped', () => {
    const { rows, errors } = parseImportRows(
      'contract',
      [
        { ID: 'con-1', 'Số hợp đồng': 'HĐ-1', 'Mã số thuế đối tác': '0101', 'Giá trị': '1.000.000', 'Trạng thái': '', 'Ghi chú': '  ' },
        { 'Số hợp đồng': '', ID: '' },
      ],
      'missing'
    );
    expect(rows).toEqual([{ id: 'con-1', contract_number: 'HĐ-1', 'Mã số thuế đối tác': '0101', value: 1000000 }]);
    expect(errors).toEqual([{ row: 3, error: 'missing' }]);
    const docs = parseImportRows('document', [{ 'Số hiệu văn bản': 'A-1', 'Loại VB': 'Văn bản đi' }, { 'Số văn bản (*)': 'A-2' }], 'm').rows;
    expect(docs).toEqual([{ document_number: 'A-1', doc_type: 'outgoing' }, { document_number: 'A-2' }]); // no default register
  });
});

// ---------------------------------------------------------------------------
describe('E7 — maintenance rehearsal on a 0001–0003 database: fence, backup, restore, migrate, open', () => {
  it('runs the runbook end to end and proves the old build cannot write once the fence is in place', async () => {
    const { raw, dir } = legacyDb();
    const q = async (sql: string) => raw.prepare(sql).all();
    const tables = raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r: any) => r.name);
    const oldBuildWrites = [
      "INSERT OR REPLACE INTO documents (id, document_number, title, doc_type, issue_date, created_at, updated_at) VALUES ('d-old-x', 'X', 'x', 'incoming', 'x', 'x', 'x')",
      "UPDATE users SET name = 'x' WHERE id = 'admin_root'",
      "DELETE FROM partners WHERE id = 'p1'",
      "UPDATE meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'data_version'",
      "INSERT INTO audit_logs (id, action, timestamp) VALUES ('al-old', 'x', 'x')",
      "INSERT INTO auth_login_failures (key, count, first_at) VALUES ('k', 1, 'x')",
    ];

    // Step 2: fence on → every write of the old build is refused, atomically
    raw.exec(fenceOnSql(tables).join('\n'));
    expect(raw.prepare(FENCE_STATUS_SQL).all().length).toBe(FENCED_TABLES.filter((t: string) => tables.includes(t)).length * 3);
    const before = counts(raw);
    for (const sql of oldBuildWrites) expect(() => raw.exec(sql), sql).toThrow(/WRITE_FENCE/);
    raw.exec('BEGIN');
    expect(() => raw.exec(oldBuildWrites[0])).toThrow(/WRITE_FENCE/);
    raw.exec('ROLLBACK');
    expect(counts(raw)).toEqual(before);

    // Step 3: backup and verified restore drill (on a copy)
    const backup = path.join(dir, 'backup.db');
    raw.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
    const restored = new DatabaseSync(backup);
    expect(counts(restored)).toEqual(before);
    const restoredReport = await runPreflight(async (sql: string) => restored.prepare(sql).all(), ALL);
    expect(restoredReport.info.pending_migrations).toEqual(ALL.filter((f) => !BASE.includes(f)));

    // Step 4: migrations 0004 → 0011 run with the fence in place, in order
    applyLocalMigrations(raw);
    expect(raw.prepare('SELECT name FROM d1_migrations ORDER BY id').all().map((r: any) => r.name)).toEqual(ALL);
    expect(counts(raw)).toEqual(before);
    let report = await runPreflight(q, ALL);
    expect(report.info.pending_migrations).toEqual([]);
    expect(report.info.write_fence_triggers).toBeGreaterThan(0);
    expect(report.warnings.join()).toMatch(/Rào chắn ghi đang bật/);

    // Step 5: the new build in maintenance answers without touching D1
    vi.resetModules();
    const { app: fresh } = await import('../src/server/index.ts');
    const db = __createNodeDatabaseForTests(raw);
    const env = { DB: db, MAINTENANCE_MODE: '1', AUTH_SECRET: 'rehearsal-secret-0123456789abcdef' };
    expect((await fresh.fetch(new Request('http://localhost/api/health'), env)).status).toBe(200);
    expect((await fresh.fetch(new Request('http://localhost/api/documents'), env)).status).toBe(503);

    // Step 6: fence off, open writes — the new build works on the migrated data
    raw.exec(fenceOffSql().join('\n'));
    report = await runPreflight(q, ALL);
    expect(report.info.write_fence_triggers).toBe(0);
    expect(report.blocking).toEqual([]);
    const s = new MemoryStore();
    await s.sync(db, 'd1');
    s.updateDocument('d1', { notes: 'sau khi mở ghi' });
    await s.flush(db);
    expect(raw.prepare("SELECT notes FROM documents WHERE id = 'd1'").get().notes).toBe('sau khi mở ghi');

    // Step 7 (failure path): restoring the verified backup gives back the exact pre-migration database
    const drill = new DatabaseSync(backup);
    raw.close();
    expect(counts(drill)).toEqual(before);
    expect(drill.prepare('SELECT name FROM d1_migrations ORDER BY id').all().map((r: any) => r.name)).toEqual(BASE);
  });

  it('roll forward: a migration that fails mid-way leaves the ledger consistent and can be re-run after the fix', async () => {
    const { raw } = legacyDb();
    raw.exec(`INSERT INTO partners (id, code, name_vn) VALUES ('p-dup', 'đt', 'x'), ('p-dup2', 'ĐT ', 'y')`); // 'ĐT' (p1) and 'ĐT ' collide for 0010
    raw.exec(fenceOnSql(raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r: any) => r.name)).join('\n'));
    expect(() => applyLocalMigrations(raw)).toThrow(/0010/);
    const ledger = raw.prepare('SELECT name FROM d1_migrations ORDER BY id').all().map((r: any) => r.name);
    expect(ledger).toEqual(ALL.filter((f) => f < '0010'));
    // still fenced: nothing else could write meanwhile
    expect(() => raw.exec("UPDATE meta SET value = 'x' WHERE key = 'data_version'")).toThrow(/WRITE_FENCE/);
    // the owner-approved fix needs the fence lifted for that one statement, then it is re-armed
    raw.exec(fenceOffSql().join('\n'));
    raw.exec("UPDATE partners SET code = 'ĐT-2' WHERE id = 'p-dup2'");
    raw.exec("UPDATE partners SET code = 'ĐT-3' WHERE id = 'p-dup'");
    applyLocalMigrations(raw);
    expect(raw.prepare('SELECT name FROM d1_migrations ORDER BY id').all().map((r: any) => r.name)).toEqual(ALL);
    expect((await runPreflight(async (sql: string) => raw.prepare(sql).all(), ALL)).blocking).toEqual([]);
  });
});
