import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/server/index.ts';
import { store, MemoryStore } from '../src/server/db/store.ts';
import { getDatabase, applyLocalMigrations, __createNodeDatabaseForTests } from '../src/server/db/database.ts';
import { importLegacyDataset } from '../src/server/db/repository.ts';
import { withSeedDefaults } from '../src/server/db/persistence.ts';
import { allocateDocumentNumber } from '../src/server/utils/numbering.ts';
import { vietnamToday, stageOf } from '../src/server/utils/workflow.ts';
import { tokenFor, fetchAs } from './setup.ts';

const { DatabaseSync } = (process as any).getBuiltinModule('node:sqlite');

const as = (userId: string, p: string, init: RequestInit & { rawRevision?: boolean } = {}) => fetchAs(userId, p, init);
const admin = (p: string, init?: RequestInit) => as('admin_root', p, init);
const send = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const post = (p: string, body: unknown) => admin(p, send('POST', body));
const patch = (p: string, body: unknown) => admin(p, send('PATCH', body));
const body = async (res: Response) => (await res.json()) as any;

describe('Vietnam time zone', () => {
  it('uses the Vietnamese calendar day for dates set by the server', () => {
    expect(vietnamToday(new Date('2026-11-20T18:30:00Z'))).toBe('2026-11-21');
    expect(vietnamToday(new Date('2026-11-20T16:59:00Z'))).toBe('2026-11-20');
  });
});

describe('Incoming documents (công văn đến)', () => {
  beforeEach(() => store.reset());

  it('keeps the register number separate from the sender number', async () => {
    const res = await post('/api/documents', {
      doc_type: 'incoming',
      document_number: '15/CV-UBND',
      original_doc_number: '15/CV-UBND',
      title: 'X',
    });
    expect(res.status).toBe(400);
    expect((await body(res)).code).toBe('INCOMING_NUMBER_SAME_AS_ORIGINAL');
  });

  it('starts as received, records the receipt date, and logs assignment and directives', async () => {
    const created = await body(await post('/api/documents', { doc_type: 'incoming', document_number: 'ĐẾN-2026-0300', original_doc_number: '15/CV-UBND', title: 'Công văn' }));
    expect(created.status).toBe('Chưa phân công');
    expect(created.received_date).toBe(vietnamToday());

    const noHandler = await post(`/api/documents/${created.id}/transition`, { to: 'assigned' });
    expect((await body(noHandler)).code).toBe('TRANSITION_FIELD_REQUIRED');
    const assigned = await body(
      await post(`/api/documents/${created.id}/transition`, { to: 'assigned', handler: 'Người Xử Lý A', due_date: '2026-12-01', directive: 'Báo cáo trước 01/12' })
    );
    expect(assigned.status).toBe('Đã phân công');
    expect(assigned.directive_log).toHaveLength(1);
    expect(assigned.directive_log[0]).toMatchObject({ handler: 'Người Xử Lý A', directive: 'Báo cáo trước 01/12', due_date: '2026-12-01', by: 'admin_root' });

    const skip = await post(`/api/documents/${created.id}/transition`, { to: 'archived' });
    expect((await body(skip)).code).toBe('TRANSITION_NOT_ALLOWED');

    await post(`/api/documents/${created.id}/transition`, { to: 'processing' });
    const done = await body(await post(`/api/documents/${created.id}/transition`, { to: 'completed' }));
    expect(done.status).toBe('Hoàn thành');
    expect(done.completed_date).toBe(vietnamToday());
    const archived = await body(await post(`/api/documents/${created.id}/transition`, { to: 'archived' }));
    expect(archived.status).toBe('Lưu trữ');
    expect(archived.directive_log.length).toBeGreaterThanOrEqual(4);
  });

  it('maps legacy statuses onto the workflow', () => {
    expect(stageOf('incoming', 'Quá hạn').code).toBe('processing');
    expect(stageOf('incoming', 'Chờ tiếp nhận').code).toBe('received');
    expect(stageOf('outgoing', 'Đã gửi').code).toBe('issued');
  });
});

describe('Outgoing documents (công văn đi)', () => {
  beforeEach(() => store.reset());

  async function draft(number = '0500/2026/CV-HCNS') {
    return body(await post('/api/documents', { doc_type: 'outgoing', document_number: number, title: 'Công văn đi', recipient: 'Sở A' }));
  }

  it('is a draft when created, never issued by default', async () => {
    expect((await draft()).status).toBe('Dự thảo');
  });

  it('goes draft → pending signature → signed → issued, requiring a signer', async () => {
    const d = await draft();
    await post(`/api/documents/${d.id}/transition`, { to: 'pending_signature' });
    expect((await body(await post(`/api/documents/${d.id}/transition`, { to: 'signed' }))).code).toBe('TRANSITION_FIELD_REQUIRED');
    await post(`/api/documents/${d.id}/transition`, { to: 'signed', signer: 'Giám đốc' });
    const issued = await body(await post(`/api/documents/${d.id}/transition`, { to: 'issued' }));
    expect(issued.status).toBe('Đã gửi');
    expect(issued.issued_at).toBeTruthy();
  });

  it('requires and logs a reason for changes after issuance', async () => {
    const d = await draft();
    for (const step of [{ to: 'pending_signature' }, { to: 'signed', signer: 'GĐ' }, { to: 'issued' }]) {
      await post(`/api/documents/${d.id}/transition`, step);
    }
    const noReason = await patch(`/api/documents/${d.id}`, { title: 'Sửa tiêu đề' });
    expect(noReason.status).toBe(400);
    expect((await body(noReason)).code).toBe('ADJUSTMENT_REASON_REQUIRED');
    const ok = await body(await patch(`/api/documents/${d.id}`, { title: 'Sửa tiêu đề', adjustment_reason: 'Sai chính tả' }));
    expect(ok.title).toBe('Sửa tiêu đề');
    expect(ok.adjustments[0]).toMatchObject({ reason: 'Sai chính tả', fields: { title: ['Công văn đi', 'Sửa tiêu đề'] } });
    expect(ok.adjustment_reason).toBeUndefined();
    // Non-protected fields need no reason
    expect((await patch(`/api/documents/${d.id}`, { notes: 'ghi chú' })).status).toBe(200);
  });

  it('never hands out the same number twice', async () => {
    const a = await draft('0600/2026/CV-HCNS');
    const resB = await post('/api/documents', { doc_type: 'outgoing', document_number: '0600/2026/CV-HCNS', title: 'B' });
    const b = await body(resB);
    expect(resB.status).toBe(201);
    expect(b.document_number).not.toBe(a.document_number);
    expect(b.number_reassigned).toBe(true);
    // A manual (non-sequence) number that is taken is refused
    await post('/api/documents', { doc_type: 'outgoing', document_number: 'TB-ĐẶC-BIỆT', title: 'C' });
    const dup = await post('/api/documents', { doc_type: 'outgoing', document_number: 'TB-ĐẶC-BIỆT', title: 'D' });
    expect(dup.status).toBe(409);
    expect((await body(dup)).code).toBe('DOCUMENT_NUMBER_TAKEN');
  });

  it('allocates distinct numbers for concurrent requests', async () => {
    const db = await getDatabase();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => allocateDocumentNumber(db, 'outgoing', '0700/2026/QĐ-BGĐ', []))
    );
    expect(new Set(results.map((r) => r.number)).size).toBe(5);
  });
});

describe('Contracts', () => {
  beforeEach(() => store.reset());
  const base = { title: 'HĐ dịch vụ', contract_type: 'service', party_a: 'A', party_b: 'B', value: 1000, currency: 'USD', signed_date: '2026-01-10', start_date: '2026-01-15', end_date: '2026-12-31', status: 'active' };

  it('rejects inconsistent dates and duplicate numbers', async () => {
    const bad = await post('/api/contracts', { ...base, contract_number: 'HĐ-T-1', end_date: '2025-12-31' });
    expect((await body(bad)).code).toBe('CONTRACT_DATES_INVALID');
    expect((await post('/api/contracts', { ...base, contract_number: 'HĐ-T-1' })).status).toBe(201);
    const dup = await post('/api/contracts', { ...base, contract_number: 'hđ-t-1' });
    expect((await body(dup)).code).toBe('CONTRACT_NUMBER_TAKEN');
  });

  it('terminates with a reason and liquidates with a date', async () => {
    const c1 = await body(await post('/api/contracts', { ...base, contract_number: 'HĐ-T-2' }));
    expect((await body(await post(`/api/contracts/${c1.id}/terminate`, {}))).code).toBe('TERMINATION_REASON_REQUIRED');
    const terminated = await body(await post(`/api/contracts/${c1.id}/terminate`, { date: '2026-06-01', reason: 'Vi phạm' }));
    expect(terminated).toMatchObject({ status: 'terminated', termination_date: '2026-06-01', termination_reason: 'Vi phạm' });
    expect((await admin(`/api/contracts/${c1.id}/liquidate`, send('PATCH', {}))).status).toBe(400);

    const c2 = await body(await post('/api/contracts', { ...base, contract_number: 'HĐ-T-3' }));
    const early = await admin(`/api/contracts/${c2.id}/liquidate`, send('PATCH', { date: '2025-01-01' }));
    expect((await body(early)).code).toBe('CONTRACT_DATES_INVALID');
    const liq = await body(await admin(`/api/contracts/${c2.id}/liquidate`, send('PATCH', { date: '2026-07-01' })));
    expect(liq).toMatchObject({ status: 'liquidated', liquidation_date: '2026-07-01' });
  });

  it('adds appendices; a renewal extends the end date', async () => {
    const c = await body(await post('/api/contracts', { ...base, contract_number: 'HĐ-T-4' }));
    const shorter = await post(`/api/contracts/${c.id}/appendices`, { appendix_number: 'PL01', title: 'Gia hạn', signed_date: '2026-11-01', new_end_date: '2026-06-30' });
    expect((await body(shorter)).code).toBe('APPENDIX_INVALID');
    const res = await post(`/api/contracts/${c.id}/appendices`, { appendix_number: 'PL01', title: 'Gia hạn 1 năm', signed_date: '2026-11-01', new_end_date: '2027-12-31', new_value: 1500 });
    expect(res.status).toBe(201);
    const { contract } = await body(res);
    expect(contract.end_date).toBe('2027-12-31');
    expect(contract.value).toBe(1500);
    expect(contract.appendices[0]).toMatchObject({ appendix_number: 'PL01', previous_end_date: '2026-12-31', previous_value: 1000 });
    const dup = await post(`/api/contracts/${c.id}/appendices`, { appendix_number: 'pl01', title: 'X', signed_date: '2026-11-02' });
    expect((await body(dup)).code).toBe('APPENDIX_NUMBER_TAKEN');
  });

  it('links related records the user can read', async () => {
    const c = await body(await post('/api/contracts', { ...base, contract_number: 'HĐ-T-5' }));
    const doc = store.getDocuments()[0];
    const ok = await body(await admin(`/api/contracts/${c.id}/links`, send('PUT', { links: [{ type: 'document', id: doc.id }] })));
    expect(ok.linked_records).toEqual([{ type: 'document', id: doc.id }]);
    const bad = await admin(`/api/contracts/${c.id}/links`, send('PUT', { links: [{ type: 'document', id: 'nope' }] }));
    expect((await body(bad)).code).toBe('LINK_TARGET_INVALID');
  });

  it('never adds amounts in different currencies together', async () => {
    for (const c of store.getContracts()) store.trashRecord('contract', c.id, 'admin_root');
    await post('/api/contracts', { ...base, contract_number: 'HĐ-USD', value: 1000, currency: 'USD' });
    await post('/api/contracts', { ...base, contract_number: 'HĐ-VND', value: 25_000_000, currency: 'VND' });
    let stats = await body(await admin('/api/stats'));
    expect(stats.valueByCurrency).toEqual({ USD: 1000, VND: 25_000_000 });
    expect(stats.totalContractValue).toBeNull();
    expect(stats.missingExchangeRates).toEqual(['VND']);

    // 1 VND = 0.00004 USD (default currency) → 25,000,000 VND = 1,000 USD
    store.updateCurrency('VND', { exchange_rate: 0.00004 });
    stats = await body(await admin('/api/stats'));
    expect(stats.reportCurrency).toBe('USD');
    expect(stats.totalContractValue).toBe(2000);
  });
});

describe('Excel import: preview, confirmation, history', () => {
  beforeEach(() => store.reset());

  it('classifies rows and never overwrites silently', async () => {
    const existing = store.getContracts()[0];
    const rows = [
      { contract_number: existing.contract_number, title: 'Tên mới', party_a: 'A', party_b: 'B', signed_date: '2026-01-01', start_date: '2026-01-01' },
      { contract_number: 'IMP-NEW-1', title: 'Mới', party_a: 'A', party_b: 'B', signed_date: '2026-01-01', start_date: '2026-01-01' },
      { contract_number: 'IMP-NEW-1', title: 'Trùng trong file', party_a: 'A', party_b: 'B', signed_date: '2026-01-01', start_date: '2026-01-01' },
    ];
    const preview = await body(await post('/api/contracts/import/preview', { rows }));
    expect(preview.summary).toMatchObject({ total: 3, create: 1, update: 1, duplicate_in_file: 1, error: 0 });
    expect(preview.rows[0].changes.title).toEqual([existing.title, 'Tên mới']);

    const unconfirmed = await post('/api/contracts/bulk-import', { rows });
    expect(unconfirmed.status).toBe(409);
    expect((await body(unconfirmed)).code).toBe('IMPORT_CONFIRMATION_REQUIRED');
    expect(store.getContract(existing.id)!.title).toBe(existing.title);
    expect(store.getContracts().some((c) => c.contract_number === 'IMP-NEW-1')).toBe(false);

    const done = await body(await post('/api/contracts/bulk-import', { rows, confirm_updates: true, preview_fingerprint: preview.preview_fingerprint, file_name: 'hop-dong.xlsx' }));
    expect(done).toMatchObject({ added: 1, updated: 1, skipped: 1 });
    expect(store.getContract(existing.id)!.title).toBe('Tên mới');
    expect(store.getContracts().filter((c) => c.contract_number === 'IMP-NEW-1')).toHaveLength(1);

    const log = await body(await admin('/api/imports'));
    expect(log.imports[0]).toMatchObject({ entity_type: 'contract', file_name: 'hop-dong.xlsx', added: 1, updated: 1, skipped: 1, imported_by: 'admin_root' });
    expect((await as('user_viewer', '/api/imports')).status).toBe(403);
  });

  it('refuses the whole file when a row is invalid', async () => {
    const res = await post('/api/documents/bulk-import', {
      rows: [
        { document_number: 'IMP-D-1', title: 'OK' },
        { document_number: 'IMP-D-2', title: 'Bad', file_key: 'javascript:alert(1)' },
      ],
    });
    expect(res.status).toBe(400);
    const b = await body(res);
    expect(b.code).toBe('IMPORT_HAS_ERRORS');
    expect(b.preview.rows[1].action).toBe('error');
    expect(store.getDocuments().some((d) => d.document_number === 'IMP-D-1')).toBe(false);
  });
});

describe('Concurrent edits: revision checked by the database write itself', () => {
  it('aborts a write based on a stale copy, even across isolates', async () => {
    const raw = new DatabaseSync(':memory:');
    applyLocalMigrations(raw);
    const db = __createNodeDatabaseForTests(raw);
    await importLegacyDataset(db, withSeedDefaults(null), 'seed');
    const a = new MemoryStore();
    const b = new MemoryStore();
    await a.sync(db, 'json');
    await b.sync(db, 'json');
    const id = a.getDocuments()[0].id;

    a.updateDocument(id, { title: 'Sửa bởi A' });
    await a.flush(db);
    // B never saw A's commit (no sync in between) and edits the same record
    b.updateDocument(id, { title: 'Sửa bởi B' });
    await expect(b.flush(db)).rejects.toThrow(/changed by someone else/);

    const row = raw.prepare('SELECT title FROM documents WHERE id = ?').get(id);
    expect(row.title).toBe('Sửa bởi A');
    // After reloading, B can save on top of A's version
    await b.sync(db, 'json');
    b.updateDocument(id, { notes: 'B bổ sung' });
    await b.flush(db);
    expect(raw.prepare('SELECT title, notes FROM documents WHERE id = ?').get(id)).toMatchObject({ title: 'Sửa bởi A', notes: 'B bổ sung' });
  });

  it('returns 409 REVISION_CONFLICT from the API when the guard trips', async () => {
    store.reset();
    const doc = store.getDocuments()[0];
    const db = await getDatabase();
    await store.flush(db);
    // Another isolate saves the record directly in the database
    await db.prepare('UPDATE documents SET revision = COALESCE(revision, 0) + 5 WHERE id = ?').bind(doc.id).run();
    const res = await patch(`/api/documents/${doc.id}`, { notes: 'mine' });
    expect(res.status).toBe(409);
    expect((await body(res)).code).toBe('REVISION_CONFLICT');
  });
});
