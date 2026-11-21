import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { app } from '../src/server/index.ts';
import { store, MemoryStore } from '../src/server/db/store.ts';
import { getDatabase, applyLocalMigrations, __createNodeDatabaseForTests } from '../src/server/db/database.ts';
import { importLegacyDataset, NumberConflictError, RevisionConflictError } from '../src/server/db/repository.ts';
import { withSeedDefaults } from '../src/server/db/persistence.ts';
import { fetchAs, tokenFor } from './setup.ts';

const { DatabaseSync } = (process as any).getBuiltinModule('node:sqlite');

const as = (userId: string | null, p: string, init: RequestInit & { rawRevision?: boolean } = {}) => fetchAs(userId, p, init);
const send = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const json = async (res: Response) => (await res.json()) as any;
const raw = (method: string, body: unknown) => ({ ...send(method, body), rawRevision: true });

function makeUser(username: string, extra: Record<string, any> = {}) {
  return store.createUser({ username, password: 'x', name: `Tên ${username}`, email: `${username}@x.vn`, role: 'user', ...extra }).id;
}

async function upload(userId: string, name = 'a.pdf', content = '%PDF x') {
  const form = new FormData();
  form.append('file', new Blob([content]), name);
  return json(await as(userId, '/api/files/upload', { method: 'POST', body: form }));
}

/** Two independent connections to one SQLite file: what two Worker isolates on one D1 look like. */
function twoIsolates() {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sgii-iso-')), 'db.sqlite');
  const rawA = new DatabaseSync(file);
  applyLocalMigrations(rawA);
  const rawB = new DatabaseSync(file);
  const dbA = __createNodeDatabaseForTests(rawA);
  const dbB = __createNodeDatabaseForTests(rawB);
  return { rawA, rawB, dbA, dbB };
}

// ---------------------------------------------------------------------------
describe('B1 — notifications never leak records the user cannot read now', () => {
  beforeEach(() => store.reset());

  function notifyAbout(docId: string, recipientUserId: string | null) {
    return store.addNotification({ title: 'Giao việc: SỐ-BÍ-MẬT', message: 'Nội dung mật', type: 'document', target_id: docId, target_type: 'document', recipient_user_id: recipientUserId } as any);
  }
  const titles = async (userId: string) => (await json(await as(userId, '/api/notifications'))).notifications.map((n: any) => n.id);

  it('hides a notification once the document becomes confidential, is trashed or purged', async () => {
    const alice = makeUser('alice1');
    const doc = store.getDocuments()[0];
    const n = notifyAbout(doc.id, alice);
    expect(await titles(alice)).toContain(n.id);

    store.updateDocument(doc.id, { security_level: 'Mật' });
    expect(await titles(alice)).not.toContain(n.id);
    store.updateDocument(doc.id, { security_level: 'Thường' });

    store.trashRecord('document', doc.id, 'admin_root');
    expect(await titles(alice)).not.toContain(n.id); // used to be shown because the target was "not found"
    expect(await titles('admin_root')).not.toContain(n.id); // not addressed to the admin either

    store.purgeRecord('document', doc.id);
    expect(await titles(alice)).not.toContain(n.id);
    expect((await as(alice, `/api/notifications/${n.id}/read`, { method: 'PATCH' })).status).toBe(404);
  });

  it('follows revoked labor-contract access', async () => {
    const hr = makeUser('hr_n', { can_access_labor_contracts: true });
    const labor = store.getContracts().find((c) => c.contract_type === 'labor') ??
      store.createContract({ contract_number: 'HĐLĐ-N1', title: 'x', contract_type: 'labor', party_a: 'A', party_b: 'B', signed_date: '2026-01-01', start_date: '2026-01-01', status: 'active', value: 0, currency: 'VND' } as any);
    const n = store.addNotification({ title: 'HĐLĐ', message: 'lương', type: 'contract', target_id: labor.id, target_type: 'contract', recipient_user_id: hr } as any);
    expect(await titles(hr)).toContain(n.id);
    store.updateUser(hr, { can_access_labor_contracts: false });
    expect(await titles(hr)).not.toContain(n.id);
  });

  it('keeps legacy notifications without a recipient admin-only, and admins only see readable targets', async () => {
    const doc = store.getDocuments()[0];
    const legacy = notifyAbout(doc.id, null);
    expect(await titles('admin_root')).toContain(legacy.id);
    expect(await titles('user_viewer')).not.toContain(legacy.id);
  });

  it('assigns legacy notifications only on an unambiguous name match (dry run by default)', async () => {
    makeUser('uniq_person', { name: 'Người Duy Nhất' });
    makeUser('dup1', { name: 'Trùng Tên' });
    makeUser('dup2', { name: 'Trùng Tên' });
    const a = store.addNotification({ title: 'A', message: '', type: 'system', recipient: 'Người Duy Nhất' } as any);
    const b = store.addNotification({ title: 'B', message: '', type: 'system', recipient: 'Trùng Tên' } as any);
    // new notifications with a unique name are already addressed; force the legacy shape
    store.getNotifications().find((n) => n.id === a.id)!.recipient_user_id = null;
    const dry = await json(await as('admin_root', '/api/notifications/assign-legacy', { method: 'POST' }));
    expect(dry.applied).toBe(false);
    expect(dry.assigned.map((x: any) => x.id)).toContain(a.id);
    expect(dry.unresolved.find((x: any) => x.id === b.id).reason).toBe('ambiguous');
    expect(store.getNotifications().find((n) => n.id === a.id)!.recipient_user_id).toBeNull();
    await as('admin_root', '/api/notifications/assign-legacy?apply=1', { method: 'POST' });
    expect(store.getNotifications().find((n) => n.id === a.id)!.recipient_user_id).toBeTruthy();
    expect(store.getNotifications().find((n) => n.id === b.id)!.recipient_user_id ?? null).toBeNull();
    expect((await as('user_viewer', '/api/notifications/assign-legacy', { method: 'POST' })).status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
describe('B2 — file access follows the records, not the uploader', () => {
  beforeEach(() => store.reset());

  async function laborWithOwnFile(hr: string) {
    const up = await upload(hr, 'luong.pdf');
    const res = await as(hr, '/api/contracts', send('POST', { contract_number: `HĐLĐ-F-${Date.now()}`, title: 'HĐLĐ', contract_type: 'labor', party_a: 'A', party_b: 'B', signed_date: '2026-01-01', start_date: '2026-01-01', file_key: up.file_key }));
    expect(res.status).toBe(201);
    return { contract: await json(res), key: up.file_key as string };
  }

  it('does not give the uploader access back when the record is trashed; restore brings it back', async () => {
    const hr = makeUser('hr_f1', { can_access_labor_contracts: true });
    const { contract, key } = await laborWithOwnFile(hr);
    expect((await as(hr, `/api/files/${key}`)).status).toBe(200);
    await as('admin_root', `/api/contracts/${contract.id}`, { method: 'DELETE' });
    expect((await as(hr, `/api/files/${key}`)).status).toBe(403);
    expect((await as('admin_root', `/api/files/${key}`)).status).toBe(200);
    await as('admin_root', `/api/trash/contract/${contract.id}/restore`, { method: 'POST' });
    expect((await as(hr, `/api/files/${key}`)).status).toBe(200);
  });

  it('removing an attachment ends non-admin access to it', async () => {
    const hr = makeUser('hr_f2', { can_access_labor_contracts: true });
    const { contract, key } = await laborWithOwnFile(hr);
    const atts = (await json(await as(hr, `/api/attachments/contract/${contract.id}`))).attachments;
    const del = await as(hr, `/api/attachments/${atts[0].id}`, { method: 'DELETE' });
    expect(del.status).toBe(200);
    expect((await as(hr, `/api/files/${key}`)).status).toBe(403);
    // and it cannot be attached again by a non-admin
    const again = await as(hr, `/api/contracts/${contract.id}`, send('PATCH', { file_key: key }));
    expect(again.status).toBe(403);
  });

  it('follows revoked access and keeps old versions readable for those who may read the record', async () => {
    const hr = makeUser('hr_f3', { can_access_labor_contracts: true });
    const { contract, key } = await laborWithOwnFile(hr);
    const atts = (await json(await as(hr, `/api/attachments/contract/${contract.id}`))).attachments;
    const form = new FormData();
    form.append('file', new Blob(['%PDF v2']), 'luong-v2.pdf');
    form.append('replaces', atts[0].id);
    expect((await as(hr, `/api/attachments/contract/${contract.id}`, { method: 'POST', body: form })).status).toBe(201);
    expect((await as(hr, `/api/files/${key}`)).status).toBe(200); // version 1 still readable
    store.updateUser(hr, { can_access_labor_contracts: false });
    expect((await as(hr, `/api/files/${key}`)).status).toBe(403);
  });

  it('a fresh upload stays private to its uploader; permanent delete keeps files other records use', async () => {
    const hr = makeUser('hr_f4', { can_access_labor_contracts: true });
    const other = makeUser('hr_f5', { can_access_labor_contracts: true });
    const up = await upload(hr);
    expect((await as(hr, `/api/files/${up.file_key}`)).status).toBe(200);
    expect((await as(other, `/api/files/${up.file_key}`)).status).toBe(403);

    const docs = store.getDocuments();
    store.updateDocument(docs[0].id, { file_key: up.file_key });
    store.updateDocument(docs[1].id, { file_key: up.file_key });
    await as('admin_root', `/api/documents/${docs[0].id}`, { method: 'DELETE' });
    const purge = await json(await as('admin_root', `/api/trash/document/${docs[0].id}`, { method: 'DELETE' }));
    expect(purge.removed_files).toEqual([]);
    expect((await as('admin_root', `/api/files/${up.file_key}`)).status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
describe('B3 — numbers are unique in the database, across isolates', () => {
  afterEach(() => vi.useRealTimers());

  it('refuses the same manual document number from two independent connections', async () => {
    const { rawA, dbA, dbB } = twoIsolates();
    await importLegacyDataset(dbA, withSeedDefaults(null), 'seed');
    const a = new MemoryStore();
    const b = new MemoryStore();
    await a.sync(dbA, 'json');
    await b.sync(dbB, 'json');
    a.createDocument({ document_number: 'TB-01/2026', title: 'A', doc_type: 'outgoing', issue_date: '2026-01-01' } as any);
    b.createDocument({ document_number: ' tb-01/2026 ', title: 'B', doc_type: 'outgoing', issue_date: '2026-01-01' } as any);
    await a.flush(dbA);
    await expect(b.flush(dbB)).rejects.toBeInstanceOf(NumberConflictError);
    const rows = rawA.prepare("SELECT COUNT(*) AS n FROM documents WHERE lower(trim(document_number)) = 'tb-01/2026'").get();
    expect(rows.n).toBe(1);
    // the same number in another register (incoming) is allowed
    await b.sync(dbB, 'json');
    b.createDocument({ document_number: 'TB-01/2026', title: 'C', doc_type: 'incoming', issue_date: '2026-01-01' } as any);
    await b.flush(dbB);
  });

  it('refuses a contract renumbered to a number another isolate just used', async () => {
    const { dbA, dbB } = twoIsolates();
    await importLegacyDataset(dbA, withSeedDefaults(null), 'seed');
    const a = new MemoryStore();
    const b = new MemoryStore();
    await a.sync(dbA, 'json');
    await b.sync(dbB, 'json');
    const [c1, c2] = b.getContracts();
    a.createContract({ contract_number: 'HĐ-ISO-1', title: 'A', contract_type: 'service', party_a: 'A', party_b: 'B', signed_date: '2026-01-01', start_date: '2026-01-01', status: 'active', value: 0, currency: 'VND' } as any);
    await a.flush(dbA);
    b.updateContract(c1.id, { contract_number: 'HĐ-ISO-1' });
    await expect(b.flush(dbB)).rejects.toBeInstanceOf(NumberConflictError);
    // numbers are never released: renumbering keeps the old number reserved for good (C5)
    await b.sync(dbB, 'json');
    const old = b.getContract(c2.id)!.contract_number;
    b.updateContract(c2.id, { contract_number: 'HĐ-ISO-2' });
    await b.flush(dbB);
    await a.sync(dbA, 'json');
    a.createContract({ contract_number: old, title: 'reuse', contract_type: 'service', party_a: 'A', party_b: 'B', signed_date: '2026-01-01', start_date: '2026-01-01', status: 'active', value: 0, currency: 'VND' } as any);
    await expect(a.flush(dbA)).rejects.toBeInstanceOf(NumberConflictError);
  });

  it('registers historical numbers once, keeps duplicates editable and reports them', async () => {
    const { rawA, dbA } = twoIsolates();
    const data = withSeedDefaults(null);
    data.documents = [
      { ...data.documents[0], id: 'old-1', document_number: 'ĐẾN-2025-0001', doc_type: 'incoming', created_at: '2025-01-01' },
      { ...data.documents[0], id: 'old-2', document_number: 'ĐẾN-2025-0001', doc_type: 'incoming', created_at: '2025-02-01' },
    ];
    await importLegacyDataset(dbA, data, 'seed');
    const s = new MemoryStore();
    await s.sync(dbA, 'json');
    const meta = JSON.parse(rawA.prepare("SELECT value FROM meta WHERE key = 'number_registry_backfill'").get().value);
    expect(meta.duplicates).toEqual([{ scope: 'doc:incoming', number: 'đến-2025-0001', record_ids: ['old-1', 'old-2'] }]);
    expect(rawA.prepare("SELECT record_id FROM number_registry WHERE number_norm = 'đến-2025-0001'").get().record_id).toBe('old-1');
    s.updateDocument('old-2', { notes: 'vẫn sửa được' });
    await s.flush(dbA);
    expect(rawA.prepare("SELECT notes FROM documents WHERE id = 'old-2'").get().notes).toBe('vẫn sửa được');
  });

  it('never re-issues the number of a trashed record (API and Excel import)', async () => {
    store.reset();
    const d = (await json(await as('admin_root', '/api/documents', send('POST', { doc_type: 'outgoing', document_number: 'QĐ-THU-01', title: 'x' }))));
    await as('admin_root', `/api/documents/${d.id}`, { method: 'DELETE' });
    const again = await as('admin_root', '/api/documents', send('POST', { doc_type: 'outgoing', document_number: 'QĐ-THU-01', title: 'y' }));
    expect(again.status).toBe(409);
    const imp = await json(await as('admin_root', '/api/documents/import/preview', send('POST', { rows: [{ document_number: 'QĐ-THU-01', title: 'z', doc_type: 'outgoing' }] })));
    expect(imp.rows[0].action).toBe('error');
  });

  it('uses the Vietnamese year for numbering', async () => {
    store.reset();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-12-31T18:30:00Z')); // already 1 Jan 2027 in Vietnam
    expect(store.getNextDocumentNumber('incoming')).toMatch(/^ĐẾN-2027-/);
    expect(store.getNextDocumentNumber('outgoing', 'CV', 'HCNS')).toMatch(/^\d{4}\/2027\//);
  });
});

// ---------------------------------------------------------------------------
describe('B4 — PATCH/PUT cannot skip the workflow', () => {
  beforeEach(() => store.reset());

  async function draft() {
    return json(await as('admin_root', '/api/documents', send('POST', { doc_type: 'outgoing', document_number: `${Math.floor(Math.random() * 9000 + 1000)}/2026/CV-X`, title: 'Dự thảo' })));
  }

  it('refuses jumps, unknown statuses and missing step fields', async () => {
    const d = await draft();
    const jump = await as('admin_root', `/api/documents/${d.id}`, send('PATCH', { status: 'Đã gửi', signer: 'GĐ' }));
    expect((await json(jump)).code).toBe('TRANSITION_NOT_ALLOWED');
    const unknown = await as('admin_root', `/api/documents/${d.id}`, send('PATCH', { status: 'Trạng thái lạ' }));
    expect((await json(unknown)).code).toBe('STATUS_INVALID');
    await as('admin_root', `/api/documents/${d.id}`, send('PATCH', { status: 'Trình ký' }));
    const noSigner = await as('admin_root', `/api/documents/${d.id}`, send('PATCH', { status: 'Đã ký - chờ gửi' }));
    expect((await json(noSigner)).code).toBe('TRANSITION_FIELD_REQUIRED');
    const ok = await as('admin_root', `/api/documents/${d.id}`, send('PUT', { status: 'Đã ký', signer: 'GĐ' }));
    expect((await json(ok)).status).toBe('Đã ký - chờ gửi');
  });

  it('allows an audited exception only with a reason and the step requirements', async () => {
    const d = await draft();
    const noSigner = await as('admin_root', `/api/documents/${d.id}`, send('PATCH', { status: 'Đã gửi', status_override_reason: 'Nhập bù sổ cũ' }));
    expect((await json(noSigner)).code).toBe('TRANSITION_FIELD_REQUIRED');
    const res = await as('admin_root', `/api/documents/${d.id}`, send('PATCH', { status: 'Đã gửi', signer: 'GĐ', status_override_reason: 'Nhập bù sổ cũ' }));
    expect(res.status).toBe(200);
    const saved = await json(res);
    expect(saved.issued_at).toBeTruthy();
    const { history } = await json(await as('admin_root', `/api/history/document/${d.id}`));
    expect(history[0].action).toBe('status_override');
    expect(store.getAuditLogs(5).some((l) => /ngoài quy trình.*Nhập bù sổ cũ/.test(l.details || ''))).toBe(true);
  });

  it('requires a handler when assigning an incoming document by PATCH, and validates statuses at creation', async () => {
    const inc = await json(await as('admin_root', '/api/documents', send('POST', { doc_type: 'incoming', document_number: 'ĐẾN-2026-0777', title: 'x' })));
    const res = await as('admin_root', `/api/documents/${inc.id}`, send('PATCH', { status: 'Đã phân công' }));
    expect((await json(res)).code).toBe('TRANSITION_FIELD_REQUIRED');
    const issuedNoSigner = await as('admin_root', '/api/documents', send('POST', { doc_type: 'outgoing', document_number: '0778/2026/CV-X', title: 'x', status: 'Đã gửi' }));
    expect((await json(issuedNoSigner)).code).toBe('TRANSITION_FIELD_REQUIRED');
    const bad = await as('admin_root', '/api/documents', send('POST', { doc_type: 'outgoing', document_number: '0779/2026/CV-X', title: 'x', status: 'Linh tinh' }));
    expect((await json(bad)).code).toBe('STATUS_INVALID');
  });

  it('keeps legacy statuses readable without inventing a stage', async () => {
    const doc = store.getDocuments().find((d) => d.doc_type === 'incoming')!;
    store.updateDocument(doc.id, { status: 'Trạng thái cũ' });
    const got = await json(await as('admin_root', `/api/documents/${doc.id}`));
    expect(got.status).toBe('Trạng thái cũ');
    expect(got.allowed_transitions).toEqual([]);
    const move = await as('admin_root', `/api/documents/${doc.id}/transition`, send('POST', { to: 'assigned', handler: 'A' }));
    expect((await json(move)).code).toBe('TRANSITION_NOT_ALLOWED');
  });
});

// ---------------------------------------------------------------------------
describe('B5 — every change carries the revision it was based on', () => {
  beforeEach(() => store.reset());

  it('rejects changes without expected_revision on every record endpoint', async () => {
    const doc = store.getDocuments().find((d) => d.doc_type === 'incoming')!;
    const contract = store.getContracts().find((c) => c.contract_type !== 'labor' && (c.status || 'active') === 'active')!;
    const att = new FormData();
    att.append('file', new Blob(['x']), 'x.pdf');
    const cases: Array<[string, RequestInit & { rawRevision?: boolean }]> = [
      [`/api/documents/${doc.id}`, raw('PATCH', { notes: 'x' })],
      [`/api/documents/${doc.id}`, raw('PUT', { notes: 'x' })],
      [`/api/documents/${doc.id}/transition`, raw('POST', { to: 'assigned', handler: 'A' })],
      [`/api/contracts/${contract.id}`, raw('PATCH', { notes: 'x' })],
      [`/api/contracts/${contract.id}/terminate`, raw('POST', { reason: 'x' })],
      [`/api/contracts/${contract.id}/liquidate`, raw('PATCH', {})],
      [`/api/contracts/${contract.id}/appendices`, raw('POST', { appendix_number: 'P', title: 'T', signed_date: '2026-12-01' })],
      [`/api/contracts/${contract.id}/links`, raw('PUT', { links: [] })],
      ['/api/files/sync-drive', raw('POST', { id: doc.id, type: 'document', drive_url: 'https://drive.google.com/x' })],
      [`/api/attachments/document/${doc.id}`, { method: 'POST', body: att, rawRevision: true }],
    ];
    for (const [p, init] of cases) {
      const res = await as('admin_root', p, init);
      expect(res.status, `${init.method} ${p}`).toBe(428);
      expect((await json(res)).code).toBe('REVISION_REQUIRED');
    }
  });

  it('stale revisions get 409 on every endpoint, and the stored record is untouched', async () => {
    const contract = store.getContracts().find((c) => c.contract_type !== 'labor')!;
    const stale = contract.revision ?? 0;
    store.updateContract(contract.id, { notes: 'người khác sửa' });
    for (const [p, init] of [
      [`/api/contracts/${contract.id}`, raw('PATCH', { notes: 'tôi', expected_revision: stale })],
      [`/api/contracts/${contract.id}/appendices`, raw('POST', { appendix_number: 'P', title: 'T', signed_date: '2026-12-01', expected_revision: stale })],
    ] as const) {
      expect((await as('admin_root', p, init)).status, p).toBe(409);
    }
    expect(store.getContract(contract.id)!.notes).toBe('người khác sửa');
  });

  it('two isolates editing one record: the second write is refused by the database', async () => {
    const { dbA, dbB, rawA } = twoIsolates();
    await importLegacyDataset(dbA, withSeedDefaults(null), 'seed');
    const a = new MemoryStore();
    const b = new MemoryStore();
    await a.sync(dbA, 'json');
    await b.sync(dbB, 'json');
    const id = a.getContracts()[0].id;
    a.updateContract(id, { notes: 'A' });
    b.updateContract(id, { notes: 'B' });
    await a.flush(dbA);
    await expect(b.flush(dbB)).rejects.toBeInstanceOf(RevisionConflictError);
    expect(rawA.prepare('SELECT notes FROM contracts WHERE id = ?').get(id).notes).toBe('A');
  });
});

// ---------------------------------------------------------------------------
describe('B6 — statistics only count what the user may read', () => {
  beforeEach(() => store.reset());

  it('hides confidential documents and labor contracts from counts', async () => {
    const docs = store.getDocuments();
    store.updateDocument(docs[0].id, { security_level: 'Mật', doc_type: 'incoming' });
    store.updateDocument(docs[1].id, { security_level: 'Tối mật', doc_type: 'incoming' });
    const adminStats = await json(await as('admin_root', '/api/stats'));
    const userStats = await json(await as('user_viewer', '/api/stats'));
    const { isConfidentialLevel } = await import('../src/server/utils/access.ts');
    const hidden = store.getDocuments().filter((d) => isConfidentialLevel(d.security_level));
    expect(hidden.length).toBeGreaterThanOrEqual(2);
    expect(adminStats.totalDocuments - userStats.totalDocuments).toBe(hidden.length);
    expect(adminStats.totalIncoming - userStats.totalIncoming).toBe(hidden.filter((d) => d.doc_type === 'incoming').length);
    const userList = await json(await as('user_viewer', '/api/documents'));
    expect(userStats.totalDocuments).toBe(userList.length);
    expect(userStats.totalLaborContracts).toBe(0);

    const cleared = makeUser('sec_s', { can_access_confidential_documents: true });
    expect((await json(await as(cleared, '/api/stats'))).totalDocuments).toBe(adminStats.totalDocuments);
  });
});

// ---------------------------------------------------------------------------
describe('Other review items', () => {
  beforeEach(() => store.reset());

  it('import log is written in the same transaction: a failed import leaves no log row', async () => {
    const db = await getDatabase();
    await db.prepare("INSERT INTO number_registry (scope, number_norm, number_display, record_type, record_id, registered_at) VALUES ('contract', 'imp-race-1', 'IMP-RACE-1', 'contract', 'elsewhere', '2026-01-01')").run();
    const before = (await db.prepare('SELECT COUNT(*) AS n FROM import_batches').first<any>()).n;
    const res = await as('admin_root', '/api/contracts/bulk-import', send('POST', { rows: [{ contract_number: 'IMP-RACE-1', title: 'x', party_a: 'A', party_b: 'B', signed_date: '2026-01-01', start_date: '2026-01-01' }] }));
    expect(res.status).toBe(409);
    expect((await json(res)).code).toBe('RECORD_NUMBER_TAKEN');
    expect((await db.prepare('SELECT COUNT(*) AS n FROM import_batches').first<any>()).n).toBe(before);
  });

  it('Excel import cannot renumber, change status, security level or issued documents', async () => {
    const doc = store.getDocuments().find((d) => d.doc_type === 'incoming')!;
    const rows = [
      { id: doc.id, document_number: 'SỐ-MỚI', title: doc.title },
      { id: doc.id, document_number: doc.document_number, status: 'Lưu trữ' },
    ];
    const p1 = await json(await as('admin_root', '/api/documents/import/preview', send('POST', { rows: [rows[0]] })));
    expect(p1.rows[0].errors.join()).toMatch(/không đổi số/);
    const p2 = await json(await as('admin_root', '/api/documents/import/preview', send('POST', { rows: [{ document_number: doc.document_number, status: 'Lưu trữ' }] })));
    expect(p2.rows[0].errors.join()).toMatch(/trạng thái/);
    const p3 = await json(await as('admin_root', '/api/documents/import/preview', send('POST', { rows: [{ document_number: doc.document_number, security_level: 'Mật' }] })));
    expect(p3.rows[0].errors.join()).toMatch(/độ mật/);
  });

  it('upload rollback also removes the upload registration', async () => {
    const db = await getDatabase();
    const spy = vi.spyOn(store, 'persistAsync').mockImplementationOnce(async () => {
      (store as any).stale = true;
      throw new Error('D1 unavailable');
    });
    const form = new FormData();
    for (const [k, v] of Object.entries({ document_number: 'ĐẾN-2026-0888', title: 'x', doc_type: 'incoming' })) form.append(k, v);
    form.append('file', new Blob(['%PDF']), 'rb.pdf');
    const before = (await db.prepare('SELECT COUNT(*) AS n FROM file_uploads').first<any>()).n;
    const res = await as('admin_root', '/api/documents', { method: 'POST', body: form });
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect((await db.prepare('SELECT COUNT(*) AS n FROM file_uploads').first<any>()).n).toBe(before);
  });

  it('contracts without a status are treated as in force everywhere', async () => {
    for (const c of store.getContracts()) store.trashRecord('contract', c.id, 'admin_root');
    const c = store.createContract({ contract_number: 'HĐ-NULL', title: 'x', contract_type: 'service', party_a: 'A', party_b: 'B', signed_date: '2026-01-01', start_date: '2026-01-01', value: 100, currency: 'USD' } as any);
    (store as any).contracts.get(c.id).status = null;
    const stats = await json(await as('admin_root', '/api/stats'));
    expect(stats.valueByCurrency).toEqual({ USD: 100 });
    const res = await as('admin_root', `/api/contracts/${c.id}/liquidate`, send('PATCH', { date: '2026-06-01' }));
    expect(res.status).toBe(200);
  });

  it('history and attachments of trashed records are admin-only', async () => {
    const doc = store.getDocuments()[0];
    await as('admin_root', `/api/documents/${doc.id}`, { method: 'DELETE' });
    expect((await as('user_viewer', `/api/history/document/${doc.id}`)).status).toBe(404);
    expect((await as('admin_root', `/api/history/document/${doc.id}`)).status).toBe(200);
    expect((await as('user_viewer', `/api/attachments/document/${doc.id}`)).status).toBe(404);
  });
});
