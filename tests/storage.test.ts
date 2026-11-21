import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { app } from '../src/server/index.ts';
import { store } from '../src/server/db/store.ts';
import { getDatabase } from '../src/server/db/database.ts';
import { UPLOADS_DIR } from '../src/server/utils/fileStorage.ts';
import { tokenFor, fetchAs } from './setup.ts';

const as = (userId: string, p: string, init: RequestInit & { rawRevision?: boolean } = {}) => fetchAs(userId, p, init);
const admin = (p: string, init?: RequestInit) => as('admin_root', p, init);
const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const filesOnDisk = () => (fs.existsSync(UPLOADS_DIR) ? fs.readdirSync(UPLOADS_DIR) : []);

function docForm(fields: Record<string, string>, file?: { name: string; content: string }) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  if (file) form.append('file', new Blob([file.content]), file.name);
  return form;
}

async function createDocWithFile(number = 'ĐẾN-2026-5001') {
  const res = await admin('/api/documents', {
    method: 'POST',
    body: docForm({ document_number: number, title: 'Văn bản có tệp', doc_type: 'incoming' }, { name: 'goc.pdf', content: '%PDF v1' }),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as any;
}

async function addAttachment(docId: string, name: string, content: string, replaces?: string) {
  const form = new FormData();
  form.append('file', new Blob([content]), name);
  if (replaces) form.append('replaces', replaces);
  return admin(`/api/attachments/document/${docId}`, { method: 'POST', body: form });
}

describe('Attachments: several files per record, with versions', () => {
  beforeEach(() => store.reset());

  it('records name, size, type and SHA-256 for the file stored with a new record', async () => {
    const doc = await createDocWithFile();
    const list = (await (await admin(`/api/attachments/document/${doc.id}`)).json()) as any;
    expect(list.attachments).toHaveLength(1);
    const att = list.attachments[0];
    expect(att).toMatchObject({ original_name: 'goc.pdf', size: 7, mime_type: 'application/pdf', version: 1, is_current: true });
    expect(att.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(att.file_key).toBe(doc.file_key);
  });

  it('adds more files and replaces one with a new version, keeping the old one', async () => {
    const doc = await createDocWithFile('ĐẾN-2026-5002');
    const first = ((await (await admin(`/api/attachments/document/${doc.id}`)).json()) as any).attachments[0];

    expect((await addAttachment(doc.id, 'phu-luc.pdf', '%PDF annex')).status).toBe(201);
    const replaced = await addAttachment(doc.id, 'goc-v2.pdf', '%PDF v2', first.id);
    expect(replaced.status).toBe(201);
    const body = (await replaced.json()) as any;
    expect(body.attachment.version).toBe(2);
    // The record's primary file follows the new version
    expect(body.record.file_key).toBe(body.attachment.file_key);
    expect(body.record.file_name).toBe('goc-v2.pdf');

    const current = ((await (await admin(`/api/attachments/document/${doc.id}`)).json()) as any).attachments;
    expect(current.map((a: any) => a.original_name).sort()).toEqual(['goc-v2.pdf', 'phu-luc.pdf']);
    const all = ((await (await admin(`/api/attachments/document/${doc.id}?versions=1`)).json()) as any).attachments;
    expect(all).toHaveLength(3);
    // The old version is still downloadable
    expect((await admin(`/api/files/${first.file_key}`)).status).toBe(200);
  });

  it('removing the primary attachment promotes another one', async () => {
    const doc = await createDocWithFile('ĐẾN-2026-5003');
    await addAttachment(doc.id, 'khac.pdf', '%PDF other');
    const [primary] = ((await (await admin(`/api/attachments/document/${doc.id}`)).json()) as any).attachments;
    const res = await admin(`/api/attachments/${primary.id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(store.getDocument(doc.id)!.file_name).toBe('khac.pdf');
  });

  it('shows a pre-migration single file as version 1', async () => {
    const doc = store.getDocuments().find((d) => d.file_key?.startsWith('samples/'))!;
    const list = ((await (await admin(`/api/attachments/document/${doc.id}`)).json()) as any).attachments;
    expect(list).toHaveLength(1);
    expect(list[0].file_key).toBe(doc.file_key);
  });

  it('read-only users can list but not add files', async () => {
    const doc = await createDocWithFile('ĐẾN-2026-5004');
    expect((await as('user_viewer', `/api/attachments/document/${doc.id}`)).status).toBe(200);
    const form = new FormData();
    form.append('file', new Blob(['x']), 'x.pdf');
    expect((await as('user_viewer', `/api/attachments/document/${doc.id}`, { method: 'POST', body: form })).status).toBe(403);
  });
});

describe('Saving: no success and no orphan file when the database write fails', () => {
  beforeEach(() => store.reset());

  it('rolls the uploaded file back and returns an error', async () => {
    const before = filesOnDisk().length;
    const spy = vi.spyOn(store, 'persistAsync').mockImplementationOnce(async () => {
      // what a failed D1 commit does: the cache is discarded on the next request
      (store as any).stale = true;
      throw new Error('D1 unavailable');
    });
    const res = await admin('/api/documents', {
      method: 'POST',
      body: docForm({ document_number: 'ĐẾN-2026-5999', title: 'Sẽ lỗi', doc_type: 'incoming' }, { name: 'a.pdf', content: '%PDF' }),
    });
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(filesOnDisk().length).toBe(before);
    const list = (await (await admin('/api/documents')).json()) as any[];
    expect(list.some((d) => d.document_number === 'ĐẾN-2026-5999')).toBe(false);
  });
});

describe('Trash: soft delete, restore, permanent delete', () => {
  beforeEach(() => store.reset());

  it('moves a document to the trash and restores it', async () => {
    const doc = await createDocWithFile('ĐẾN-2026-6001');
    expect((await admin(`/api/documents/${doc.id}`, { method: 'DELETE' })).status).toBe(200);
    expect((await admin(`/api/documents/${doc.id}`)).status).toBe(404);
    const list = (await (await admin('/api/documents')).json()) as any[];
    expect(list.some((d) => d.id === doc.id)).toBe(false);
    const trash = (await (await admin('/api/trash')).json()) as any;
    expect(trash.documents.map((d: any) => d.id)).toContain(doc.id);
    expect((await as('user_viewer', '/api/trash')).status).toBe(403);

    expect((await admin(`/api/trash/document/${doc.id}/restore`, { method: 'POST' })).status).toBe(200);
    expect((await admin(`/api/documents/${doc.id}`)).status).toBe(200);
  });

  it('permanent delete removes the record and its unreferenced files', async () => {
    const doc = await createDocWithFile('ĐẾN-2026-6002');
    const file = path.join(path.dirname(UPLOADS_DIR), doc.file_key);
    expect(fs.existsSync(file)).toBe(true);
    await admin(`/api/documents/${doc.id}`, { method: 'DELETE' });
    const res = await admin(`/api/trash/document/${doc.id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).removed_files).toEqual([doc.file_key]);
    expect(fs.existsSync(file)).toBe(false);
    expect(store.getDocument(doc.id, { includeDeleted: true })).toBeNull();
  });

  it('applies to contracts and partners too', async () => {
    const c = store.getContracts().find((ct) => ct.contract_type !== 'labor')!;
    await admin(`/api/contracts/${c.id}`, { method: 'DELETE' });
    expect((await admin(`/api/contracts/${c.id}`)).status).toBe(404);
    const p = store.getPartners()[0];
    await admin(`/api/partners/${p.id}`, { method: 'DELETE' });
    const trash = (await (await admin('/api/trash')).json()) as any;
    expect(trash.contracts.map((x: any) => x.id)).toContain(c.id);
    expect(trash.partners.map((x: any) => x.id)).toContain(p.id);
    expect((await admin(`/api/trash/partner/${p.id}/restore`, { method: 'POST' })).status).toBe(200);
    expect(store.getPartner(p.id)).not.toBeNull();
  });
});

describe('Edit history', () => {
  beforeEach(() => store.reset());

  it('stores field-level changes of each save in the database', async () => {
    const doc = store.getDocuments()[0];
    await admin(`/api/documents/${doc.id}`, json('PATCH', { title: 'Tiêu đề mới', notes: 'Ghi chú' }));
    const { history } = (await (await admin(`/api/history/document/${doc.id}`)).json()) as any;
    const update = history.find((h: any) => h.action === 'update');
    expect(update.changes.title).toEqual([doc.title, 'Tiêu đề mới']);
    expect(update.changed_by).toBe('admin_root');
    expect(update.changes.updated_at).toBeUndefined();

    const db = await getDatabase();
    const row = await db.prepare('SELECT COUNT(*) AS n FROM record_history WHERE record_id = ?').bind(doc.id).first<{ n: number }>();
    expect(row!.n).toBeGreaterThan(0);
  });

  it('records creation, deletion and restore', async () => {
    const doc = await createDocWithFile('ĐẾN-2026-6003');
    await admin(`/api/documents/${doc.id}`, { method: 'DELETE' });
    await admin(`/api/trash/document/${doc.id}/restore`, { method: 'POST' });
    const { history } = (await (await admin(`/api/history/document/${doc.id}`)).json()) as any;
    expect(history.map((h: any) => h.action).sort()).toEqual(['create', 'delete', 'restore']);
  });

  it('hides history of records the user cannot read', async () => {
    const doc = store.getDocuments()[0];
    store.updateDocument(doc.id, { security_level: 'Mật' });
    expect((await as('user_viewer', `/api/history/document/${doc.id}`)).status).toBe(403);
  });
});

describe('Paper archive location', () => {
  beforeEach(() => store.reset());

  it('builds storage_location from Kho / Tủ / Ngăn / Hộp', async () => {
    const doc = store.getDocuments()[0];
    const res = await admin(`/api/documents/${doc.id}`, json('PATCH', { storage_warehouse: 'A', storage_cabinet: '02', storage_shelf: '3', storage_box: '15' }));
    expect(((await res.json()) as any).storage_location).toBe('Kho A / Tủ 02 / Ngăn 3 / Hộp 15');
  });
});

describe('Google Drive is a link, not a sync', () => {
  beforeEach(() => store.reset());

  it('says so in the response', async () => {
    const doc = store.getDocuments()[0];
    const res = await admin('/api/files/sync-drive', json('POST', { id: doc.id, type: 'document', drive_url: 'https://drive.google.com/file/d/x' }));
    expect(((await res.json()) as any).link_only).toBe(true);
  });
});

describe('D1/R2 reconciliation', () => {
  beforeEach(() => store.reset());

  it('reports referenced files that are missing and stored files nobody uses', async () => {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    const orphan = path.join(UPLOADS_DIR, 'old_orphan.pdf');
    fs.writeFileSync(orphan, 'x');
    const old = new Date(Date.now() - 3 * 24 * 3600_000);
    fs.utimesSync(orphan, old, old);
    const doc = store.getDocuments()[0];
    store.updateDocument(doc.id, { file_key: 'uploads/gone.pdf' });

    const res = await admin('/api/admin/storage-check');
    expect(res.status).toBe(200);
    const report = (await res.json()) as any;
    expect(report.missing).toContain('uploads/gone.pdf');
    expect(report.orphans.map((o: any) => o.key)).toContain('uploads/old_orphan.pdf');
    expect(report.ok).toBe(false);
    // Read-only: nothing was deleted
    expect(fs.existsSync(orphan)).toBe(true);
    fs.unlinkSync(orphan);
    expect((await as('user_viewer', '/api/admin/storage-check')).status).toBe(403);
  });
});
